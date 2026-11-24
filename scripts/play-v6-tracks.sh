#!/usr/bin/env bash
set -euo pipefail

token=$(gcloud auth print-access-token \
  --account=tp.link.z490@gmail.com \
  --impersonate-service-account=mane-release-publisher@disnana-428702.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/androidpublisher)

probe=$(mktemp -d)
trap 'rm -rf -- "$probe"' EXIT
raw=https://raw.githubusercontent.com/disnana/DisnanaMoneyManagement/fcaf4b0824e978cbdf65b75a40048348e0eb1f2e/scripts
curl -fsSL "$raw/android_play_draft.py" -o "$probe/android_play_draft.py"
cd "$probe"
PLAY_ACCESS_TOKEN="$token" python3 - <<'PYTHON'
from urllib.parse import quote

from android_play_draft import PACKAGE, SCOPE_PATH, PlayError, discard_edit, publisher_request

edit = f"{SCOPE_PATH}/{quote(publisher_request('POST', SCOPE_PATH, {})['id'], safe='')}"
try:
    response = publisher_request("GET", f"{edit}/tracks")
    track_ids = sorted(track["track"] for track in response.get("tracks", []))
    print(f"package: {PACKAGE}")
    print(f"tracks: {', '.join(track_ids) or '(none)'}")
    for track_id in ("qa", "internal"):
        try:
            track = publisher_request("GET", f"{edit}/tracks/{track_id}")
        except PlayError as error:
            print(f"{track_id}: {error}")
        else:
            print(f"{track_id}: API returned {track.get('track', '(missing ID)')}, releases={len(track.get('releases', []))}")
finally:
    discard_edit(edit)
PYTHON
