#!/usr/bin/env python3
"""Store a signed bundle in Play, with an optional legacy closed-test draft."""
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

PACKAGE = "com.disnana.mane_chan"
ROOT = "https://androidpublisher.googleapis.com"
SCOPE_PATH = f"/androidpublisher/v3/applications/{PACKAGE}/edits"
COMMIT_WITHOUT_REVIEW = "?changesNotSentForReview=true&changesInReviewBehavior=ERROR_IF_IN_REVIEW"


class PlayError(RuntimeError):
    pass


def publisher_request(method, path, body=None, *, media=None):
    headers = {"Authorization": "Bearer " + os.environ["PLAY_ACCESS_TOKEN"]}
    if media is not None:
        headers["Content-Type"] = "application/octet-stream"
        headers["Content-Length"] = str(os.fstat(media.fileno()).st_size)
        request = Request(ROOT + path, data=media, headers=headers, method=method)
    else:
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(ROOT + path, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=300 if media is not None else 45) as response:
            content = response.read()
    except HTTPError as error:
        try:
            message = json.loads(error.read())["error"]["message"]
        except (ValueError, KeyError, TypeError):
            message = error.reason
        raise PlayError(f"{method} {path}: HTTP {error.code} {message}") from None
    return json.loads(content) if content else {}


def upload_bundle(bundle, version_code, edit, *, expected_sha256=None):
    with bundle.open("rb") as signed:
        digest = hashlib.file_digest(signed, "sha256").hexdigest()
        if expected_sha256 is not None and digest != expected_sha256:
            raise PlayError("The local bundle SHA-256 differs from the verified artifact")
        signed.seek(0)
        uploaded = publisher_request(
            "POST", f"/upload{edit}/bundles?uploadType=media", media=signed,
        )
    if uploaded.get("versionCode") != version_code or uploaded.get("sha256") != digest:
        raise PlayError("The uploaded version code or SHA-256 differs from the signed bundle")


def discard_edit(edit):
    try:
        publisher_request("DELETE", edit)
    except (PlayError, URLError, TimeoutError):
        print("Play edit could not be discarded. Check Play Console before retrying.", file=sys.stderr)


def store_bundle_only(bundle, version_code, expected_sha256):
    if not 1 <= version_code <= 2_100_000_000 or not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise PlayError("Expected a Play version code and the verified lowercase SHA-256")
    with bundle.open("rb") as signed:
        if hashlib.file_digest(signed, "sha256").hexdigest() != expected_sha256:
            raise PlayError("The local bundle SHA-256 differs from the verified artifact")

    edit_id = quote(publisher_request("POST", SCOPE_PATH, {})["id"], safe="")
    edit = f"{SCOPE_PATH}/{edit_id}"
    commit_attempted = False
    try:
        existing = publisher_request("GET", f"{edit}/bundles").get("bundles", [])
        for item in existing:
            if item.get("versionCode") == version_code:
                if item.get("sha256") != expected_sha256:
                    raise PlayError("Play already stores a different bundle with this version code")
                return "already_present"

        upload_bundle(bundle, version_code, edit, expected_sha256=expected_sha256)
        publisher_request("POST", f"{edit}:validate")
        commit_attempted = True
        try:
            publisher_request("POST", f"{edit}:commit{COMMIT_WITHOUT_REVIEW}")
        except (PlayError, URLError, OSError, ValueError) as error:
            raise PlayError(
                f"Play commit did not confirm success. Check version {version_code} and SHA-256 "
                f"in Play Console before another upload. {error}"
            ) from None
        return "stored"
    finally:
        if not commit_attempted:
            discard_edit(edit)


def save_draft(bundle, track, version_code, release_name, notes):
    if (
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._()-]{0,99}", track)
        or track.casefold() in {"production", "beta", "open", "internal", "qa", "default"}
    ):
        raise PlayError("Configure the exact ID of an existing closed-test track")
    if len(notes) > 500:
        raise PlayError("Japanese release notes may contain up to 500 characters")

    edit_id = quote(publisher_request("POST", SCOPE_PATH, {})["id"], safe="")
    edit = f"{SCOPE_PATH}/{edit_id}"
    committed = False
    try:
        track_path = f"{edit}/tracks/{quote(track, safe='')}"
        current = publisher_request("GET", track_path)
        if current.get("track") != track:
            raise PlayError("Play did not return the configured closed-test track")
        releases = current.get("releases", [])
        if any(release.get("status") != "completed" for release in releases):
            raise PlayError("The target track already has a draft or an unfinished rollout")
        if any(str(version_code) in release.get("versionCodes", []) for release in releases):
            raise PlayError(f"Version code {version_code} is already on the target track")

        upload_bundle(bundle, version_code, edit)

        draft = {"name": release_name, "versionCodes": [str(version_code)], "status": "draft"}
        if notes:
            draft["releaseNotes"] = [{"language": "ja-JP", "text": notes}]
        updated = publisher_request(
            "PUT", track_path, {"track": track, "releases": [*releases, draft]},
        )
        if not any(
            release.get("status") == "draft" and str(version_code) in release.get("versionCodes", [])
            for release in updated.get("releases", [])
        ):
            raise PlayError("Play did not return the expected draft release")

        # Never retry with weaker flags. Play Console owns review and rollout.
        publisher_request("POST", f"{edit}:commit{COMMIT_WITHOUT_REVIEW}")
        committed = True
        print(f"Saved draft on {track} for version code {version_code}.")
    finally:
        if not committed:
            discard_edit(edit)


if __name__ == "__main__":
    try:
        if sys.argv[1:2] == ["--bundle-only"] and len(sys.argv) == 5:
            _, _, bundle, version_code, expected_sha256 = sys.argv
            result = store_bundle_only(Path(bundle), int(version_code), expected_sha256)
            print(f"Bundle {result}: version code {version_code}, SHA-256 {expected_sha256}")
        elif len(sys.argv) == 4 and sys.argv[1] != "--bundle-only":
            _, bundle, version_code, release_name = sys.argv
            save_draft(Path(bundle), os.environ["PLAY_CLOSED_TRACK"], int(version_code), release_name, os.environ.get("PLAY_RELEASE_NOTES", "").strip())
        else:
            sys.exit("Usage: android_play_draft.py --bundle-only AAB VERSION_CODE SHA256")
    except (PlayError, OSError, KeyError, ValueError) as error:
        sys.exit(str(error))
