#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${WORKERD:?Set the workerd executable path}"
bun_bin=${BUN:-bun}
root=$(cd "$(dirname "$0")/.." && pwd)
scratch=$(mktemp -d)
workerd_pid=
cleanup() {
  if [[ -n "$workerd_pid" ]]; then kill "$workerd_pid" 2>/dev/null || :; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
mkdir "$scratch/db"
cd "$root"
"$bun_bin" build workers/gateway/index.mjs --target=browser --outfile="$scratch/gateway.mjs"
"$bun_bin" build workers/signer/index.mjs --target=browser --external=cloudflare:workers \
  --loader .txt:text --outfile="$scratch/signer.mjs"
cp tests/two-worker-fixture.{mjs,capnp} "$scratch/"
node tests/two-worker-smoke.mjs prepare "$scratch"
(cd "$scratch" && exec "$WORKERD" serve two-worker-fixture.capnp) > "$scratch/workerd.log" 2>&1 &
workerd_pid=$!
for _ in {1..30}; do
  if curl -s -o /dev/null -H 'x-fixture-target: https://approval.fixture.invalid/' http://127.0.0.1:45919/; then break; fi
  sleep .2
done
if ! kill -0 "$workerd_pid" 2>/dev/null || ! node tests/two-worker-smoke.mjs exercise "$scratch"; then
  cat "$scratch/workerd.log"
  exit 1
fi
python3 - "$scratch/db" <<'PY'
import json
import sqlite3
import sys
from pathlib import Path
expected = ["registered", "approval_page_viewed", "armed", "approved"]
for path in Path(sys.argv[1]).rglob("*.sqlite"):
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as db:
        if db.execute("SELECT 1 FROM sqlite_master WHERE name = 'audit'").fetchone():
            actual = [json.loads(body)["event"]["type"] for body, in db.execute("SELECT body FROM audit ORDER BY seq")]
            assert actual == expected, actual
            print("One Signer-owned SQLite audit trail: " + ", ".join(actual))
            break
else:
    raise SystemExit("No Signer-owned audit database found")
PY
