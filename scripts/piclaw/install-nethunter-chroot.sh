#!/usr/bin/env bash
# Install Piclaw runtime inside NetHunter Kali (bootkali) on armhf, without systemd.
# Run as root. Staging: copy of piclaw_runtime (from ADB) at /opt/piclaw-staging by default.
#
# Usage (inside chroot):
#   ./install-nethunter-chroot.sh
#   ./install-nethunter-chroot.sh /opt/piclaw-staging
#
# From PC: push piclaw_runtime to chroot, then:
#   adb push piclaw_runtime/ /data/local/tmp/piclaw_runtime
#   adb shell su -c "cp -a /data/local/tmp/piclaw_runtime /data/local/nhsystem/kali-armhf/opt/piclaw-staging"
#   adb shell su -c "cp install-nethunter-chroot.sh /data/local/nhsystem/kali-armhf/root/ && chmod 755 /data/local/nhsystem/kali-armhf/root/install-nethunter-chroot.sh"
#   adb shell "su -c 'bootkali custom_cmd /bin/bash /root/install-nethunter-chroot.sh'"
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (NetHunter Kali chroot)." >&2
  exit 1
fi

STAGING="${1:-/opt/piclaw-staging}"
INSTALL="/opt/piclaw"
IDENTITY="/opt/piclaw_identity"

if [[ ! -d "$STAGING" ]]; then
  echo "Missing staging: $STAGING" >&2
  echo "Copy piclaw_runtime there first (e.g. from ADB: .../opt/piclaw-staging)." >&2
  exit 1
fi
if [[ ! -f "$STAGING/piclaw.js" || ! -f "$STAGING/package.json" ]]; then
  echo "Staging does not look like piclaw_runtime (need piclaw.js, package.json)." >&2
  exit 1
fi

echo "=== [piclaw] apt keyring + update (Kali rolling) ==="
apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg 2>/dev/null || true
apt-get install -y -qq --reinstall kali-archive-keyring 2>/dev/null || true
install -d -m 0755 /etc/apt/trusted.gpg.d
if [[ ! -f /etc/apt/trusted.gpg.d/kali-archive-keyring.gpg ]] && [[ ! -f /etc/apt/trusted.gpg.d/archive.kali.org.gpg ]]; then
  curl -fsSL https://archive.kali.org/archive-key.asc 2>/dev/null | gpg --dearmor -o /etc/apt/trusted.gpg.d/archive.kali.org.gpg 2>/dev/null \
    || wget -qO- https://archive.kali.org/archive-key.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/archive.kali.org.gpg
fi
apt-get update -qq || { echo "apt-get update failed (check keys / network in chroot)" >&2; exit 1; }

echo "=== [piclaw] apt: node, npm, tools ==="
apt-get install -y -qq --no-install-recommends \
  nodejs npm git ca-certificates curl python3-pip \
  || { echo "apt install failed" >&2; exit 1; }

echo "=== [piclaw] node ==="
node -v
npm -v

echo "=== [piclaw] copy $STAGING -> $INSTALL ==="
mkdir -p /opt
rm -rf "$INSTALL"
mkdir -p "$INSTALL"
cp -a "$STAGING"/. "$INSTALL/"
rm -rf "$INSTALL/node_modules" 2>/dev/null || true
# keep .env if present in staging; else fresh below
if [[ ! -f "$STAGING/.env" ]]; then
  rm -f "$INSTALL/.env" 2>/dev/null || true
fi
if [[ ! -f "$STAGING/state.json" ]]; then
  rm -f "$INSTALL/state.json" 2>/dev/null || true
fi

cd "$INSTALL"
echo "=== [piclaw] npm install --omit=dev (may take several minutes) ==="
npm install --omit=dev

if [[ -f "extensions/twitter_api/requirements.txt" ]]; then
  pip3 install --break-system-packages -q -r extensions/twitter_api/requirements.txt 2>/dev/null \
    || pip3 install -q -r extensions/twitter_api/requirements.txt 2>/dev/null \
    || true
fi

install -d -m 700 "$IDENTITY"
touch "$INSTALL/.env"
chmod 600 "$INSTALL/.env" 2>/dev/null || true
grep -qF OPENAI_BASE_URL= "$INSTALL/.env" 2>/dev/null || echo "OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1" >>"$INSTALL/.env"
grep -qF OPENAI_CHAT_MODEL= "$INSTALL/.env" 2>/dev/null || echo "OPENAI_CHAT_MODEL=z-ai/glm4.7" >>"$INSTALL/.env"
grep -qF PICLAW_GIT_CLONE_ROOT= "$INSTALL/.env" 2>/dev/null || echo "PICLAW_GIT_CLONE_ROOT=$INSTALL" >>"$INSTALL/.env"
grep -qF PICLAW_IDENTITY_PATH= "$INSTALL/.env" 2>/dev/null || echo "PICLAW_IDENTITY_PATH=$IDENTITY" >>"$INSTALL/.env"
grep -qF PICLAW_CHAT_MAX_TOOL_ROUNDS= "$INSTALL/.env" 2>/dev/null || echo "PICLAW_CHAT_MAX_TOOL_ROUNDS=12" >>"$INSTALL/.env"

cat >"$INSTALL/run-piclaw-nohup.sh" <<'EOS'
#!/usr/bin/env bash
# No systemd in NetHunter chroot. Logs to /opt/piclaw/piclaw.log
set -a
# shellcheck source=/dev/null
[ -f /opt/piclaw/.env ] && . /opt/piclaw/.env
set +a
cd /opt/piclaw
exec nohup /usr/bin/node /opt/piclaw/piclaw.js >>/opt/piclaw/piclaw.log 2>&1 &
echo $! > /opt/piclaw/piclaw.pid
echo "Piclaw started PID $(cat /opt/piclaw/piclaw.pid) — tail -f /opt/piclaw/piclaw.log"
EOS
chmod 755 "$INSTALL/run-piclaw-nohup.sh"

cat >"$INSTALL/run-piclaw-foreground.sh" <<'EOS'
#!/usr/bin/env bash
set -a
# shellcheck source=/dev/null
[ -f /opt/piclaw/.env ] && . /opt/piclaw/.env
set +a
cd /opt/piclaw
exec /usr/bin/node /opt/piclaw/piclaw.js
EOS
chmod 755 "$INSTALL/run-piclaw-foreground.sh"

echo ""
echo "=== [piclaw] done ==="
echo "Edit secrets:  nano $INSTALL/.env  (add PICLAW_TELEGRAM_TOKEN, OPENAI_API_KEY, etc.)"
echo "Start:         $INSTALL/run-piclaw-nohup.sh"
echo "Stop:          kill \$(cat $INSTALL/piclaw.pid)  # or pkill -f piclaw.js"
echo "This chroot has no real systemd; do not use systemctl for Piclaw here."
