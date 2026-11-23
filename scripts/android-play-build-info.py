#!/usr/bin/env python3
"""Validate the built Android manifest and record the release identity."""
import json
import os
import sys
from pathlib import Path
from xml.etree import ElementTree

ANDROID = "{http://schemas.android.com/apk/res/android}"
PACKAGE = "com.disnana.mane_chan"

manifest = ElementTree.parse(sys.argv[1]).getroot()
expected = json.loads(Path("apps/mobile/app.json").read_text())["expo"]
commit = os.environ["GITHUB_SHA"]
version = manifest.get(ANDROID + "versionName")
version_code = manifest.get(ANDROID + "versionCode")
commit_metadata = [
    node.get(ANDROID + "value")
    for node in manifest.findall("./application/meta-data")
    if node.get(ANDROID + "name") == PACKAGE + ".BUILD_COMMIT"
]
if (
    manifest.get("package") != PACKAGE or version != expected["version"]
    or version_code != str(expected["android"]["versionCode"]) or commit_metadata != [commit]
):
    raise SystemExit("Built AAB manifest does not match the source package, version, or commit")
with Path(os.environ["GITHUB_OUTPUT"]).open("a") as outputs:
    print(f"version={version}\nversion_code={version_code}", file=outputs)
print(f"Validated {PACKAGE} {version} ({version_code}) from {commit}")
