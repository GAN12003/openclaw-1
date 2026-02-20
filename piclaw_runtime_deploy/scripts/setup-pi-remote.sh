#!/bin/bash
# Run this script ON the Pi (e.g. after SSH in) to install Node, runtime under /opt, and systemd.
# Prereq: piclaw_runtime already copied to ~/piclaw_runtime (e.g. via scp from your dev machine).
set -e

USER_NAME="${USER:-piclaw-01}"

echo "[setup-pi] checking Node..."
ARCH=$(uname -m)
NEED_NODE=0
if ! command -v node &>/dev/null; then
  NEED_NODE=1
else
  NODE_VER=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')
  [ -z "$NODE_VER" ] || [ "$NODE_VER" -lt 18 ] && NEED_NODE=1
fi
if [ "$NEED_NODE" -eq 1 ]; then
  # NodeSource only supports amd64/arm64; on 32-bit ARM (armv6l/armv7l/armhf) use distro Node
  case "$ARCH" in
    armv6l|armv7l|armhf)
      echo "[setup-pi] installing Node and npm from apt (32-bit ARM)..."
      sudo apt update
      sudo apt install -y nodejs npm
      ;;
    *)
      echo "[setup-pi] installing Node 20 (NodeSource)..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt install -y nodejs
      ;;
  esac
fi
node -v

echo "[setup-pi] installing system tools (git, gpiod, python3, pip)..."
sudo apt update
sudo apt install -y git gpiod python3 python3-pip

echo "[setup-pi] installing runtime under /opt/piclaw..."
sudo mkdir -p /opt/piclaw
sudo cp -r ~/piclaw_runtime/* /opt/piclaw/
sudo chown -R "$USER_NAME:$USER_NAME" /opt/piclaw
cd /opt/piclaw

echo "[setup-pi] npm install..."
npm install --omit=dev

if [ -f /opt/piclaw/extensions/twitter_api/requirements.txt ]; then
  echo "[setup-pi] optional: Twitter extension Python deps..."
  pip3 install -r /opt/piclaw/extensions/twitter_api/requirements.txt 2>/dev/null || true
fi

echo "[setup-pi] creating /etc/piclaw.env placeholder..."
if [ ! -f /etc/piclaw.env ]; then
  sudo touch /etc/piclaw.env
  echo "# Add PICLAW_TELEGRAM_TOKEN= and OPENAI_API_KEY= (sudo nano /etc/piclaw.env)" | sudo tee -a /etc/piclaw.env
fi

echo "[setup-pi] installing systemd service..."
if [ -f /opt/piclaw/piclaw.service ]; then
  sudo cp /opt/piclaw/piclaw.service /etc/systemd/system/
else
  sudo tee /etc/systemd/system/piclaw.service >/dev/null << 'SVCEOF'
[Unit]
Description=Piclaw Runtime
After=network-online.target local-fs.target
Wants=network-online.target

[Service]
Type=simple
User=piclaw-01
WorkingDirectory=/opt/piclaw
ExecStart=/usr/bin/node /opt/piclaw/piclaw.js
EnvironmentFile=/etc/piclaw.env
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF
fi

echo "[setup-pi] identity directory (optional)..."
sudo mkdir -p /opt/piclaw_identity
sudo chown -R "$USER_NAME:$USER_NAME" /opt/piclaw_identity
chmod 700 /opt/piclaw_identity 2>/dev/null || true

sudo systemctl daemon-reload
sudo systemctl enable piclaw
sudo systemctl restart piclaw

echo "[setup-pi] done. Check: systemctl status piclaw && journalctl -u piclaw -n 20"
echo "[setup-pi] Edit env: sudo nano /etc/piclaw.env (PICLAW_TELEGRAM_TOKEN, OPENAI_API_KEY)"
