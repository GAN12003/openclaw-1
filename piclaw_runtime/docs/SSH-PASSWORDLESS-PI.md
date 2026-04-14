# Passwordless SSH to a Piclaw Pi (for you and for automation)

Goal: from your **PC** (Windows / WSL / Mac), run `ssh gan12003@deagent04` (or your user@host) **without typing the account password**. You still use an **SSH key passphrase** if you set one on the key (recommended); that can be unlocked once per login via **ssh-agent**.

**Note:** Remote agents cannot use your home PC’s keys unless the session runs **on your machine** with your `~/.ssh` available. After you follow this guide, **your** terminal (including Cursor’s integrated terminal on your PC) can run remote commands non-interactively with `ssh -o BatchMode=yes …`.

---

## 1. On your Windows PC (PowerShell)

Create a key if you do not already have one:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519" -C "gan12003-pc-to-deagent04"
```

Press Enter for no passphrase, or set a passphrase (then use **Windows OpenSSH Authentication Agent** or `ssh-add` in Git Bash to unlock once per session).

Show your **public** key (safe to copy):

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
```

---

## 2. One-time: install the public key on the Pi (password allowed this once)

Replace `gan12003@deagent04` with your user and hostname or IP.

**Option A — single PowerShell line** (you type the Pi password once):

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh gan12003@deagent04 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

**Option B — manual:** SSH in with password, then on the Pi:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

Paste **one line** (the full `ssh-ed25519 AAAA…` from `id_ed25519.pub`), save, then:

```bash
chmod 600 ~/.ssh/authorized_keys
```

---

## 3. Commands to run **on the Pi** (only if something is wrong)

Fix ownership (keys must be owned by the login user):

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chown -R "$(whoami):$(whoami)" ~/.ssh
```

If SSH still asks for a password, check server logs (on Pi):

```bash
sudo journalctl -u ssh -n 50 --no-pager
```

Common causes: wrong permissions on `~` or `.ssh`, or `authorized_keys` not updated.

---

## 4. Test from the PC (no password)

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 gan12003@deagent04 "echo ok && hostname"
```

If this prints `ok` and the hostname **without** prompting, passwordless login works.

---

## 5. Optional: `~/.ssh/config` on the PC

```text
Host deagent04
  HostName deagent04
  User gan12003
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

Then: `ssh deagent04` or `ssh deagent04 "uname -a"`.

Use the Pi’s **LAN IP** in `HostName` if the short hostname does not resolve from your PC.

---

## 6. Optional: disable password login on the Pi (hardening)

**Only after** key login works and you have another way to recover the Pi (console / SD card).

On the Pi:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload ssh
```

(Exact directives depend on your Debian/Raspberry Pi OS version; verify with `sudo sshd -T | rg -i password`.)

---

## 7. Separate keys for GitHub vs for logging into the Pi

- **GitHub deploy keys** on the Pi (`id_ed25519_github_piclaw`, etc.) are for `git@github.com-piclaw` — do **not** reuse them as your PC→Pi login key.
- Your **PC** keeps `~/.ssh/id_ed25519` (or similar) **only** for SSH **into** the Pi.

See also [GITHUB-AGENTS.md](GITHUB-AGENTS.md) for deploy keys and [DEPLOY.md](../DEPLOY.md) for install.
