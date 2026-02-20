# Piclaw boot partition (cloud-init)

Use these files when imaging the Pi SD card so the device comes up with hostname **piclaw-node** and user **piclaw-01** (password login).

## Connection

| Item     | Value           |
|----------|-----------------|
| Hostname | piclaw-node     |
| User     | piclaw-01       |
| Password | piclaw          |
| Example  | `ssh piclaw-01@192.168.178.50` |

## Files

- **user-data** — cloud-config: hostname `piclaw-node`, user `piclaw-01`, password `piclaw`, SSH key, `ssh_pwauth: true`.
- **network-config** — WiFi (edit SSID/password for your network).

Copy both onto the boot (FAT) partition of the Pi SD card as required by your imaging method (e.g. into the root of the partition or into a `cloud-init` folder, depending on the image).
