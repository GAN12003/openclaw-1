#!/usr/bin/env bash
# NetHunter Kali chroot: unstick dpkg when systemd/exim postinst fail (no real PID1 / odd adduser).
# Run as root inside bootkali. Safe to re-run. Does not remove packages.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export SYSTEMD_OFFLINE=1

echo "=== chroot-dpkg-repair: prep (policy-rc.d, machine-id, /run) ==="

POLICY="/usr/sbin/policy-rc.d"
if [[ ! -f "$POLICY" ]]; then
  install -d -m 0755 /usr/sbin
  printf '%s\n' '#!/bin/sh' 'exit 101' >"$POLICY"
  chmod 755 "$POLICY"
  echo "Wrote $POLICY (blocks service start during dpkg; normal for chroot)"
else
  echo "Exists: $POLICY"
fi

if [[ ! -s /etc/machine-id ]]; then
  if command -v systemd-machine-id-setup >/dev/null 2>&1; then
    systemd-machine-id-setup || true
  fi
fi
if [[ ! -s /etc/machine-id ]]; then
  if command -v dbus-uuidgen >/dev/null 2>&1; then
    dbus-uuidgen --ensure=/etc/machine-id 2>/dev/null || true
  fi
fi
if [[ ! -s /etc/machine-id ]]; then
  echo "b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0" >/etc/machine-id
  echo "Wrote placeholder /etc/machine-id"
fi

mkdir -p /run/systemd/system /run/dbus
chmod 0755 /run /run/dbus 2>/dev/null || true

echo
echo "=== systemd postinst shims (no PID1 in NetHunter chroot) ==="
# systemd's postinst runs systemctl/systemd-machine-id-setup; they cannot talk to a real init here.
if [[ -e /usr/bin/systemctl ]] && [[ ! -L /usr/bin/systemctl ]]; then
  cp -a /usr/bin/systemctl /usr/bin/systemctl.dpkg-orig
  ln -sf /bin/true /usr/bin/systemctl
  echo "Shim: /usr/bin/systemctl -> /bin/true  (backup: /usr/bin/systemctl.dpkg-orig)"
elif [[ -L /usr/bin/systemctl ]]; then
  echo "Shim: /usr/bin/systemctl already symlink -> $(readlink /usr/bin/systemctl 2>/dev/null || true)"
fi
MIDS=(/usr/bin/systemd-machine-id-setup /lib/systemd/systemd-machine-id-setup)
for m in "${MIDS[@]}"; do
  if [[ -e "$m" && ! -L "$m" ]]; then
    cp -a "$m" "${m}.dpkg-orig"
    ln -sf /bin/true "$m"
    echo "Shim: $m -> /bin/true"
  fi
done

# postinst can invoke systemd-sysusers; in chroot it may fail (basic.conf / dbus); stub only if unconfigured
if [[ -e /usr/bin/systemd-sysusers && ! -L /usr/bin/systemd-sysusers ]]; then
  cp -a /usr/bin/systemd-sysusers /usr/bin/systemd-sysusers.dpkg-orig
  ln -sf /bin/true /usr/bin/systemd-sysusers
  echo "Shim: /usr/bin/systemd-sysusers -> /bin/true (skips static user create in chroot)"
fi

# If adduser is too old for exim4-config postinst (Unknown option: allow-bad-names), try refresh.
# Ignore failure if dpkg is broken.
set +e
if command -v apt-get >/dev/null 2>&1; then
  apt-get -f -y install || true
  apt-get -y -o Dpkg::Options::=--force-confold install adduser passwd 2>/dev/null || true
fi
set -e

echo
echo "=== dpkg --configure -a (SYSTEMD_OFFLINE=1) ==="
set +e
dpkg --configure -a
c1=$?
set -e

if [[ "$c1" -ne 0 ]]; then
  echo
  echo "If exim4-config still fails (adduser option error), in THIS chroot a known workaround is to"
  echo "  remove the exim stack and use a different MTA, e.g. after backup:"
  echo "  apt-get -y --purge remove exim4-daemon-light exim4-base exim4-config"
  echo "  apt-get -y -f install"
  echo "  apt-get -y install msmtp-mta  # and: dpkg-reconfigure -f noninteractive msmtp-mta"
  echo "  (or leave mail unset if you do not need local MTA)"
fi

echo
echo "=== apt-get -f install ==="
set +e
apt-get -f -y install
c2=$?
set -e

set +e
dpkg --configure -a
c3=$?
set -e

echo
if [[ "$c3" -ne 0 ]]; then
  echo "chroot-dpkg-repair: dpkg --configure -a still failing (c1=$c1 c2=$c2 c3=$c3). See: dpkg --audit"
  echo "Re-run this script after shims; if exim4-config/adduser still errors, use exim+msmtp notes in script body."
  exit 1
fi
echo "chroot-dpkg-repair: dpkg path looks clear. Run: ./chroot-audit.sh"
exit 0
