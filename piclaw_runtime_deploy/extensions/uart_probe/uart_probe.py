#!/usr/bin/env python3
"""
UART probe: read-only diagnostic. Tries common bauds, captures bytes, fingerprints device.
Does not write to the port. Outputs JSON to stdout.
"""
import json
import sys

DEVICES = ["/dev/serial0", "/dev/ttyAMA0"]
BAUDS = [9600, 19200, 38400, 57600, 115200]
LISTEN_SEC = 2.5

try:
    import serial
except ImportError:
    print(json.dumps({"ok": False, "reason": "pyserial_not_installed"}))
    sys.exit(0)


def analyze(data):
    """Classify traffic: gps, ascii, or binary."""
    if not data:
        return "idle", "no data"
    if data.startswith(b"$GP") or b"$GP" in data or b"$GN" in data:
        return "gps", "NMEA sentences (likely GPS)"
    printable = sum(1 for b in data if 32 <= b <= 126 or b in (9, 10, 13))
    if len(data) > 0 and printable / len(data) >= 0.85:
        return "ascii", "likely microcontroller console"
    return "binary", "modem or sensor (binary)"


def probe():
    saw_busy = False
    for device in DEVICES:
        try:
            for baud in BAUDS:
                try:
                    with serial.Serial(device, baud, timeout=LISTEN_SEC) as ser:
                        raw = ser.read(4096)
                    if raw:
                        traffic, fingerprint = analyze(raw)
                        return {
                            "ok": True,
                            "device": device,
                            "baud": baud,
                            "traffic": traffic,
                            "fingerprint": fingerprint,
                            "samples": len(raw),
                        }
                except (OSError, serial.SerialException) as e:
                    err = str(e).lower()
                    if "busy" in err or "eagain" in err or "resource" in err:
                        saw_busy = True
                    continue
        except (OSError, serial.SerialException) as e:
            err = str(e).lower()
            if "busy" in err or "eagain" in err or "resource" in err:
                saw_busy = True
            continue
    return {"ok": False, "reason": "device_busy" if saw_busy else "no_activity"}


if __name__ == "__main__":
    try:
        result = probe()
    except Exception as e:
        result = {"ok": False, "reason": str(e)[:80]}
    print(json.dumps(result))
