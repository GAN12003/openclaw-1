#!/usr/bin/env python3
"""
Standalone heartbeat: posts "PiClaw-02 alive – <timestamp>" to Telegram every 5 minutes.
Uses TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the environment (e.g. from /etc/piclaw.env).
Run: export vars then python3 heartbeat.py
"""
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone

INTERVAL_SEC = 300
LOG_PREFIX = "[heartbeat]"


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def send_telegram(text: str, token: str, chat_id: str) -> None:
    """Post text to Telegram. chat_id must be the numeric id (e.g. for group use negative number)."""
    token = (token or "").strip()
    chat_id = (chat_id or "").strip()
    if not token or not chat_id:
        raise ValueError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be non-empty")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Telegram API returned {resp.status}")


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        print(f"{LOG_PREFIX} Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID, skipping send", file=sys.stderr)
        print(f"{LOG_PREFIX} Export them from /etc/piclaw.env (e.g. TELEGRAM_BOT_TOKEN=$PICLAW_TELEGRAM_TOKEN)", file=sys.stderr)
    else:
        try:
            ts = utc_now_iso()
            msg = f"PiClaw-02 alive – {ts}"
            send_telegram(msg, token, chat_id)
            print(f"{LOG_PREFIX} Heartbeat sent at {ts}")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            print(f"{LOG_PREFIX} Heartbeat failed at {utc_now_iso()}: HTTP {e.code} {e.reason} {body}", file=sys.stderr)
        except Exception as e:
            print(f"{LOG_PREFIX} Heartbeat failed at {utc_now_iso()}: {e}", file=sys.stderr)
    print(f"{LOG_PREFIX} Sleeping {INTERVAL_SEC} seconds")
    time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    while True:
        main()
