#!/usr/bin/env bash
# Usage (on Pi, from repo): bash scripts/piclaw/set-agent-self-profile.sh deAgent03 deAgent03@yopmail.com '53479d455a2748'
# Merges name, agent_id, contact_email, profile_image, credential_hint into identity self.json.
set -euo pipefail
ROOT="${PICLAW_IDENTITY_PATH:-/opt/piclaw_identity}/self.json"
AGENT="${1:?agent id e.g. deAgent03}"
EMAIL="${2:?email e.g. deAgent03@yopmail.com}"
HINT="${3:-}"
if [[ ! -f "$ROOT" ]]; then
  echo "Missing $ROOT — bootstrap identity first." >&2
  exit 1
fi
export PICLAW_SELF_JSON="$ROOT"
export PICLAW_AGENT="$AGENT"
export PICLAW_EMAIL="$EMAIL"
export PICLAW_HINT="$HINT"
node -e '
const fs = require("fs");
const p = process.env.PICLAW_SELF_JSON;
const o = JSON.parse(fs.readFileSync(p, "utf8"));
Object.assign(o, {
  name: process.env.PICLAW_AGENT,
  agent_id: process.env.PICLAW_AGENT,
  contact_email: process.env.PICLAW_EMAIL,
  profile_image: "setup_piclaw/piclaw_default.jpg",
  credential_hint: process.env.PICLAW_HINT || "",
});
fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
console.log("Updated", p);
'
