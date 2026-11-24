import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

import android_play_draft as play


class DraftReleaseTest(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.bundle = Path(directory) / "signed.aab"
        self.bundle.write_bytes(b"example signed bundle")
        self.track = "alpha"
        self.live = {"versionCodes": ["5"], "status": "completed"}
        self.calls = []
        self.edit = f"{play.SCOPE_PATH}/example"
        self.commit = f"{self.edit}:commit?changesNotSentForReview=true&changesInReviewBehavior=ERROR_IF_IN_REVIEW"
        self.api = self.enterContext(patch.object(play, "publisher_request", side_effect=self.request))
        self.commit_error = None
        self.releases = [self.live]
        self.stored_bundles = []
        self.play_sha = hashlib.sha256(self.bundle.read_bytes()).hexdigest()

    def request(self, method, path, body=None, *, media=None):
        self.calls.append((method, path))
        if method == "POST" and path == play.SCOPE_PATH:
            return {"id": "example"}
        if method == "GET" and path == f"{self.edit}/bundles":
            return {"bundles": self.stored_bundles}
        if method == "GET":
            return {"track": self.track, "releases": self.releases}
        if media is not None:
            self.assertEqual(media.read(), self.bundle.read_bytes())
            return {"versionCode": 6, "sha256": self.play_sha}
        if method == "PUT":
            self.assertEqual(body["releases"][0], self.live)
            self.assertEqual(body["releases"][1], {
                "name": "v6 abc", "versionCodes": ["6"], "status": "draft",
                "releaseNotes": [{"language": "ja-JP", "text": "案内画像を修正"}],
            })
            return body
        if method == "POST" and path == self.commit and self.commit_error:
            raise self.commit_error
        return {}

    def save_draft(self):
        play.save_draft(self.bundle, self.track, 6, "v6 abc", "案内画像を修正")

    def test_keeps_active_release_and_commits_only_without_review(self):
        self.save_draft()
        self.assertEqual(self.calls[-1], ("POST", self.commit))
        self.assertEqual(len(self.calls), 5)

    def test_review_in_progress_is_not_retried(self):
        self.commit_error = play.PlayError("CHANGES_ALREADY_IN_REVIEW")
        with self.assertRaisesRegex(play.PlayError, "CHANGES_ALREADY_IN_REVIEW"):
            self.save_draft()
        self.assertEqual(self.calls[-2:], [("POST", self.commit), ("DELETE", self.edit)])

    def test_existing_draft_is_left_untouched(self):
        self.releases.append({"versionCodes": ["7"], "status": "draft"})
        with self.assertRaisesRegex(play.PlayError, "already has a draft"):
            self.save_draft()
        self.assertEqual([method for method, _ in self.calls], ["POST", "GET", "DELETE"])

    def test_mismatched_bundle_is_never_assigned(self):
        self.play_sha = "0" * 64
        with self.assertRaisesRegex(play.PlayError, "SHA-256 differs"):
            self.save_draft()
        self.assertEqual(self.calls[-1], ("DELETE", self.edit))
        self.assertFalse(any(method == "PUT" for method, _ in self.calls))

    def test_production_track_is_rejected_without_api_calls(self):
        self.track = "production"
        with self.assertRaisesRegex(play.PlayError, "closed-test track"):
            self.save_draft()
        self.api.assert_not_called()

    def test_bundle_only_commits_without_touching_tracks_or_review(self):
        self.assertEqual(play.store_bundle_only(self.bundle, 6, self.play_sha), "stored")
        self.assertEqual(self.calls, [
            ("POST", play.SCOPE_PATH),
            ("GET", f"{self.edit}/bundles"),
            ("POST", f"/upload{self.edit}/bundles?uploadType=media"),
            ("POST", f"{self.edit}:validate"),
            ("POST", self.commit),
        ])

    def test_bundle_only_recognizes_a_previous_upload_by_its_digest(self):
        self.stored_bundles = [{"versionCode": 6, "sha256": self.play_sha}]
        self.assertEqual(play.store_bundle_only(self.bundle, 6, self.play_sha), "already_present")
        self.assertEqual(self.calls, [
            ("POST", play.SCOPE_PATH), ("GET", f"{self.edit}/bundles"), ("DELETE", self.edit),
        ])

    def test_bundle_only_rejects_different_bytes_for_an_existing_version(self):
        self.stored_bundles = [{"versionCode": 6, "sha256": "0" * 64}]
        with self.assertRaisesRegex(play.PlayError, "different bundle"):
            play.store_bundle_only(self.bundle, 6, self.play_sha)
        self.assertEqual(self.calls[-1], ("DELETE", self.edit))
        self.assertEqual(len(self.calls), 3)

    def test_bundle_only_rejects_an_unverified_local_file_before_opening_an_edit(self):
        with self.assertRaisesRegex(play.PlayError, "local bundle SHA-256 differs"):
            play.store_bundle_only(self.bundle, 6, "0" * 64)
        self.api.assert_not_called()

    def test_bundle_only_preserves_an_edit_after_an_unconfirmed_commit(self):
        self.commit_error = URLError("connection lost")
        with self.assertRaisesRegex(play.PlayError, "Check version 6"):
            play.store_bundle_only(self.bundle, 6, self.play_sha)
        self.assertEqual(self.calls[-1], ("POST", self.commit))
        self.assertEqual(len(self.calls), 5)


class InternalDraftTest(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.bundle = Path(directory) / "signed.aab"
        self.bundle.write_bytes(b"example verified bundle")
        self.sha = hashlib.sha256(self.bundle.read_bytes()).hexdigest()
        self.completed = {"status": "completed", "versionCodes": ["5"], "name": "Live"}
        self.empty = {"status": "draft", "releaseNotes": [{"language": "ja-JP", "text": "既存の案内"}]}
        self.releases = [self.empty, self.completed]
        self.staged = None
        self.review_pending = False
        self.committed = False
        self.replace_completed = False
        self.alter_notes = False
        self.reserved = False
        self.calls = []
        self.edit = f"{play.SCOPE_PATH}/test"
        self.enterContext(patch.object(play, "publisher_request", side_effect=self.request))

    def request(self, method, path, body=None, *, media=None):
        self.calls.append((method, path))
        if path == play.SCOPE_PATH and method == "POST":
            return {"id": "test"}
        if path == f"{self.edit}/tracks":
            return {"tracks": [{"track": "alpha"}, {
                "track": "internal", "releases": self.staged if self.staged is not None else self.releases,
            }]}
        if path == f"{self.edit}/bundles":
            return {"bundles": [{"versionCode": 6, "sha256": self.sha}] if self.committed else []}
        if path.endswith("/alpha/releases"):
            return {"releases": [{"releaseLifecycleState": "RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW"}]} if self.review_pending else {}
        if path.endswith("/internal/releases"):
            return {"releases": [{"releaseLifecycleState": "RELEASE_LIFECYCLE_STATE_DRAFT",
                                  "activeArtifacts": [{"versionCode": 6}]}]} if self.committed else {}
        if media is not None:
            self.assertTrue(self.reserved)
            self.assertEqual(media.read(), self.bundle.read_bytes())
            return {"versionCode": 6, "sha256": self.sha}
        if method == "PUT":
            self.assertEqual(path, f"{self.edit}/tracks/internal")
            self.assertEqual(body["releases"], [dict(self.empty, versionCodes=["6"]), self.completed])
            self.staged = body["releases"][:1] if self.replace_completed else body["releases"]
            return body
        if path == f"{self.edit}:validate" or (method, path) == ("DELETE", self.edit):
            return {}
        if path == f"{self.edit}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW":
            self.committed = True
            draft = dict(self.staged[0], name="1.0.0 (6)")
            if self.alter_notes:
                draft["releaseNotes"] = []
            self.staged = [self.completed, draft]
            return {}
        self.fail(f"Unexpected request {method} {path}")

    def reserve(self):
        self.assertFalse(self.reserved)
        self.reserved = True

    def store(self):
        return play.store_internal_draft(self.bundle, 6, self.sha, reserve=self.reserve)

    def test_preserves_empty_draft_metadata_and_v5_and_verifies_storage(self):
        self.assertEqual(self.store(), "stored")
        self.assertEqual(self.staged[0], self.completed)
        self.assertEqual(self.staged[1]["releaseNotes"], self.empty["releaseNotes"])
        self.assertEqual(self.calls[-1], ("DELETE", self.edit))

    def test_matching_draft_and_bundle_make_retry_read_only(self):
        self.committed = True
        self.releases[0] = dict(self.empty, versionCodes=["6"])
        self.assertEqual(self.store(), "already_present")
        self.assertTrue(self.reserved)
        self.assertFalse(any(method == "PUT" or path.endswith(":validate") for method, path in self.calls))
        self.assertFalse(any(path.startswith("/upload") for _, path in self.calls))

    def test_occupied_draft_or_pending_review_stops_before_upload(self):
        self.releases[0] = dict(self.empty, versionCodes=["4"])
        with self.assertRaisesRegex(play.PlayError, "occupied draft"):
            self.store()
        self.review_pending = True
        with self.assertRaisesRegex(play.PlayError, "undergoing review on alpha"):
            self.store()
        self.assertFalse(any(path.startswith("/upload") for _, path in self.calls))
        self.assertFalse(self.reserved)

    def test_edit_dropping_completed_release_is_discarded(self):
        self.replace_completed = True
        with self.assertRaisesRegex(play.PlayError, "not committed"):
            self.store()
        self.assertFalse(self.committed)
        self.assertEqual(self.calls[-1], ("DELETE", self.edit))

    def test_post_commit_notes_change_prevents_success_receipt(self):
        self.alter_notes = True
        with self.assertRaisesRegex(play.PlayError, "Post-save verification failed"):
            self.store()
        self.assertTrue(self.committed)
