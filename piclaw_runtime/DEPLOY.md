# Deploy Piclaw to Raspberry Pi

Copy **only** the runtime to the Pi (not the whole OpenClaw repo).

---

## On your dev machine (Windows / WSL)

```bash
scp -r openclaw/piclaw_runtime pi@<PI_IP>:/home/pi/
```

Or use WinSCP and copy the `piclaw_runtime` folder into `/home/pi/`.

---

## On the Raspberry Pi

SSH in:

```bash
ssh pi@<PI_IP>
```

### 1. Install Node (if needed)

```bash
node -v
```

If missing or &lt;18:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. System tools

```bash
sudo apt update
sudo apt install -y git gpiod
```

### 3. Install runtime under /opt

```bash
sudo mkdir -p /opt/piclaw
sudo cp -r ~/piclaw_runtime/* /opt/piclaw/
sudo chown -R pi:pi /opt/piclaw
cd /opt/piclaw
```

### 4. Node dependencies

```bash
npm install --omit=dev
```

### 4b. Twitter extension (optional, for `/twitter`)

If you use the Twitter integration, install Python deps for the extension:

```bash
pip install -r /opt/piclaw/extensions/twitter_api/requirements.txt
```

### 5. Environment (no .env in repo)

```bash
sudo nano /etc/piclaw.env
```

Add (replace with your values):

```
PICLAW_TELEGRAM_TOKEN=your_token
OPENAI_API_KEY=your_key
```

Save (Ctrl+O, Enter, Ctrl+X).

### 6. Install systemd service

Copy the service file from the repo to the Pi, then:

```bash
sudo cp /path/to/piclaw.service /etc/systemd/system/
# or create it:
sudo nano /etc/systemd/system/piclaw.service
```

Contents:

```ini
[Unit]
Description=Piclaw Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/piclaw
ExecStart=/usr/bin/node /opt/piclaw/piclaw.js
EnvironmentFile=/etc/piclaw.env
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 7. Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable piclaw
sudo systemctl start piclaw
```

### 8. Check status and logs

```bash
systemctl status piclaw
journalctl -u piclaw -f
```

### 9. Test from Telegram

Send **/status** to your bot. You should see Pi hostname, WiFi, and environment (not Windows).

---

## Identity layer (optional)

For durable identity and goal review across updates, create `/opt/piclaw_identity` and set permissions once:

```bash
sudo mkdir -p /opt/piclaw_identity
sudo chown -R pi:pi /opt/piclaw_identity
chmod 700 /opt/piclaw_identity
```

The A/B updater never touches this directory. See **docs/AB-UPDATE.md** and `.env.example` for `PICLAW_IDENTITY_PATH` and `PICLAW_GOAL_REVIEW_INTERVAL_HOURS`.

---

## A/B self-update (optional)

To let Piclaw update itself without overwriting the running code (two slots + symlink):

1. Set up A/B layout and install the external updater script.  
2. See **docs/AB-UPDATE.md** for steps and **scripts/piclaw-update.sh** for the script you install as `/usr/local/bin/piclaw-update`.  
3. Use **/selfcheck** and **/update** in Telegram to inspect and trigger updates.

---

## After it works

Next steps: UART detection, GPIO monitoring, network alerts, health confirmation + rollback for updates.
