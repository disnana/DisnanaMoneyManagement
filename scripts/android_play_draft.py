#!/usr/bin/env python3
"""Store a verified bundle in Play and support test-track drafts."""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

PACKAGE = "com.disnana.mane_chan"
ROOT = "https://androidpublisher.googleapis.com"
SCOPE_PATH = f"/androidpublisher/v3/applications/{PACKAGE}/edits"
COMMIT_WITHOUT_REVIEW = "?changesNotSentForReview=true&changesInReviewBehavior=ERROR_IF_IN_REVIEW"
COMMIT_INTERNAL_DRAFT = "?changesInReviewBehavior=ERROR_IF_IN_REVIEW"
INTERNAL_TRACK = "internal"
PENDING_REVIEW = {"RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW", "RELEASE_LIFECYCLE_STATE_IN_REVIEW"}


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


def verify_local_bundle(bundle, version_code, expected_sha256):
    if not 1 <= version_code <= 2_100_000_000 or not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise PlayError("Expected a Play version code and the verified lowercase SHA-256")
    with bundle.open("rb") as signed:
        if hashlib.file_digest(signed, "sha256").hexdigest() != expected_sha256:
            raise PlayError("The local bundle SHA-256 differs from the verified artifact")


def new_edit():
    return f"{SCOPE_PATH}/{quote(publisher_request('POST', SCOPE_PATH, {})['id'], safe='')}"


def bundle_present(edit, version_code, expected_sha256):
    matches = [item for item in publisher_request("GET", f"{edit}/bundles").get("bundles", [])
               if item.get("versionCode") == version_code]
    if len(matches) > 1 or (matches and matches[0].get("sha256") != expected_sha256):
        raise PlayError("Play already stores a different bundle with this version code")
    return bool(matches)


def store_bundle_only(bundle, version_code, expected_sha256):
    verify_local_bundle(bundle, version_code, expected_sha256)
    edit = new_edit()
    commit_attempted = False
    try:
        if bundle_present(edit, version_code, expected_sha256):
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


def list_tracks(edit):
    return {item["track"]: item for item in publisher_request("GET", f"{edit}/tracks").get("tracks", [])}


def release_lifecycle(track):
    path = f"/androidpublisher/v3/applications/{PACKAGE}/tracks/{quote(track, safe='')}/releases"
    return publisher_request("GET", path).get("releases", [])


def internal_releases(actual, expected):
    # Play may supply defaults after commit. Keep every field seen before commit,
    # except an empty name which Play can populate from the bundle.
    if len(actual) != len(expected):
        return False
    remaining = actual.copy()
    for release in expected:
        keep_name = bool(release.get("name"))
        expected_fields = {key: value for key, value in release.items() if keep_name or key != "name"}
        for candidate in remaining:
            actual_fields = {key: value for key, value in candidate.items() if keep_name or key != "name"}
            if actual_fields == expected_fields:
                remaining.remove(candidate)
                break
        else:
            return False
    return True


def verify_internal_draft(version_code, expected_sha256, expected, other_tracks, other_lifecycle):
    edit = new_edit()
    try:
        if not bundle_present(edit, version_code, expected_sha256):
            raise PlayError("The expected bundle was not found in a fresh edit")
        tracks = list_tracks(edit)
        actual = tracks.pop(INTERNAL_TRACK, {}).get("releases", [])
        if not internal_releases(actual, expected):
            raise PlayError("Internal release fields differ from the saved draft and original releases")
        if tracks != other_tracks or any(release_lifecycle(track) != state for track, state in other_lifecycle.items()):
            raise PlayError("Another Play track or release state changed")
        if not any(release.get("releaseLifecycleState") == "RELEASE_LIFECYCLE_STATE_DRAFT"
                   and any(str(artifact.get("versionCode")) == str(version_code)
                           for artifact in release.get("activeArtifacts", []))
                   for release in release_lifecycle(INTERNAL_TRACK)):
            raise PlayError("Play lifecycle does not confirm the version as a draft")
    finally:
        discard_edit(edit)


def store_internal_draft(bundle, version_code, expected_sha256, *, reserve=None):
    verify_local_bundle(bundle, version_code, expected_sha256)
    edit = new_edit()
    commit_attempted = False
    try:
        other_tracks = list_tracks(edit)
        target = other_tracks.pop(INTERNAL_TRACK, None)
        if target is None:
            raise PlayError("Play did not return the configured internal track")
        lifecycle = {track: release_lifecycle(track) for track in [*other_tracks, INTERNAL_TRACK]}
        for track, releases in lifecycle.items():
            if any(release.get("releaseLifecycleState") in PENDING_REVIEW for release in releases):
                raise PlayError(f"Existing releases await or are undergoing review on {track}")

        current = target.get("releases", [])
        versions = [str(version_code)]
        saved = bundle_present(edit, version_code, expected_sha256)
        matching = [release for release in current if str(version_code) in release.get("versionCodes", [])]
        if matching:
            if len(matching) != 1 or matching[0].get("status") != "draft" or matching[0]["versionCodes"] != versions or not saved:
                raise PlayError("This version is already assigned to a different internal release")
            expected = current
        else:
            drafts = [release for release in current if release.get("status") == "draft"]
            if (any(release.get("status") not in {"completed", "draft"} for release in current)
                    or len(drafts) > 1 or (drafts and drafts[0].get("versionCodes", []))):
                raise PlayError("The internal track has an occupied draft or an unfinished rollout")
            if drafts:
                expected = [dict(release, versionCodes=versions) if release is drafts[0] else release for release in current]
            else:
                expected = [*current, {"name": f"v{version_code}", "status": "draft", "versionCodes": versions}]

            if reserve is not None:
                reserve()
            if not saved:
                upload_bundle(bundle, version_code, edit, expected_sha256=expected_sha256)
            response = publisher_request("PUT", f"{edit}/tracks/{INTERNAL_TRACK}",
                                         {"track": INTERNAL_TRACK, "releases": expected})
            staged = list_tracks(edit)
            actual = staged.pop(INTERNAL_TRACK, {}).get("releases", [])
            if (response.get("track") != INTERNAL_TRACK or not internal_releases(response.get("releases", []), expected)
                    or not internal_releases(actual, expected) or staged != other_tracks):
                raise PlayError("Play staged an unexpected change. The edit was not committed.")
            publisher_request("POST", f"{edit}:validate")
            commit_attempted = True
            try:
                publisher_request("POST", f"{edit}:commit{COMMIT_INTERNAL_DRAFT}")
            except (PlayError, URLError, OSError, ValueError) as error:
                raise PlayError(f"Play commit was not confirmed for version {version_code}. Check Play before retrying. {error}") from None
    finally:
        if not commit_attempted:
            discard_edit(edit)

    lifecycle.pop(INTERNAL_TRACK)
    try:
        verify_internal_draft(version_code, expected_sha256, expected, other_tracks, lifecycle)
    except (PlayError, URLError, OSError, ValueError) as error:
        raise PlayError(f"Post-save verification failed for version {version_code}. Check Play before retrying. {error}") from None
    if matching and reserve is not None:
        reserve()
    return "already_present" if matching else "stored"


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
        mode = sys.argv[1:2]
        if mode == ["--bundle-only"] and len(sys.argv) == 5:
            _, _, bundle, version_code, expected_sha256 = sys.argv
            result = store_bundle_only(Path(bundle), int(version_code), expected_sha256)
            print(f"Bundle {result}: version code {version_code}, SHA-256 {expected_sha256}")
        elif mode == ["--internal-draft"] and len(sys.argv) == 7:
            _, _, bundle, version_code, expected_sha256, manifest, signature = sys.argv
            recorder = Path(__file__).resolve().parents[1] / "release-authority/tools/remote-jarsigner/record-play-upload.mjs"

            def reserve_upload():
                subprocess.run(["node", str(recorder), "start", manifest, signature, expected_sha256], check=True)

            result = store_internal_draft(Path(bundle), int(version_code), expected_sha256, reserve=reserve_upload)
            print(f"Bundle {result}: version code {version_code}, SHA-256 {expected_sha256}")
        elif len(sys.argv) == 4 and not sys.argv[1].startswith("--"):
            _, bundle, version_code, release_name = sys.argv
            save_draft(Path(bundle), os.environ["PLAY_CLOSED_TRACK"], int(version_code), release_name, os.environ.get("PLAY_RELEASE_NOTES", "").strip())
        else:
            sys.exit("Usage: android_play_draft.py --bundle-only AAB VERSION_CODE SHA256\n"
                     "       android_play_draft.py --internal-draft AAB VERSION_CODE SHA256 MANIFEST SIGNATURE")
    except (PlayError, OSError, KeyError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
