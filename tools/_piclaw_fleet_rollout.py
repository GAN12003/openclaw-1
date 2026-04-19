"""Roll Piclaw runtime on fleet via SSH; set PICLAW_SSH_PASSWORD for gan12003."""
from __future__ import annotations

import os
import shlex
import sys

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Connect by LAN IP (Fritz!Box) so flaky mDNS/DNS on the operator PC does not break SSH.
HOSTS = [
    ("deAgent02", "192.168.178.60"),
    ("deAgent03", "192.168.178.61"),
    ("deAgent04", "192.168.178.50"),
    ("deagent05", "192.168.178.62"),
]
USER = "gan12003"

# Same logic as scripts/piclaw/sync-piclaw-fleet.sh + unmask piclaw + enable.
# Uses sudo -S so non-interactive SSH works when login password matches sudo.
REMOTE_BODY = r'''set -eu -o pipefail
echo "=== $(hostname) roll start $(date -Is) ==="
_s systemctl unmask piclaw.service 2>/dev/null || true

REPO=""
for C in "$HOME/src/openclaw-1" "$HOME/openclaw-1"; do
  if [[ -d "$C/.git" ]]; then REPO="$C"; break; fi
done

if [[ -z "${REPO}" ]]; then
  echo "[roll] no clone under ~/src|~/openclaw-1 — bootstrapping HTTPS clone (public repo)"
  mkdir -p "$HOME/src"
  if [[ ! -d "$HOME/src/openclaw-1/.git" ]]; then
    git clone https://github.com/GAN12003/openclaw-1.git "$HOME/src/openclaw-1"
  fi
  REPO="$HOME/src/openclaw-1"
  HN="$(hostname | tr '[:upper:]' '[:lower:]')"
  BR_BOOT="${HN}-runtime"
  git -C "${REPO}" fetch origin
  if git -C "${REPO}" show-ref --verify --quiet "refs/remotes/origin/${BR_BOOT}"; then
    git -C "${REPO}" checkout "${BR_BOOT}"
    git -C "${REPO}" pull --ff-only origin "${BR_BOOT}" || true
  else
    echo "[roll] origin/${BR_BOOT} missing — using main"
    git -C "${REPO}" checkout main
    git -C "${REPO}" pull --ff-only origin main || true
  fi
fi

BR=main
if [[ -f /opt/piclaw/.env ]]; then
  line="$(grep -E '^[[:space:]]*PICLAW_RUNTIME_BRANCH=' /opt/piclaw/.env 2>/dev/null | tail -1 || true)"
  if [[ -n "${line}" ]]; then
    BR="${line#*=}"
    BR="$(echo "${BR}" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  fi
fi
[[ -z "${BR}" ]] && BR=main

git -C "${REPO}" fetch origin
if git -C "${REPO}" show-ref --verify --quiet "refs/remotes/origin/${BR}"; then
  git -C "${REPO}" checkout "${BR}"
  git -C "${REPO}" pull --ff-only origin "${BR}"
else
  echo "[roll] origin/${BR} missing — trying hostname-runtime"
  HN="$(hostname | tr '[:upper:]' '[:lower:]')"
  BR2="${HN}-runtime"
  if git -C "${REPO}" show-ref --verify --quiet "refs/remotes/origin/${BR2}"; then
    git -C "${REPO}" checkout "${BR2}"
    git -C "${REPO}" pull --ff-only origin "${BR2}"
    BR="${BR2}"
  else
    echo "[roll] origin/${BR2} missing — checkout main + pull"
    git -C "${REPO}" checkout main 2>/dev/null || git -C "${REPO}" checkout master
    git -C "${REPO}" pull --ff-only
    BR="main"
  fi
fi

echo "[roll] repo=${REPO} branch=$(git -C "${REPO}" rev-parse --abbrev-ref HEAD) sha=$(git -C "${REPO}" rev-parse --short HEAD)"

_s mkdir -p /opt/piclaw
if [[ -f /opt/piclaw/.env ]]; then _s cp -a /opt/piclaw/.env /tmp/piclaw.env.fleetsync; fi
if [[ -f /opt/piclaw/state.json ]]; then _s cp -a /opt/piclaw/state.json /tmp/piclaw.state.fleetsync; fi
_s rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude state.json \
  "${REPO}/piclaw_runtime/" /opt/piclaw/
if [[ -f /tmp/piclaw.env.fleetsync ]]; then _s mv /tmp/piclaw.env.fleetsync /opt/piclaw/.env; fi
if [[ -f /tmp/piclaw.state.fleetsync ]]; then _s mv /tmp/piclaw.state.fleetsync /opt/piclaw/state.json; fi
_s chown -R "$(id -un):$(id -gn)" /opt/piclaw
touch /opt/piclaw/.env
HN="$(hostname | tr '[:upper:]' '[:lower:]')"
grep -q "^PICLAW_RUNTIME_BRANCH=" /opt/piclaw/.env || echo "PICLAW_RUNTIME_BRANCH=${HN}-runtime" >> /opt/piclaw/.env
grep -q "^PICLAW_GIT_CLONE_ROOT=" /opt/piclaw/.env || echo "PICLAW_GIT_CLONE_ROOT=${REPO}" >> /opt/piclaw/.env
grep -q "^PICLAW_IDENTITY_PATH=" /opt/piclaw/.env || echo "PICLAW_IDENTITY_PATH=/opt/piclaw_identity" >> /opt/piclaw/.env
_s mkdir -p /opt/piclaw_identity
_s chown "$(id -un):$(id -gn)" /opt/piclaw_identity
_s chmod 700 /opt/piclaw_identity
chmod 600 /opt/piclaw/.env 2>/dev/null || true
cd /opt/piclaw
npm install --omit=dev --no-fund --no-audit --loglevel=warn

# Install systemd unit if missing (some Pis had runtime rsync’d but never ran install-pi systemd step).
if [[ -f /opt/piclaw/piclaw.service ]] && [[ ! -f /etc/systemd/system/piclaw.service ]]; then
  echo "[roll] installing /etc/systemd/system/piclaw.service from /opt/piclaw/piclaw.service"
  _s cp /opt/piclaw/piclaw.service /etc/systemd/system/piclaw.service
fi

_s systemctl daemon-reload 2>/dev/null || true
_s systemctl enable piclaw.service 2>/dev/null || true
_s systemctl restart piclaw.service
sleep 2
echo "[roll] piclaw.service: $(_s systemctl is-active piclaw.service 2>/dev/null || echo unknown)"
_s systemctl --no-pager -l status piclaw.service 2>/dev/null | head -n 18 || true
echo "=== $(hostname) roll end ==="
'''


def merge_telegram_token(client: paramiko.SSHClient, token: str) -> None:
    """Merge PICLAW_TELEGRAM_TOKEN into /opt/piclaw/.env (token never logged)."""
    line = f"PICLAW_TELEGRAM_TOKEN={token.strip()}\n"
    tmp = f"/home/{USER}/.piclaw_token_line.new"
    sftp = client.open_sftp()
    with sftp.file(tmp, "w") as fh:
        fh.write(line)
    sftp.chmod(tmp, 0o600)
    sftp.close()
    pw = os.environ.get("PICLAW_SSH_PASSWORD", "")
    q = shlex.quote(os.environ.get("PICLAW_SUDO_PASSWORD", pw))
    remote = f"""export PICLAW_SUDO_PASS={q}
_s(){{ printf '%s\\n' "${{PICLAW_SUDO_PASS}}" | sudo -S -p '' "$@"; }}
set -e
( grep -v "^PICLAW_TELEGRAM_TOKEN=" /opt/piclaw/.env 2>/dev/null || true ) > /tmp/piclaw_env_no_tok
cat /tmp/piclaw_env_no_tok {tmp} | _s tee /opt/piclaw/.env >/dev/null
rm -f /tmp/piclaw_env_no_tok {tmp}
_s chown {USER}:{USER} /opt/piclaw/.env
chmod 600 /opt/piclaw/.env
_s systemctl restart piclaw.service 2>/dev/null || true
echo "[roll] Telegram token merged; piclaw restarted"
"""
    stdin, stdout, stderr = client.exec_command(remote, timeout=120, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("STDERR:", err.rstrip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(f"token-merge EXIT {code}")


def build_remote(login_password: str) -> str:
    sudo_pw = os.environ.get("PICLAW_SUDO_PASSWORD", login_password)
    q = shlex.quote(sudo_pw)
    return (
        f"export PICLAW_SUDO_PASS={q}\n"
        "_s(){ printf '%s\\n' \"${PICLAW_SUDO_PASS}\" | sudo -S -p '' \"$@\"; }\n"
        + REMOTE_BODY
    )


def main() -> int:
    password = os.environ.get("PICLAW_SSH_PASSWORD", "")
    if not password:
        print("Set environment variable PICLAW_SSH_PASSWORD", file=sys.stderr)
        return 2
    for label, ip in HOSTS:
        print("\n" + "=" * 20, f"{label} ({ip})", "=" * 20)
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                hostname=ip,
                username=USER,
                password=password,
                timeout=25,
                allow_agent=False,
                look_for_keys=False,
                banner_timeout=30,
            )
            stdin, stdout, stderr = client.exec_command(
                build_remote(password), timeout=2400, get_pty=True
            )
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            print(out.rstrip())
            if err.strip():
                print("STDERR:", err.rstrip())
            code = stdout.channel.recv_exit_status()
            if code != 0:
                print(f"EXIT {code}")
            tg = os.environ.get("PICLAW_TELEGRAM_TOKEN_DEAGENT05", "").strip()
            if tg and label.lower() == "deagent05":
                print("[roll] merging PICLAW_TELEGRAM_TOKEN for deagent05 …")
                merge_telegram_token(client, tg)
        except Exception as exc:
            print("ERROR:", repr(exc))
        finally:
            client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
