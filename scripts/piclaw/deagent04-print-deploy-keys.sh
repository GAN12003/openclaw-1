#!/usr/bin/env bash
# Run on deAgent04 as gan12003. Prints two public keys for GitHub Deploy keys (write access).
set -euo pipefail
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if [[ ! -f "$HOME/.ssh/id_ed25519_github_piclaw" ]]; then
  ssh-keygen -t ed25519 -q -N "" -f "$HOME/.ssh/id_ed25519_github_piclaw" -C "deploy-deAgent04-openclaw-1"
fi
if [[ ! -f "$HOME/.ssh/id_ed25519_github_workspaces" ]]; then
  ssh-keygen -t ed25519 -q -N "" -f "$HOME/.ssh/id_ed25519_github_workspaces" -C "deploy-deAgent04-workspaces"
fi
echo "=== Repo GAN12003/openclaw-1: Deploy keys — paste ONE line, enable Allow write access ==="
cat "$HOME/.ssh/id_ed25519_github_piclaw.pub"
echo ""
echo "=== Repo GAN12003/workspaces: Deploy keys — paste ONE line, enable Allow write access ==="
cat "$HOME/.ssh/id_ed25519_github_workspaces.pub"
