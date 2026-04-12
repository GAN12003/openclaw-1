# Deploy Piclaw to Raspberry Pi

Copy **only** the runtime to the Pi (not the whole OpenClaw repo).

## Automated install (Linux Pi, clone + systemd + boot)

From the Pi, after SSH and GitHub deploy keys (or HTTPS) are set:

```bash
curl -fsSL -o /tmp/install-pi.sh https://raw.githubusercontent.com/GAN12003/openclaw-1/main/scripts/piclaw/install-pi.sh
# or copy scripts/piclaw/install-pi.sh from a clone
chmod +x /tmp/install-pi.sh
export PICLAW_REPO_SSH="git@github.com-piclaw:GAN12003/openclaw-1.git"
bash /tmp/install-pi.sh
```

This installs Node deps, syncs `piclaw_runtime` → `/opt/piclaw`, installs **`piclaw.service`**, runs **`systemctl enable --now piclaw`** so Piclaw **starts on every boot** and **restarts on crash** (`Restart=always`). Then edit `/opt/piclaw/.env` and `sudo systemctl restart piclaw`.

---

## One-time full setup (Windows)

From the repo root, with the Pi on and reachable (e.g. 192.168.178.50):

```powershell
cd piclaw_runtime\scripts
.\deploy-to-pi.ps1 192.168.178.50
```

Enter password **piclaw** when prompted. Then on the Pi edit env and restart:

```bash
ssh piclaw-01@192.168.178.50
sudo nano /etc/piclaw.env   # add PICLAW_TELEGRAM_TOKEN= and OPENAI_API_KEY=
sudo systemctl restart piclaw
```

---

## On your dev machine (Windows / WSL)

```bash
scp -r piclaw_runtime piclaw-01@<PI_IP>:/home/piclaw-01/
```

Or use WinSCP and copy the `piclaw_runtime` folder into `/home/piclaw-01/`.  
Default password for `piclaw-01`: **piclaw** (or use SSH keys).

---

## On the Raspberry Pi

SSH in (hostname is typically **piclaw-node**, user **piclaw-01**):

```bash
ssh piclaw-01@<PI_IP>
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
sudo chown -R piclaw-01:piclaw-01 /opt/piclaw
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

### 4c. Twitter: one X account per Pi (cookie auth)

Piclaw does **not** use Twitter API keys. It uses **browser cookies** only: `PICLAW_TWITTER_AUTH_TOKEN` and `PICLAW_TWITTER_CT0` (optional: `PICLAW_TWITTER_SCREEN_NAME` for clarity). Set these **on each Pi separately** in `/opt/piclaw/.env` (or via Telegram `/set_key` + value message). Never commit real values.

**Example mapping (replace handles if yours differ):**

| Pi / agent | X (Twitter) account | Env on **that** Pi only |
|------------|---------------------|-------------------------|
| deAgent02 | @B4se_Sat0shi | `PICLAW_TWITTER_AUTH_TOKEN`, `PICLAW_TWITTER_CT0`, `PICLAW_TWITTER_SCREEN_NAME=B4se_Sat0shi` |
| deAgent03 | @yourcompanylist | `PICLAW_TWITTER_AUTH_TOKEN`, `PICLAW_TWITTER_CT0`, `PICLAW_TWITTER_SCREEN_NAME=yourcompanylist` |

After editing env: `sudo systemctl restart piclaw`. Use `/twitter` on Telegram to verify read-only status for that node.

### 4d. Agent profile (`/opt/piclaw_identity/self.json`)

Set `name`, `agent_id`, `contact_email` (convention `deAgentNN@yopmail.com`), optional `profile_image` (e.g. `setup_piclaw/piclaw_default.jpg` under `/opt/piclaw`), optional `credential_hint` for operator inbox hints. **Do not** put Twitter cookies in `self.json` — use `.env` (`PICLAW_TWITTER_*`). `/status` shows **runtime** `device_id` from `state.json`; `/whoami` shows both runtime and identity `device_id` unless you align them manually.

**Where things live:** identity dir = mission, values, goals, experiences, knowledge. **Workspaces** git repo (`<hostname>-workspace`) = structured notes, logs, `memory/`, `skills/` — see `templates/agent-workspace/GIT.md` and `IDENTITY.template.md`.

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

## Setting env from Telegram (optional)

So Piclaw can ask for tokens and you can paste them in chat (your message is then deleted):

1. Set **PICLAW_TELEGRAM_CHAT_ID** in `/etc/piclaw.env` to your Telegram chat ID. Only that chat can use `/set_key`.
2. On the Pi, make the append script executable and allow the service user to run it (and optionally restart Piclaw) without a password:

```bash
sudo chmod +x /opt/piclaw/scripts/append-piclaw-env.sh
sudo visudo -f /etc/sudoers.d/piclaw-env
```

Add this line (use your service user, e.g. `piclaw-02` or `piclaw-01`):

```
piclaw-02 ALL=(ALL) NOPASSWD: /opt/piclaw/scripts/append-piclaw-env.sh
```

Optional — allow restart from the bot:

```
piclaw-02 ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart piclaw
```

Save and exit. Then in Telegram: **/setup** to see missing integrations and allowed keys; **/set_key KEY_NAME** then send the value in the next message. The bot adds it to `/etc/piclaw.env` and deletes your message.

---

## Identity layer (optional)

For durable identity and goal review across updates, create `/opt/piclaw_identity` and set permissions once. The scripts/setup-pi-remote.sh script already creates the directory; if you install manually, run:

```bash
sudo mkdir -p /opt/piclaw_identity
sudo chown -R piclaw-01:piclaw-01 /opt/piclaw_identity
chmod 700 /opt/piclaw_identity
```

**Minimal identity files**: The directory alone is not enough — the runtime expects at least `self.json` and `goals.json`. Two options:

1. **Bootstrap script (recommended)** — On the Pi, from the runtime directory:
   ```bash
   node scripts/bootstrap-identity.js
   ```
   This creates the identity dir if missing and writes minimal `self.json`, `goals.json`, `meta.json`, and related files from defaults (device_id comes from core identity). Then edit `self.json` to set your mission and `goals.json` for long/short-term goals.

2. **Manual** — Create `self.json` and `goals.json` under `/opt/piclaw_identity`. Schema: `self.json` should have `device_id`, `name`, `owner`, `mission`, `values` (array); `goals.json` should have `long_term`, `mid_term`, `short_term` (arrays of strings or `{ text }`). See `identity_bridge/defaults.js` in the repo for default shapes.

If identity is not configured, `/whoami` and goal review will report "Identity layer not configured". Use **/setup** in Telegram to see a reminder; then run the bootstrap script or create the files as above.

**Production / strict permissions**: For strict identity protection set `PICLAW_IDENTITY_STRICT_PERMS=1` in env. The runtime will then refuse to start unless `/opt/piclaw_identity` exists with mode **0700** and ownership by the process user. Fix with: `chmod 700 /opt/piclaw_identity` and `chown -R <process-user> /opt/piclaw_identity`.

The A/B updater never touches this directory. See **docs/AB-UPDATE.md** and `.env.example` for `PICLAW_IDENTITY_PATH` and `PICLAW_GOAL_REVIEW_INTERVAL_HOURS`.

### Codex OAuth via Telegram

To authorize OpenAI Codex (ChatGPT OAuth) for future use (e.g. programming/refactor tools), send **/codex_login** in Telegram (owner chat only). The bot will send an auth URL; open it in your browser, sign in, then paste the **full redirect URL** (the page you are redirected to) back into the chat. Credentials are stored under the identity root as `codex_credentials.json`. When the session expires or you want a new one, run **/codex_login** again to get a fresh URL. See **docs/audit/09_codex_telegram_auth.md** for the full plan.

---

## A/B self-update (optional)

To let Piclaw update itself without overwriting the running code (two slots + symlink):

1. Set up A/B layout and install the external updater script.  
2. See **docs/AB-UPDATE.md** for steps and **scripts/piclaw-update.sh** for the script you install as `/usr/local/bin/piclaw-update`.  
3. Use **/selfcheck** and **/update** in Telegram to inspect and trigger updates.

---

## Optional hardware: I2C LCD 1602

To show expressions (e.g. "I remain operational.", presence and perception lines) on a physical 16x2 LCD:

1. Wire an I2C LCD 1602 (e.g. with PCF8574) to the Pi's I2C bus. Enable I2C: `sudo raspi-config` → Interface Options → I2C.
2. Find the display address: `sudo i2cdetect -y 1` (often `0x27`).
3. Install the driver: `npm install lcdi2c` in the runtime directory (`/opt/piclaw`).
4. In `/etc/piclaw.env` (or `.env`): `PICLAW_LCD_ENABLED=1` and optionally `PICLAW_LCD_I2C_ADDR=0x27`.
5. Restart Piclaw. If the module or I2C is unavailable, the runtime continues without the display.

---

## Quick copy-paste (Windows → Pi)

**1. Windows** — from repo root. Replace `192.168.178.50` with your Pi IP.

```powershell
cd c:\Users\IFLW016\Desktop\openclaw-1
scp -r piclaw_runtime piclaw-01@192.168.178.50:/home/piclaw-01/
```

(If `scp` not found, use WSL: `wsl scp -r piclaw_runtime piclaw-01@192.168.178.50:/home/piclaw-01/`)

**2. Raspi** — SSH in (password: **piclaw**), then copy-paste each block.

```bash
ssh piclaw-01@192.168.178.50
```

```bash
sudo cp -r /home/piclaw-01/piclaw_runtime/* /opt/piclaw/
sudo systemctl restart piclaw
```

```bash
systemctl status piclaw
journalctl -u piclaw -f
```

To only update after first-time setup: run the Windows `scp` line, then on the Pi the `sudo cp` and `sudo systemctl restart piclaw` lines.

**First time on Pi (full setup)** — run once when `/opt/piclaw` does not exist yet. Then add env (see below) and start.

```bash
ssh piclaw-01@192.168.178.50
```

```bash
sudo apt update && sudo apt install -y git gpiod nodejs npm python3 python3-pip
sudo apt install -y python3-serial
sudo mkdir -p /opt/piclaw
sudo cp -r ~/piclaw_runtime/* /opt/piclaw/
sudo chown -R piclaw-01:piclaw-01 /opt/piclaw
cd /opt/piclaw && npm install --omit=dev
```

```bash
sudo nano /etc/piclaw.env
```
Add: `PICLAW_TELEGRAM_TOKEN=...` and `OPENAI_API_KEY=...` and `PICLAW_TELEGRAM_CHAT_ID=...` (one per line). Save: Ctrl+O, Enter, Ctrl+X.

```bash
sudo cp /opt/piclaw/piclaw.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable piclaw && sudo systemctl start piclaw
systemctl status piclaw
```

---

## All commands (copy-paste)

Replace `<PI_IP>` with your Pi IP (e.g. `192.168.178.50`). User: **piclaw-01**, password: **piclaw**.

### From Windows (one-time deploy)

```powershell
cd piclaw_runtime\scripts
.\deploy-to-pi.ps1 192.168.178.50
```

### On the Pi (after SSH)

```bash
ssh piclaw-01@<PI_IP>
```

If the deploy script already ran, skip to **Edit env** below. Otherwise run a full setup:

**Node + system tools + runtime**

```bash
node -v
```

If Node is missing or &lt;18, on 32-bit ARM (e.g. Pi 3):

```bash
sudo apt update
sudo apt install -y nodejs npm
```

On 64-bit:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

```bash
sudo apt update
sudo apt install -y git gpiod python3 python3-pip
sudo mkdir -p /opt/piclaw
sudo cp -r ~/piclaw_runtime/* /opt/piclaw/
sudo chown -R piclaw-01:piclaw-01 /opt/piclaw
cd /opt/piclaw
npm install --omit=dev
```

**UART probe (for /probe_uart)**

```bash
pip3 install -r /opt/piclaw/extensions/uart_probe/requirements.txt
```

**Twitter extension (optional, for /twitter)**

```bash
pip3 install -r /opt/piclaw/extensions/twitter_api/requirements.txt
```

**Edit env**

```bash
sudo nano /etc/piclaw.env
```

Add (replace with your values):

```
PICLAW_TELEGRAM_TOKEN=your_bot_token
PICLAW_TELEGRAM_CHAT_ID=your_chat_id
OPENAI_API_KEY=your_openai_key
```

Save: Ctrl+O, Enter, Ctrl+X.

**Systemd**

```bash
sudo cp /opt/piclaw/piclaw.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable piclaw
sudo systemctl start piclaw
```

**Identity dir (optional, for durable goals/identity)**

```bash
sudo mkdir -p /opt/piclaw_identity
sudo chown -R piclaw-01:piclaw-01 /opt/piclaw_identity
chmod 700 /opt/piclaw_identity
```

**Restart and check**

```bash
sudo systemctl restart piclaw
systemctl status piclaw
journalctl -u piclaw -f
```

Test in Telegram: send **/status** and a plain message (e.g. **Hey**) to the bot.

---

## Rollout after a leak or config change

1. **Rotate** any GitHub PAT that was pasted in chat or committed; create a new token with minimal scopes and set it only in `/opt/piclaw/.env` (or `/set_key`), never in `self.json` or templates.
2. Set per-agent env: `PICLAW_GITHUB_PAT`, optional `PICLAW_GITHUB_USERNAME`, optional `PICLAW_GITHUB_ORG`, `PICLAW_GIT_CLONE_ROOT` if the clone is not `~/src/openclaw-1`, and `PICLAW_TELEGRAM_CHAT_ID` for owner-only commands.
3. Land fixes on `main`, then on each Pi merge or fast-forward the agent runtime branch, **or** use owner Telegram **`/updateandrestart`** once `sudoers` allows the update script (see `piclaw_runtime/docs/GITHUB-AGENTS.md`).
4. Verify: **`/github`**, **`/status`** (Integrations + Economy), **`/showupdates`**, **`/suggestgit`**, then one controlled **`/updateandrestart`** if applicable.

---

## After it works

Next steps: UART detection, GPIO monitoring, network alerts, health confirmation + rollback for updates.
