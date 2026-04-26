# piclaw

Minimal embedded runtime for Raspberry Pi.
This branch (`main`) is for the Pi setup.
The Android NetHunter setup lives on the `nethunter-hlte-chroot-minimal` branch.

## Layout

```
piclaw_runtime/        # the runtime (Node.js, self-contained)
scripts/piclaw/        # Pi install / fleet / bootstrap scripts
setup_piclaw/          # boot wallpaper
templates/             # agent-workspace skeleton
tools/                 # _piclaw_fleet_rollout.py
folder_contains_usefull_tools_for_piclaw/
                       # twitter_api helper
```

## Run

```bash
cd piclaw_runtime
npm install
npm start
```

## Install on a Pi

```bash
bash scripts/piclaw/install-pi.sh
```

See `piclaw_runtime/README.md` and `piclaw_runtime/DEPLOY.md` for full details.

## History

This repo was forked from [openclaw/openclaw](https://github.com/openclaw/openclaw)
and stripped down to just the embedded piclaw runtime. All gateway / web / Docker /
mobile-app / extensions code from OpenClaw has been removed.
