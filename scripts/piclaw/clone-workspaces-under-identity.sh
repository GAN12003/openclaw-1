#!/usr/bin/env bash
# Optional: clone the workspaces git repo under PICLAW_IDENTITY_PATH/workspaces.
# Run as the same user as the piclaw service. Requires SSH deploy key for github.com-workspaces.
#
# Env:
#   PICLAW_IDENTITY_PATH   default: /opt/piclaw_identity
#   PICLAW_AGENT_ID        default: hostname short name lowercased
#   PICLAW_WORKSPACE_REPO_SSH  default: git@github.com-workspaces:GAN12003/workspaces.git
#
set -euo pipefail

IDENT="${PICLAW_IDENTITY_PATH:-/opt/piclaw_identity}"
AGENT_ID="${PICLAW_AGENT_ID:-$(hostname -s | tr '[:upper:]' '[:lower:]')}"
WORKSPACE_URL="${PICLAW_WORKSPACE_REPO_SSH:-git@github.com-workspaces:GAN12003/workspaces.git}"
TARGET="$IDENT/workspaces"
BRANCH="${AGENT_ID}-workspace"

mkdir -p "$IDENT"
if [[ ! -d "$TARGET/.git" ]]; then
  echo "[clone-workspaces-under-identity] cloning into $TARGET"
  git clone "$WORKSPACE_URL" "$TARGET"
fi
cd "$TARGET"
git fetch origin
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  git pull --ff-only || true
else
  echo "[clone-workspaces-under-identity] remote branch origin/$BRANCH not found; staying on default branch — run agent-git-bootstrap.sh or create the branch on GitHub."
  git checkout main 2>/dev/null || git checkout master 2>/dev/null || true
fi
echo "[clone-workspaces-under-identity] done: $TARGET (branch: $(git branch --show-current))"
