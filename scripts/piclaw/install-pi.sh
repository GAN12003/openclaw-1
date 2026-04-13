#!/usr/bin/env bash
# One-shot Piclaw install on Raspberry Pi OS: clone repo, npm install, systemd, enable at boot.
# Run as the login user that will own /opt/piclaw (not root). Uses sudo where needed.
#
# Usage:
#   export PICLAW_REPO_SSH="git@github.com-piclaw:OWNER/openclaw-1.git"   # or HTTPS URL
#   bash install-pi.sh
#
# Optional:
#   PICLAW_GIT_CLONE_ROOT  default: $HOME/src
#   PICLAW_REPO_DIR_NAME   default: openclaw-1
#   PICLAW_RUNTIME_BRANCH  default: main (e.g. deagent01-runtime when branch exists on origin)
#
# After install: edit /opt/piclaw/.env (Telegram, OPENAI_API_KEY), then:
#   sudo systemctl restart piclaw

set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run as a normal user (e.g. gan12003), not root."
  exit 1
fi

PICLAW_USER="$(id -un)"
PICLAW_GROUP="$(id -gn)"
CLONE_ROOT="${PICLAW_GIT_CLONE_ROOT:-$HOME/src}"
REPO_DIR_NAME="${PICLAW_REPO_DIR_NAME:-openclaw-1}"
REPO_URL="${PICLAW_REPO_SSH:-git@github.com-piclaw:GAN12003/openclaw-1.git}"
RUNTIME_SRC_NAME="piclaw_runtime"
INSTALL_ROOT="/opt/piclaw"
IDENTITY_ROOT="/opt/piclaw_identity"

mkdir -p "$CLONE_ROOT"
REPO_PATH="$CLONE_ROOT/$REPO_DIR_NAME"
RUNTIME_BRANCH="${PICLAW_RUNTIME_BRANCH:-main}"

sync_repo_branch() {
  local rp="$1"
  local br="$RUNTIME_BRANCH"
  git -C "$rp" fetch origin
  if [[ "$br" == "main" ]]; then
    git -C "$rp" checkout main
    git -C "$rp" pull --ff-only origin main || true
    return 0
  fi
  if git -C "$rp" show-ref --verify --quiet "refs/remotes/origin/$br"; then
    git -C "$rp" checkout "$br"
    git -C "$rp" pull --ff-only "origin" "$br" || true
    return 0
  fi
  echo "[install-pi] No origin/$br — using main (create the branch on GitHub or unset PICLAW_RUNTIME_BRANCH)"
  git -C "$rp" checkout main
  git -C "$rp" pull --ff-only origin main || true
}

if [[ ! -d "$REPO_PATH/.git" ]]; then
  echo "[install-pi] Cloning $REPO_URL -> $REPO_PATH"
  git clone "$REPO_URL" "$REPO_PATH"
  sync_repo_branch "$REPO_PATH"
else
  echo "[install-pi] Updating existing clone $REPO_PATH"
  sync_repo_branch "$REPO_PATH"
fi

if [[ ! -d "$REPO_PATH/$RUNTIME_SRC_NAME" ]]; then
  echo "error: $REPO_PATH/$RUNTIME_SRC_NAME not found"
  exit 1
fi

echo "[install-pi] Installing system packages (git, gpiod, node, npm, Twitter extension Python libs)..."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git gpiod curl ca-certificates nodejs npm python3-pip python3-aiohttp python3-aiofiles

echo "[install-pi] Syncing $RUNTIME_SRC_NAME -> $INSTALL_ROOT"
sudo mkdir -p "$INSTALL_ROOT"
if [[ -f "$INSTALL_ROOT/.env" ]]; then sudo cp -a "$INSTALL_ROOT/.env" /tmp/piclaw.env.installbak; fi
if [[ -f "$INSTALL_ROOT/state.json" ]]; then sudo cp -a "$INSTALL_ROOT/state.json" /tmp/piclaw.state.installbak; fi
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude state.json \
  "$REPO_PATH/$RUNTIME_SRC_NAME/" "$INSTALL_ROOT/"
if [[ -f /tmp/piclaw.env.installbak ]]; then sudo mv /tmp/piclaw.env.installbak "$INSTALL_ROOT/.env"; fi
if [[ -f /tmp/piclaw.state.installbak ]]; then sudo mv /tmp/piclaw.state.installbak "$INSTALL_ROOT/state.json"; fi

sudo chown -R "$PICLAW_USER:$PICLAW_GROUP" "$INSTALL_ROOT"
sudo mkdir -p "$IDENTITY_ROOT"
sudo chown -R "$PICLAW_USER:$PICLAW_GROUP" "$IDENTITY_ROOT"
sudo chmod 700 "$IDENTITY_ROOT"

echo "[install-pi] npm install --omit=dev"
cd "$INSTALL_ROOT"
npm install --omit=dev

if [[ -f "$INSTALL_ROOT/extensions/twitter_api/requirements.txt" ]]; then
  echo "[install-pi] pip install twitter_api requirements (optional)"
  sudo pip3 install --break-system-packages -q -r "$INSTALL_ROOT/extensions/twitter_api/requirements.txt" 2>/dev/null \
    || sudo pip3 install -q -r "$INSTALL_ROOT/extensions/twitter_api/requirements.txt" 2>/dev/null \
    || true
fi

touch "$INSTALL_ROOT/.env"
chmod 600 "$INSTALL_ROOT/.env" 2>/dev/null || true
grep -qF OPENAI_BASE_URL= "$INSTALL_ROOT/.env" 2>/dev/null || echo "OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1" >> "$INSTALL_ROOT/.env"
grep -qF OPENAI_CHAT_MODEL= "$INSTALL_ROOT/.env" 2>/dev/null || echo "OPENAI_CHAT_MODEL=z-ai/glm4.7" >> "$INSTALL_ROOT/.env"
grep -qF PICLAW_GIT_CLONE_ROOT= "$INSTALL_ROOT/.env" 2>/dev/null || echo "PICLAW_GIT_CLONE_ROOT=$REPO_PATH" >> "$INSTALL_ROOT/.env"
grep -qF PICLAW_IDENTITY_PATH= "$INSTALL_ROOT/.env" 2>/dev/null || echo "PICLAW_IDENTITY_PATH=$IDENTITY_ROOT" >> "$INSTALL_ROOT/.env"
grep -qF PICLAW_CHAT_MAX_TOOL_ROUNDS= "$INSTALL_ROOT/.env" 2>/dev/null || echo "PICLAW_CHAT_MAX_TOOL_ROUNDS=12" >> "$INSTALL_ROOT/.env"

SERVICE_SRC="$REPO_PATH/$RUNTIME_SRC_NAME/piclaw.service"
if [[ ! -f "$SERVICE_SRC" ]]; then
  echo "error: missing $SERVICE_SRC"
  exit 1
fi

echo "[install-pi] Installing systemd unit (user=$PICLAW_USER)"
sudo sed "s/^User=.*/User=$PICLAW_USER/; s/^Group=.*/Group=$PICLAW_GROUP/" "$SERVICE_SRC" | sudo tee /etc/systemd/system/piclaw.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable piclaw.service
sudo systemctl restart piclaw.service

echo "[install-pi] Done. Status:"
sudo systemctl --no-pager -l status piclaw.service | head -20
echo ""
echo "Next: add PICLAW_TELEGRAM_TOKEN and OPENAI_API_KEY to $INSTALL_ROOT/.env then: sudo systemctl restart piclaw"
