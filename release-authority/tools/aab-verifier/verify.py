#!/usr/bin/env python3
"""Offline AAB verification for a trusted runner. Produces evidence, not authorization."""

import argparse
import hashlib
import json
import re
import stat
import struct
import subprocess
import unicodedata
from pathlib import Path
from xml.etree import ElementTree
from zipfile import BadZipFile, ZIP_DEFLATED, ZIP_STORED, ZipFile

ANDROID = "{http://schemas.android.com/apk/res/android}"
SIGNING_ENTRIES = {"META-INF/MANIFEST.MF", "META-INF/MANE.SF", "META-INF/MANE.RSA"}
MAX_ENTRIES = 10_000
MAX_ARCHIVE = 256 * 1024**2
MAX_ENTRY = 256 * 1024**2
MAX_EXPANDED = 1024**3
MAX_RATIO = 200


def file_sha(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def inspect_zip(path, *, signed=False):
    size = path.stat().st_size
    if not 26 <= size <= MAX_ARCHIVE:
        raise ValueError("Archive size outside policy")
    with path.open("rb") as raw:
        if raw.read(4) != b"PK\x03\x04":
            raise ValueError("Expected a ZIP local file header at byte zero")
        raw.seek(-22, 2)
        signature, disk, central_disk, disk_count, count, cd_size, cd_offset, comment = struct.unpack("<4s4H2LH", raw.read(22))
        if (
            signature != b"PK\x05\x06" or disk or central_disk or count != disk_count or comment
            or cd_offset + cd_size != size - 22
        ):
            raise ValueError("Expected a single ZIP without ZIP64, comments, or trailing data")
    with ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) != count or not 0 < len(entries) <= MAX_ENTRIES:
            raise ValueError("ZIP entry count outside policy")
        names = set()
        observed_names = set()
        content = {}
        expanded = 0
        for entry in entries:
            # orig_filename retains NULs that ZipInfo.filename would silently truncate.
            name = entry.orig_filename
            parts = name.rstrip("/").split("/")
            folded = name.rstrip("/").casefold()
            mode = (entry.external_attr >> 16) & 0o170000
            if (
                not name or name != unicodedata.normalize("NFC", name) or len(name.encode()) > 1024
                or name.endswith("//")
                or any(part in {"", ".", ".."} for part in parts)
                or any(unicodedata.category(character).startswith("C") for character in name)
                or "\\" in name or ":" in name or folded in names
                or mode not in {0, stat.S_IFREG, stat.S_IFDIR}
                or entry.flag_bits & 1 or entry.compress_type not in {ZIP_STORED, ZIP_DEFLATED}
            ):
                raise ValueError("Disallowed, duplicate, or ambiguous ZIP entry")
            names.add(folded)
            observed_names.add(name)
            expanded += entry.file_size
            if (
                expanded > MAX_EXPANDED or entry.file_size > MAX_ENTRY
                or entry.file_size > MAX_RATIO * max(entry.compress_size, 1)
                or (entry.is_dir() and entry.file_size)
            ):
                raise ValueError("ZIP expansion limits exceeded")
            if len(parts) == 2 and parts[0].upper() == "META-INF":
                item = parts[1].upper()
                if item == "MANIFEST.MF" or item.startswith("SIG-") or item.endswith((".SF", ".RSA", ".DSA", ".EC")):
                    if not signed or name not in SIGNING_ENTRIES:
                        raise ValueError("Unexpected signature metadata")
                    # Read to check CRC and bounds but exclude the permitted metadata from content equality.
                    with archive.open(entry) as stream:
                        hashlib.file_digest(stream, "sha256")
                    continue
            with archive.open(entry) as stream:
                content[name] = hashlib.file_digest(stream, "sha256").hexdigest()
        files = {name.casefold() for name in content if not name.endswith("/")}
        for name in content:
            parents = name.rstrip("/").split("/")[:-1]
            if any("/".join(parents[:i]).casefold() in files for i in range(1, len(parents) + 1)):
                raise ValueError("ZIP entry shadows a parent directory")
        if signed and not SIGNING_ENTRIES.issubset(observed_names):
            raise ValueError("Expected signing metadata is incomplete")
        if not {"BundleConfig.pb", "base/manifest/AndroidManifest.xml"}.issubset(content):
            raise ValueError("Required AAB entries are missing")
    return content


def bundletool(java, tool, command, bundle):
    return subprocess.run(
        [java, "-jar", str(tool), *command, f"--bundle={bundle}"],
        check=True, capture_output=True, timeout=120,
    ).stdout


def verify_identity(args, bundle):
    bundletool(args.java, args.bundletool, ("validate",), bundle)
    manifest = ElementTree.fromstring(bundletool(args.java, args.bundletool, ("dump", "manifest", "--module=base"), bundle))
    actual = (
        manifest.get("package"), manifest.get(ANDROID + "versionName"),
        manifest.get(ANDROID + "versionCode"),
    )
    if actual != (args.package, args.version_name, str(args.version_code)):
        raise ValueError("Package or version differs from the requested release")
    if args.commit:
        commits = [
            item.get(ANDROID + "value") for item in manifest.findall("./application/meta-data")
            if item.get(ANDROID + "name") == f"{args.package}.BUILD_COMMIT"
        ]
        if commits != [args.commit]:
            raise ValueError("Native manifest does not identify the expected commit")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundletool", required=True, type=Path)
    parser.add_argument("--java", default="java")
    parser.add_argument("--package", required=True)
    parser.add_argument("--version-name", required=True)
    parser.add_argument("--version-code", required=True, type=int)
    parser.add_argument("--commit")
    parser.add_argument("--unsigned", required=True, type=Path)
    parser.add_argument("--signed", type=Path)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{64}", args.sha256) or not 1 <= args.version_code <= 2_100_000_000:
        parser.error("Expected a lowercase SHA-256 and a valid Play version code")
    if args.commit and not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        parser.error("Expected a complete commit SHA when provided")
    try:
        unsigned_sha = file_sha(args.unsigned)
        if unsigned_sha != args.sha256:
            raise ValueError("Unsigned AAB digest mismatch")
        contents = inspect_zip(args.unsigned)
        verify_identity(args, args.unsigned)
        evidence = {"unsignedAabSha256": unsigned_sha, "packageName": args.package,
                    "versionName": args.version_name, "versionCode": args.version_code,
                    "unsignedEntryCount": len(contents)}
        if args.commit:
            evidence["commitSha"] = args.commit
        if args.signed:
            if inspect_zip(args.signed, signed=True) != contents:
                raise ValueError("Signed archive changed, added, or omitted a non-signature entry")
            verify_identity(args, args.signed)
            evidence["signedAabSha256"] = file_sha(args.signed)
    except (OSError, ValueError, BadZipFile, subprocess.SubprocessError, ElementTree.ParseError) as error:
        parser.exit(1, f"AAB rejected: {error}\n")
    print(json.dumps(evidence, sort_keys=True))


if __name__ == "__main__":
    main()
