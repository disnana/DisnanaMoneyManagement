#!/usr/bin/env bash
set -euo pipefail

flags=()
if [[ ${1:-} == --reuse-empty-draft ]]; then
  flags+=(--reuse-empty-draft)
  shift
fi
if (( $# > 1 )); then
  printf 'Usage: %s [--reuse-empty-draft] [AAB path]\n' "$0" >&2
  exit 2
fi

aab=${1:-"$HOME/mane-chan-signed.aab"}
if [[ ! -f "$aab" ]]; then
  printf 'AABが見つかりません: %s\n' "$aab" >&2
  exit 1
fi
aab=$(realpath -- "$aab")

if ! token=$(gcloud auth print-access-token \
  --account=tp.link.z490@gmail.com \
  --impersonate-service-account=mane-release-publisher@disnana-428702.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/androidpublisher); then
  printf 'IAMで停止しました。Google Playへの登録は始まっていません。\n' >&2
  exit 1
fi

probe=$(mktemp -d)
trap 'rm -rf -- "$probe"' EXIT
mkdir -p "$probe/scripts"
raw=https://raw.githubusercontent.com/disnana/DisnanaMoneyManagement/a5477df2076b50e06e22a3053291a80938305c45/scripts
curl -fsSL "$raw/play-v6-internal-draft.py" -o "$probe/play-v6-internal-draft.py"
curl -fsSL "$raw/android_play_draft.py" -o "$probe/scripts/android_play_draft.py"
cd "$probe"
PLAY_ACCESS_TOKEN="$token" python3 play-v6-internal-draft.py "${flags[@]}" "$aab"
