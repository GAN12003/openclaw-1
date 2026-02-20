#!/bin/bash
# A/B updater for Piclaw. Install on the Pi as: /usr/local/bin/piclaw-update
# Usage: piclaw-update [--from VERSION]
set -e

BASE="/opt/piclaw"
CUR=$(readlink -f "$BASE/current")

if [[ "$CUR" == *"piclaw_A" ]]; then
  TARGET="$BASE/piclaw_B"
else
  TARGET="$BASE/piclaw_A"
fi

echo "[piclaw-update] staging update into $TARGET"

rm -rf "$TARGET.new"
mkdir -p "$TARGET.new"

# ---- FETCH NEW VERSION HERE ----
# Replace with your source: git clone, rsync from dev machine, or copy from staging.
# Example: copy from home (after you scp new runtime to ~/piclaw_runtime):
cp -r /home/piclaw-01/piclaw_runtime/* "$TARGET.new/"
# Example (git): git clone https://your-repo/piclaw_runtime "$TARGET.new" && rm -rf "$TARGET.new/.git"
# --------------------------------

mv "$TARGET.new" "$TARGET"

cd "$TARGET"
npm install --omit=dev

echo "[piclaw-update] switching active slot"
ln -sfn "$TARGET" "$BASE/current"

echo "[piclaw-update] restarting service"
sudo systemctl restart piclaw

echo "[piclaw-update] waiting for health confirmation..."
OKFILE="$BASE/current/.boot-ok"
TIMEOUT=20
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if [ -f "$OKFILE" ]; then
    echo "[piclaw-update] new version healthy"
    echo "[piclaw-update] done. New slot: $(basename "$TARGET")"
    exit 0
  fi
  sleep 2
  ELAPSED=$((ELAPSED+2))
done

echo "[piclaw-update] health check failed — rolling back"
ln -sfn "$CUR" "$BASE/current"
sudo systemctl restart piclaw
echo "[piclaw-update] reverted to $(basename "$CUR")"
exit 1
