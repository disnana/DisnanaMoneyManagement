#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ ! "${BUILD_RUN_ID:-}" =~ ^[1-9][0-9]{0,19}$ ]]; then
  echo 'Expected a GitHub build run ID' >&2
  exit 1
fi
if [[ ! "${RELEASE_SOURCE_SHA:-}" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'Expected the configured source commit SHA' >&2
  exit 1
fi
repo=disnana/DisnanaMoneyManagement
out="$RUNNER_TEMP/mane-authority"
mkdir "$out" "$out/tools"
gh api "/repos/$repo/actions/runs/$BUILD_RUN_ID" > "$out/build-run.json"
gh api --paginate --slurp "/repos/$repo/actions/runs/$BUILD_RUN_ID/artifacts?per_page=100" > "$out/artifacts.json"
python3 release-authority/tools/aab-verifier/check-build-artifacts.py \
  "$out/build-run.json" "$out/artifacts.json" > "$out/build-evidence.json"
jq -e --arg sha "$RELEASE_SOURCE_SHA" '.sourceCommitSha == $sha' "$out/build-evidence.json" >/dev/null

download_artifact() {
  local name=$1 path=$2 id digest
  id=$(jq -er --arg name "$name" '.artifacts[$name].id | tostring' "$out/build-evidence.json")
  digest=$(jq -er --arg name "$name" '.artifacts[$name].archiveDigest | ltrimstr("sha256:")' "$out/build-evidence.json")
  [[ "$id" =~ ^[1-9][0-9]{0,19}$ && "$digest" =~ ^[a-f0-9]{64}$ ]]
  gh api "/repos/$repo/actions/artifacts/$id/zip" > "$path"
  printf '%s  %s\n' "$digest" "$path" | sha256sum -c -
}
download_artifact Mane-chan-unsigned-app-bundle "$out/bundle.zip"
download_artifact Mane-chan-release-quality-evidence "$out/quality.zip"
unzip -p "$out/bundle.zip" app-release.aab > "$out/app-release.aab"
for evidence in quality.json audit.json sbom.cdx.json; do
  unzip -p "$out/quality.zip" "$evidence" > "$out/$evidence"
done

for subject in app-release.aab quality.json; do
  gh attestation verify "$out/$subject" --repo "$repo" \
    --signer-workflow "$repo/.github/workflows/android-play-draft.yml" \
    --source-ref refs/heads/main --source-digest "$RELEASE_SOURCE_SHA" \
    --deny-self-hosted-runners --format json > "$out/$subject.attestation.json"
done

curl --fail --silent --show-error --location --max-time 120 \
  https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar \
  -o "$out/tools/bundletool.jar"
printf '%s  %s\n' 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29' \
  "$out/tools/bundletool.jar" | sha256sum -c -
for library in bcpkix-jdk18on bcprov-jdk18on bcutil-jdk18on; do
  curl --fail --silent --show-error --max-time 120 \
    "https://repo.maven.apache.org/maven2/org/bouncycastle/$library/1.85/$library-1.85.jar" \
    -o "$out/tools/$library-1.85.jar"
done
checksums="$PWD/release-authority/tools/remote-jarsigner/dependencies.sha256"
(cd "$out/tools" && sha256sum -c "$checksums")
mkdir "$out/classes"
javac -cp "$out/tools/*" -d "$out/classes" release-authority/tools/remote-jarsigner/{RemoteAabSigner,DeterministicAab}.java
printf '%s\n' "$RELEASE_UPLOAD_CERTIFICATE_PEM" > "$out/certificate.pem"
actual=$(openssl x509 -in "$out/certificate.pem" -outform DER | sha256sum | cut -d ' ' -f1)
[[ "$RELEASE_UPLOAD_CERTIFICATE_SHA256" =~ ^[a-f0-9]{64}$ && "$actual" == "$RELEASE_UPLOAD_CERTIFICATE_SHA256" ]]
