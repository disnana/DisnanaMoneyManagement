#!/usr/bin/env python3
"""One-off v6 Android Publisher API check. Run from the app repository."""
import hashlib
import os
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path.cwd() / "scripts"))
from android_play_draft import PACKAGE, SCOPE_PATH, PlayError, discard_edit, publisher_request, upload_bundle

TRACK = "qa"
VERSION = 6
SHA256 = "156353e589821e273bf9303f6c3a7d17ebec86e7d4fdf8806ed21b0f8806a616"
DRAFT = {"name": "v6", "versionCodes": ["6"], "status": "draft"}
PENDING_REVIEW = {"RELEASE_LIFECYCLE_STATE_IN_REVIEW", "RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW"}
DRAFT_STATE = "RELEASE_LIFECYCLE_STATE_DRAFT"


def require(condition, message):
    if not condition:
        raise PlayError(message)


def new_edit():
    return f"{SCOPE_PATH}/{quote(publisher_request('POST', SCOPE_PATH, {})['id'], safe='')}"


def tracks(edit):
    return {item["track"]: item for item in publisher_request("GET", f"{edit}/tracks").get("tracks", [])}


def lifecycle(track):
    root = f"/androidpublisher/v3/applications/{PACKAGE}/tracks"
    return publisher_request("GET", f"{root}/{quote(track, safe='')}/releases").get("releases", [])


def matching_bundle(edit):
    bundles = publisher_request("GET", f"{edit}/bundles").get("bundles", [])
    matches = [item for item in bundles if item.get("versionCode") == VERSION]
    require(len(matches) <= 1, "Play returned duplicate version codes.")
    if not matches:
        return False
    require(matches[0].get("sha256") == SHA256, "Play already has different bytes under version code 6.")
    return True


def is_v6_draft(release):
    return release.get("status") == "draft" and release.get("versionCodes") == [str(VERSION)]


def other_tracks(snapshot):
    return {name: track for name, track in snapshot.items() if name != TRACK}


def verify_saved(before, review_before, previous_releases):
    edit = new_edit()
    try:
        require(matching_bundle(edit), "The committed bundle is missing from a fresh edit.")
        after = tracks(edit)
        require(other_tracks(after) == other_tracks(before), "A different track changed. Inspect Play Console.")
        require(all(lifecycle(name) == entries for name, entries in review_before.items() if name != TRACK),
                "The release lifecycle changed on another track. Inspect Play Console.")
        releases = after.get(TRACK, {}).get("releases", [])
        require(any(is_v6_draft(release) for release in releases), "v6 is not an internal draft in the fresh edit.")
        require(all(prior in releases for prior in previous_releases), "An existing internal release changed.")
        summaries = lifecycle(TRACK)
        require(any(
            entry.get("releaseLifecycleState") == DRAFT_STATE
            and any(str(artifact.get("versionCode")) == str(VERSION) for artifact in entry.get("activeArtifacts", []))
            for entry in summaries
        ), "The release summary does not yet show v6 as DRAFT. Check the status before retrying.")
        print(f"Verified internal draft and persisted AAB: version {VERSION}, SHA-256 {SHA256}")
    finally:
        discard_edit(edit)


def publish(bundle):
    with bundle.open("rb") as stream:
        require(hashlib.file_digest(stream, "sha256").hexdigest() == SHA256, "The file differs from the verified signed v6.")
    edit = new_edit()
    commit_attempted = False
    try:
        before = tracks(edit)
        require(TRACK in before, "Play did not return qa. No alternative track was written.")
        review_before = {track: lifecycle(track) for track in before}
        for track, entries in review_before.items():
            require(not any(entry.get("releaseLifecycleState") in PENDING_REVIEW for entry in entries),
                    f"Existing releases await or are undergoing review on {track}.")
        previous = before[TRACK].get("releases", [])
        already_draft = any(is_v6_draft(release) for release in previous)
        stored = matching_bundle(edit)
        if already_draft:
            require(stored, "An existing v6 draft has no matching signed bundle.")
        else:
            require(all(release.get("status") == "completed" for release in previous),
                    "The internal track has a draft or an unfinished rollout.")
            require(all(str(VERSION) not in release.get("versionCodes", []) for release in previous),
                    "v6 is already assigned to an internal release in a different state.")
            if not stored:
                upload_bundle(bundle, VERSION, edit, expected_sha256=SHA256)
            update = {"track": TRACK, "releases": [*previous, DRAFT]}
            response = publisher_request("PUT", f"{edit}/tracks/{TRACK}", update)
            require(response.get("track") == TRACK and any(is_v6_draft(r) for r in response.get("releases", []))
                    and all(prior in response.get("releases", []) for prior in previous),
                    "Play did not return the intended internal draft and existing releases.")
            require(other_tracks(tracks(edit)) == other_tracks(before), "Another track changed inside the edit.")
            publisher_request("POST", f"{edit}:validate")
            commit_attempted = True
            publisher_request("POST", f"{edit}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW")
    finally:
        if not commit_attempted:
            discard_edit(edit)
    verify_saved(before, review_before, [release for release in previous if not is_v6_draft(release)])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: PLAY_ACCESS_TOKEN=<from your authenticated session> python3 play-v6-internal-draft.py mane-chan-signed.aab")
    if not os.environ.get("PLAY_ACCESS_TOKEN"):
        sys.exit("Play API authentication is missing. Supply a short-lived OAuth token locally.")
    try:
        publish(Path(sys.argv[1]))
    except (PlayError, OSError, KeyError, ValueError) as error:
        sys.exit(f"Stopped: {error}")
