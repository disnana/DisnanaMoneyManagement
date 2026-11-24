#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 5 ]]; then
  echo 'Usage: run-poc.sh unsigned.aab sha256 package versionName versionCode' >&2
  exit 2
fi
: "${JAVA_HOME:?Set the JDK 21 location}"
: "${BUNDLETOOL:?Set the bundletool JAR location}"
: "${CMS_DEPS:?Set the directory containing the pinned Bouncy Castle JARs}"
: "${WORKERD:?Set the workerd executable path}"

root=$(cd "$(dirname "$0")/.." && pwd)
scratch=$(mktemp -d)
workerd_pid=
cleanup() {
  if [[ -n "$workerd_pid" ]]; then kill "$workerd_pid" 2>/dev/null || :; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
jdk="$JAVA_HOME/bin"
export JAVA_TOOL_OPTIONS="-Djava.io.tmpdir=$scratch"
classpath="$scratch/classes:$CMS_DEPS/*"
verifier=(python3 "$root/tools/aab-verifier/verify.py"
  --bundletool "$BUNDLETOOL" --java "$jdk/java" --unsigned "$1" --sha256 "$2"
  --package "$3" --version-name "$4" --version-code "$5")
if [[ -n "${EXPECTED_COMMIT:-}" ]]; then verifier+=(--commit "$EXPECTED_COMMIT"); fi

(cd "$CMS_DEPS" && sha256sum -c "$root/tools/remote-jarsigner/dependencies.sha256")
"${verifier[@]}"
mkdir "$scratch/classes"
"$jdk/javac" -cp "$CMS_DEPS/*" -d "$scratch/classes" "$root/tools/remote-jarsigner/"*.java
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=Disnana local PoC only' \
  -keyout "$scratch/test-only.pem" -out "$scratch/certificate.pem" 2>/dev/null
openssl pkcs8 -topk8 -nocrypt -in "$scratch/test-only.pem" -outform DER -out "$scratch/test-only.pk8"
rm -- "$scratch/test-only.pem"
fixed_time=2026-11-24T00:00:00Z

for proof in first second; do
  time -p "$jdk/java" -cp "$classpath" DeterministicAab capture \
    "$1" "$scratch/certificate.pem" "$fixed_time" "$scratch/$proof"
done
diff -rq "$scratch/first" "$scratch/second"
wc -c "$scratch/first/"*
sha256sum "$scratch/first/"*

cp "$root/tests/"{fixture-worker.mjs,workerd-fixture.capnp} "$scratch/"
cp "$scratch/first/input.bin" "$scratch/approved.input"
"$WORKERD" serve "$scratch/workerd-fixture.capnp" > "$scratch/workerd.log" 2>&1 &
workerd_pid=$!
url=http://127.0.0.1:45917/aab-proof
for _ in {1..30}; do
  if curl -s -o /dev/null "$url"; then break; fi
  sleep .2
done
if ! kill -0 "$workerd_pid" 2>/dev/null; then cat "$scratch/workerd.log"; exit 1; fi

time -p "$jdk/java" -cp "$classpath" DeterministicAab finalize \
  "$1" "$scratch/certificate.pem" "$fixed_time" "$scratch/first" "$scratch/signed.aab" "$url"
"$jdk/keytool" -importcert -noprompt -alias fixture -file "$scratch/certificate.pem" \
  -keystore "$scratch/trust.p12" -storepass publiccert
"$jdk/jarsigner" -verify -strict -keystore "$scratch/trust.p12" -storepass publiccert "$scratch/signed.aab"
"${verifier[@]}" --signed "$scratch/signed.aab"

unzip -p "$scratch/signed.aab" META-INF/MANE.RSA > "$scratch/block.der"
openssl cms -verify -binary -inform DER -in "$scratch/block.der" \
  -content "$scratch/first/MANE.SF" -noverify -out /dev/null

python3 - "$scratch" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
original = (p / 'approved.input').read_bytes()
(p / 'wrong-input').write_bytes(bytes([original[0] ^ 1]) + original[1:])
(p / 'short-input').write_bytes(original[:-1])
(p / 'huge-input').write_bytes(b'\x00' * 65537)
PY
for item in wrong-input huge-input short-input approved.input; do
  code=$(curl -sS -o "$scratch/response" -w '%{http_code}' \
    -H 'Content-Type: application/octet-stream' --data-binary "@$scratch/$item" "$url")
  case "$item" in
    wrong-input|short-input) test "$code" = 403 ;;
    huge-input) test "$code" = 413 ;;
    approved.input) test "$code" = 200 && test "$(wc -c < "$scratch/response")" = 256 ;;
  esac
  printf '%s %s\n' "$item" "$code"
done
