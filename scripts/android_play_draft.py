#!/usr/bin/env python3
"""Upload a signed bundle and save a draft on an existing closed-test track."""
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

        with bundle.open("rb") as signed:
            digest = hashlib.file_digest(signed, "sha256").hexdigest()
            signed.seek(0)
            uploaded = publisher_request(
                "POST", f"/upload{edit}/bundles?uploadType=media", media=signed,
            )
        if uploaded.get("versionCode") != version_code or uploaded.get("sha256") != digest:
            raise PlayError("The uploaded version code or SHA-256 differs from the signed bundle")

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
        publisher_request("POST", f"{edit}:commit?changesNotSentForReview=true&changesInReviewBehavior=ERROR_IF_IN_REVIEW")
        committed = True
        print(f"Saved draft on {track} for version code {version_code}.")
    finally:
        if not committed:
            try:
                publisher_request("DELETE", edit)
            except (PlayError, URLError):
                print("Play edit could not be discarded. Check Play Console before retrying.", file=sys.stderr)


if __name__ == "__main__":
    try:
        save_draft(Path(sys.argv[1]), os.environ["PLAY_CLOSED_TRACK"], int(sys.argv[2]), sys.argv[3], os.environ.get("PLAY_RELEASE_NOTES", "").strip())
    except (PlayError, URLError, KeyError, ValueError) as error:
        sys.exit(str(error))
