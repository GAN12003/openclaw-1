# A/B self-update on the Raspberry Pi

Piclaw **never overwrites itself**. It uses two slots and an external updater script. Follow this sequence once to activate, then use `/update` from Telegram for future updates.

---

## Phase 1: Activate A/B runtime

### 1. Copy the runtime to the Pi (from your dev machine)

```bash
scp -r piclaw_runtime pi@<PI_IP>:/home/pi/
```

---

### 2. Create the A/B structure (on the Pi)

```bash
sudo mkdir -p /opt/piclaw
cd /opt/piclaw

sudo mkdir piclaw_A
sudo mkdir piclaw_B
```

Install the first version into slot A:

```bash
sudo cp -r /home/pi/piclaw_runtime/* /opt/piclaw/piclaw_A/
sudo chown -R pi:pi /opt/piclaw
```

Create the active symlink:

```bash
sudo ln -sfn /opt/piclaw/piclaw_A /opt/piclaw/current
```

---

### 3. Install dependencies for slot A

```bash
cd /opt/piclaw/current
npm install --omit=dev
```

If you use the Twitter extension:

```bash
pip3 install -r /opt/piclaw/current/extensions/twitter_api/requirements.txt
```

---

### 4. Install the updater script

```bash
sudo cp /opt/piclaw/current/scripts/piclaw-update.sh /usr/local/bin/piclaw-update
sudo chmod +x /usr/local/bin/piclaw-update
which piclaw-update
```

---

### 5. systemd: run through the symlink

```bash
sudo nano /etc/systemd/system/piclaw.service
```

Ensure:

```ini
ExecStart=/usr/bin/node /opt/piclaw/current/piclaw.js
WorkingDirectory=/opt/piclaw/current
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable piclaw
sudo systemctl restart piclaw
```

---

### 6. Confirm Piclaw is running from slot A

```bash
journalctl -u piclaw -n 20
```

In Telegram send **/selfcheck**. You should see something like:

- Slot: piclaw_A  
- Runtime writable: yes  
- Version: 0.1.0  

---

## Phase 2: Test the first self-update

Before triggering `/update`, put something in the other slot so the updater has content to copy (the script copies from `~/piclaw_runtime` into the inactive slot). Either:

- Copy the runtime again to `~/piclaw_runtime` and run `/update`, or  
- For a quick test, create a marker in B and run the updater (it will overwrite B with the copy from home).

**Option A — real update test:** copy a fresh runtime to the Pi, then:

```bash
# On dev machine
scp -r piclaw_runtime pi@<PI_IP>:/home/pi/
```

On the Pi, trigger from Telegram:

```
/update
```

**Option B — quick slot switch test:** ensure `~/piclaw_runtime` exists (e.g. still there from step 1). Then in Telegram:

```
/update
```

Watch logs:

```bash
journalctl -u piclaw -f
```

You should see:

- `[piclaw-update] staging update into /opt/piclaw/piclaw_B`
- `[piclaw-update] switching active slot`
- `[piclaw-update] restarting service`

---

### 7. Verify slot switched

In Telegram:

```
/selfcheck
```

It should now show **Slot: piclaw_B**. That confirms the A/B mechanism works.

---

## Customising where updates come from

Edit `/usr/local/bin/piclaw-update` and change the “FETCH NEW VERSION” block:

- **Copy from home:** keep `cp -r /home/pi/piclaw_runtime/* "$TARGET.new/"`; copy new runtime to `~/piclaw_runtime` before each `/update`.
- **Git:** replace with `git clone ... "$TARGET.new"` (and remove `.git` if needed).
- **rsync:** add an `rsync` from your dev machine or CI.

---

## Identity directory (outside A/B)

Piclaw’s **identity layer** (durable memory, goals, experiences) lives in `/opt/piclaw_identity`. The A/B updater **never** touches this directory, so identity survives slot swaps, redeploys, and rollbacks.

To enable the identity layer:

1. Create the directory: `sudo mkdir -p /opt/piclaw_identity`
2. Set ownership and permissions: `sudo chown -R pi:pi /opt/piclaw_identity` and `chmod 700 /opt/piclaw_identity` (use the user that runs Piclaw, e.g. `pi`)
3. Optionally set `PICLAW_IDENTITY_PATH` in env if you use a different path.

If the directory is missing, the runtime still runs; `/whoami` and the goal review loop use in-memory defaults or no-op. See `.env.example` for `PICLAW_IDENTITY_PATH` and `PICLAW_GOAL_REVIEW_INTERVAL_HOURS`.

---

## Rollback protection (implemented)

The updater script waits up to 20s for Piclaw to write `/opt/piclaw/current/.boot-ok` after startup. Piclaw creates this file once the runtime is ready (watchdog + Telegram init). If the file never appears:

- The updater reverts the `current` symlink to the previous slot.
- Restarts the service (previous slot runs again).
- Exits with code 1.

So a bad deploy (e.g. syntax error, crash on load) is automatically rolled back without manual SSH.

**Test rollback:** introduce a trivial break (e.g. syntax error in a required file), run `/update`, and watch logs. You should see `[piclaw-update] health check failed — rolling back` and `/selfcheck` still reporting the original slot.

---

## Power loss and recovery

The service file is set up so that after a power cut the Pi comes back in a known-good state:

- **`Restart=always`** and **`RestartSec=5`** — if Piclaw crashes or the Pi was mid-update, systemd keeps retrying.
- **`After=network-online.target local-fs.target`** — start only after local filesystems (e.g. `/opt` on SD) and network are up.
- **A/B + symlink** — the last working slot is never overwritten; rollback already reverted `current` if the new slot failed.
- **Startup log** — if the last heartbeat is older than ~90s, Piclaw logs `recovered from unexpected shutdown` for awareness.

Verify on the Pi: `systemctl cat piclaw` and confirm `Restart=always`, `RestartSec=5`, and `After=... local-fs.target` are present.
