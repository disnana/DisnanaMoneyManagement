#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage:
  bash scripts/mane-android-auth.sh setup [NODE_HTTPS_ORIGIN WEB_CLIENT_ID [ADC_JSON]]
  bash scripts/mane-android-auth.sh status
  bash scripts/mane-android-auth.sh uninstall

For a first install, supply the node's HTTPS origin and Web OAuth client ID.
ADC_JSON defaults to play-integrity.json under the mane config directory.
After the first install, run setup without arguments to rebuild and restart.
Uninstall stops the user service and removes its unit and binary.
HELP
}

fail() { printf '%s\n' "$*" >&2; exit 1; }

case "${1:-}" in
  -h|--help|'') usage; exit 0 ;;
  setup|status|uninstall) action=$1; shift ;;
  *) usage >&2; exit 2 ;;
esac

[[ $(uname -s) == Linux ]] || fail 'This installer requires Linux with systemd.'
(( EUID != 0 )) || fail 'Run this as the Linux account that will own the user service.'
command -v systemctl >/dev/null || fail 'systemctl is required.'
systemctl --user show-environment >/dev/null || fail 'Start a login session with a systemd user manager and run the installer there.'

config_root=${XDG_CONFIG_HOME:-"$HOME/.config"}
data_root=${XDG_DATA_HOME:-"$HOME/.local/share"}
config_dir="$config_root/mane"
env_file="$config_dir/android-auth.env"
bin_dir="$data_root/mane-android-auth"
binary="$bin_dir/mane-android-auth"
unit_dir="$config_root/systemd/user"
unit_name=mane-android-auth.service
unit_file="$unit_dir/$unit_name"
[[ $config_root == /* && $data_root == /* ]] || fail 'XDG config and data directories must use absolute paths.'
if [[ $action != status ]]; then
  command -v flock >/dev/null || fail 'flock is required.'
  mkdir -p -- "$config_dir"
  exec {install_lock}>"$config_dir/.android-auth-install.lock"
  flock "$install_lock"
fi

# systemd unit paths support specifiers. Escape literal percent characters.
quote_value() {
  local value=$1
  [[ $value != *$'\n'* && $value != *$'\r'* ]] || fail 'Line breaks are unsupported in configuration values.'
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  printf '"%s"' "$value"
}

unit_path() {
  local value=${1//%/%%}
  quote_value "$value"
}

case "$action" in
  status)
    (( $# == 0 )) || fail 'status takes no arguments.'
    exec systemctl --user --no-pager status "$unit_name"
    ;;
  uninstall)
    (( $# == 0 )) || fail 'uninstall takes no arguments.'
    if [[ -e $unit_file ]]; then
      systemctl --user disable --now "$unit_name"
      rm -f -- "$unit_file"
      systemctl --user daemon-reload
    fi
    rm -f -- "$binary"
    printf 'Removed %s. Retained configuration in %s.\n' "$unit_name" "$config_dir"
    exit 0
    ;;
esac

command -v go >/dev/null || fail 'Install the Go version specified in apps/server/go.mod.'
command -v openssl >/dev/null || fail 'openssl is required to generate the initial signing keys.'
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
mkdir -p -- "$config_dir" "$bin_dir" "$unit_dir"
bin_tmp=$(mktemp "$bin_dir/.mane-auth.XXXXXX")
config_tmp=
unit_tmp=
cleanup() {
  rm -f -- "$bin_tmp"
  if [[ -n $config_tmp ]]; then rm -f -- "$config_tmp"; fi
  if [[ -n $unit_tmp ]]; then rm -f -- "$unit_tmp"; fi
}
trap cleanup EXIT

if [[ -e $env_file ]]; then
  (( $# == 0 )) || fail "Configuration already exists in $env_file. Edit it and run setup without arguments."
else
  (( $# == 2 || $# == 3 )) || fail 'First setup needs NODE_HTTPS_ORIGIN and WEB_CLIENT_ID. See --help.'
  [[ $1 =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || fail 'Supply an HTTPS origin, without a path or trailing slash.'
  [[ $2 =~ ^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$ ]] || fail 'Supply a Google Web OAuth client ID.'
  credentials=${3:-"$config_dir/play-integrity.json"}
  [[ $credentials == /* && -f $credentials && -r $credentials ]] || fail 'ADC JSON must be a readable file at an absolute path.'
  config_tmp=$(mktemp "$config_dir/.android-auth.env.XXXXXX")
  credential_setting=$(quote_value "$credentials")
  random_key() { openssl rand -base64 32 | tr '+/' '_-' | tr -d '=\n'; }
  challenge=$(random_key)
  jwt_seed=$(random_key)
  cat > "$config_tmp" <<SETTINGS
MANE_AUTH_STAGING=1
MANE_AUTH_LISTEN=127.0.0.1:8081
MANE_NODE_ID=staging-a
MANE_NODE_ORIGIN=$1
MANE_GOOGLE_WEB_CLIENT_ID=$2
GOOGLE_APPLICATION_CREDENTIALS=$credential_setting
MANE_JWT_KID=staging-1
MANE_CHALLENGE_KEY=$challenge
MANE_JWT_SEED=$jwt_seed
SETTINGS
fi

(cd -- "$repo/apps/server" && go build -mod=readonly -buildvcs=false -trimpath -o "$bin_tmp" ./cmd/mane-android-auth)
chmod 700 "$bin_tmp"
if [[ -n $config_tmp ]]; then
  ln -- "$config_tmp" "$env_file"
fi

unit_tmp=$(mktemp "$unit_dir/.mane-android-auth.XXXXXX")
# EnvironmentFile takes an absolute path directly, including any spaces.
env_for_unit=${env_file//%/%%}
[[ $env_for_unit != *$'\n'* && $env_for_unit != *$'\r'* ]] || fail 'Line breaks are unsupported in unit paths.'
binary_for_unit=$(unit_path "$binary")
cat > "$unit_tmp" <<UNIT
[Unit]
Description=Mane Android authentication staging service
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=exec
EnvironmentFile=$env_for_unit
ExecStartPre=$binary_for_unit --check-config
ExecStart=$binary_for_unit
Restart=on-failure
RestartSec=4
NoNewPrivileges=yes
UMask=0077

[Install]
WantedBy=default.target
UNIT

mv -f -- "$bin_tmp" "$binary"
chmod 644 "$unit_tmp"
mv -f -- "$unit_tmp" "$unit_file"
systemctl --user daemon-reload
systemctl --user enable "$unit_name"
if ! systemctl --user restart "$unit_name"; then
  fail "Service failed to start. Run journalctl --user -u $unit_name -n 30 --no-pager."
fi
printf 'Installed %s. Settings are in %s.\n' "$unit_name" "$env_file"
