import importlib.util
import unittest
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "tools" / "aab-verifier" / "check-build-artifacts.py"
spec = importlib.util.spec_from_file_location("check_build_artifacts", path)
build_artifacts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_artifacts)


class BuildArtifactTest(unittest.TestCase):
    def setUp(self):
        self.source = "c" * 40
        trusted_repo = {"id": build_artifacts.REPOSITORY_ID}
        self.run = {
            "id": 123, "run_attempt": 1, "event": "push", "head_branch": "main",
            "head_sha": self.source, "path": build_artifacts.BUILD_WORKFLOW,
            "status": "completed", "conclusion": "success", "repository": trusted_repo,
            "head_repository": trusted_repo,
        }
        self.pages = [{"artifacts": [
            {"id": index, "name": name, "expired": False, "digest": "sha256:" + "0" * 64,
             "workflow_run": {"id": 123, "repository_id": trusted_repo["id"],
                              "head_repository_id": trusted_repo["id"], "head_sha": self.source}}
            for index, name in enumerate(build_artifacts.REQUIRED_ARTIFACTS, 1)
        ]}]

    def test_trusted_push_and_manual_runs_are_accepted(self):
        for event in ("push", "workflow_dispatch"):
            with self.subTest(event=event):
                result = build_artifacts.check_build(dict(self.run, event=event), self.pages)
                self.assertEqual(result["sourceCommitSha"], self.source)

    def test_untrusted_runs_cannot_use_release_artifacts(self):
        for field, value in (
            ("event", "pull_request"), ("head_branch", "release"),
            ("head_repository", {"id": 1}), ("path", ".github/workflows/other.yml"),
            ("conclusion", "cancelled"),
        ):
            with self.subTest(field=field):
                with self.assertRaisesRegex(ValueError, "successful release build"):
                    build_artifacts.check_build(dict(self.run, **{field: value}), self.pages)

    def test_unrelated_artifact_cannot_be_adopted(self):
        self.pages[0]["artifacts"][0]["workflow_run"]["head_sha"] = "f" * 40
        with self.assertRaisesRegex(ValueError, "Artifact metadata does not match"):
            build_artifacts.check_build(self.run, self.pages)
