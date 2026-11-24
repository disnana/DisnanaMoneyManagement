#!/usr/bin/env python3
"""Check that a completed build has the inputs needed by the independent verifier."""

import json
import re
import sys
from pathlib import Path

REPOSITORY_ID = 1462301394
BUILD_WORKFLOW = ".github/workflows/android-play-draft.yml"
REQUIRED_ARTIFACTS = (
    "Mane-chan-unsigned-app-bundle",
    "Mane-chan-release-quality-evidence",
)


def check_build(run, pages):
    source = run.get("head_sha")
    if (
        run.get("status") != "completed" or run.get("conclusion") != "success"
        or run.get("event") != "workflow_dispatch" or run.get("head_branch") != "main"
        or run.get("path") != BUILD_WORKFLOW
        or run.get("repository", {}).get("id") != REPOSITORY_ID
        or run.get("head_repository", {}).get("id") != REPOSITORY_ID
        or not isinstance(source, str) or not re.fullmatch(r"[a-f0-9]{40}", source)
    ):
        raise ValueError("Expected a successful release build from this repository's main branch")

    artifacts = [item for page in pages for item in page["artifacts"] if not item.get("expired", True)]
    missing = [name for name in REQUIRED_ARTIFACTS if not any(item.get("name") == name for item in artifacts)]
    if missing:
        raise ValueError("Required build artifact missing or expired: " + ", ".join(missing))

    selected = {}
    for name in REQUIRED_ARTIFACTS:
        matches = [item for item in artifacts if item.get("name") == name]
        if len(matches) != 1:
            raise ValueError("Ambiguous build artifact: " + name)
        artifact, = matches
        origin = artifact.get("workflow_run", {})
        digest = artifact.get("digest")
        if (
            origin.get("id") != run["id"] or origin.get("repository_id") != REPOSITORY_ID
            or origin.get("head_repository_id") != REPOSITORY_ID or origin.get("head_sha") != source
            or not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest)
        ):
            raise ValueError("Artifact metadata does not match the source run: " + name)
        selected[name] = {"id": artifact["id"], "archiveDigest": digest}
    return {"buildRunId": run["id"], "buildRunAttempt": run["run_attempt"], "sourceCommitSha": source,
            "artifacts": selected}


if __name__ == "__main__":
    try:
        run = json.loads(Path(sys.argv[1]).read_text())
        artifacts = json.loads(Path(sys.argv[2]).read_text())
        print(json.dumps(check_build(run, artifacts), indent=2))
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        sys.exit(f"Release preflight blocked: {error}")
