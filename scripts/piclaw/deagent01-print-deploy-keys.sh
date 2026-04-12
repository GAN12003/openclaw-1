#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if [[ ! -f "$HOME/.ssh/id_ed25519_github_piclaw" ]]; then
  ssh-keygen -t ed25519 -q -N "" -f "$HOME/.ssh/id_ed25519_github_piclaw" -C "deploy-deAgent01-openclaw-1"
fi
if [[ ! -f "$HOME/.ssh/id_ed25519_github_workspaces" ]]; then
  ssh-keygen -t ed25519 -q -N "" -f "$HOME/.ssh/id_ed25519_github_workspaces" -C "deploy-deAgent01-workspaces"
fi
echo "=== Repo GAN12003/openclaw-1: Deploy keys - paste ONE line, enable write access ==="
cat "$HOME/.ssh/id_ed25519_github_piclaw.pub"
echo ""
echo "=== Repo GAN12003/workspaces: Deploy keys - paste ONE line, enable write access ==="
cat "$HOME/.ssh/id_ed25519_github_workspaces.pub"
