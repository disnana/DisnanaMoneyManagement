import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
        self.play_sha = hashlib.sha256(self.bundle.read_bytes()).hexdigest()

    def request(self, method, path, body=None, *, media=None):
        self.calls.append((method, path))
        if method == "POST" and path == play.SCOPE_PATH:
            return {"id": "example"}
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
