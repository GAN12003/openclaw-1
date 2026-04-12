#!/usr/bin/env bash
# Create or update per-agent branches (SSH deploy keys with write access).
# PAT not required for git operations; optional PAT in .env is for Issues/API only.
#
# Env (optional; defaults shown):
#   PICLAW_AGENT_ID          default: hostname short name lowercased (e.g. deagent02)
#   PICLAW_GIT_CLONE_ROOT    default: $HOME/src
#   PICLAW_RUNTIME_REPO_SSH  default: git@github.com-piclaw:GAN12003/openclaw-1.git
#   PICLAW_WORKSPACE_REPO_SSH default: git@github.com-workspaces:GAN12003/workspaces.git
#
# Requires: git, ssh, deploy keys on GitHub with "Allow write access".
# Workspaces repo: initial commit on main (e.g. README) recommended.

set -euo pipefail

AGENT_ID="${PICLAW_AGENT_ID:-$(hostname -s | tr '[:upper:]' '[:lower:]')}"
ROOT="${PICLAW_GIT_CLONE_ROOT:-$HOME/src}"
RUNTIME_URL="${PICLAW_RUNTIME_REPO_SSH:-git@github.com-piclaw:GAN12003/openclaw-1.git}"
WORKSPACE_URL="${PICLAW_WORKSPACE_REPO_SSH:-git@github.com-workspaces:GAN12003/workspaces.git}"
RUNTIME_BRANCH="${AGENT_ID}-runtime"
WORKSPACE_BRANCH="${AGENT_ID}-workspace"
RUNTIME_DIR_NAME="${PICLAW_RUNTIME_DIR_NAME:-openclaw-1}"
WORKSPACE_DIR_NAME="${PICLAW_WORKSPACE_DIR_NAME:-workspaces}"

mkdir -p "$ROOT"

log() { echo "[piclaw-git-bootstrap] $*"; }

sync_branch_from_main() {
  local dir="$1"
  local url="$2"
  local branch="$3"
  local name
  name="$(basename "$dir")"

  if [[ ! -d "$dir/.git" ]]; then
    log "Cloning $name into $dir"
    git clone "$url" "$dir"
  fi
  cd "$dir"
  git fetch origin

  if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      git checkout "$branch"
    else
      git checkout -b "$branch" "origin/$branch"
    fi
    if git show-ref --verify --quiet refs/remotes/origin/main; then
      git merge "origin/main" -m "merge origin/main into $branch" || log "warn: merge origin/main into $branch — resolve conflicts locally if needed"
    elif git show-ref --verify --quiet refs/remotes/origin/master; then
      git merge "origin/master" -m "merge origin/master into $branch" || log "warn: merge origin/master into $branch — resolve conflicts locally if needed"
    fi
  else
    _base="main"
    git checkout main 2>/dev/null || { git checkout master 2>/dev/null && _base="master"; } || { log "error: no main/master on remote; push an initial commit from GitHub"; return 1; }
    git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || log "warn: pull default branch failed"
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      git checkout "$branch"
    else
      git checkout -b "$branch" "$_base"
    fi
  fi
  git push -u origin "$branch"
  log "Branch ready: $branch (repo $name)"
}

sync_branch_from_main "$ROOT/$RUNTIME_DIR_NAME" "$RUNTIME_URL" "$RUNTIME_BRANCH"
sync_branch_from_main "$ROOT/$WORKSPACE_DIR_NAME" "$WORKSPACE_URL" "$WORKSPACE_BRANCH"

log "Done for agent $AGENT_ID"
