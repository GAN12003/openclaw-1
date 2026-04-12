#!/usr/bin/env bash
set -euo pipefail
# One-time: push initial main to empty GAN12003/workspaces (SSH remote with deploy key).
REMOTE="${1:-git@github.com-workspaces:GAN12003/workspaces.git}"
TMP="${2:-$HOME/src/workspaces-init}"
mkdir -p "$TMP"
cd "$TMP"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Already a git repo in $TMP"
else
  git init
fi
printf '%s\n' '# Workspaces (per-agent branches)' > README.md
git add README.md
git config user.email "${GIT_AUTHOR_EMAIL:-agent@local}"
git config user.name "${GIT_AUTHOR_NAME:-Pi Agent}"
git commit -m "init main" || { echo "Nothing to commit or already committed"; }
git branch -M main
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi
git push -u origin main
echo "OK: pushed main to workspaces"
