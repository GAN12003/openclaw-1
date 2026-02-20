# Deploy piclaw_runtime to Pi and run setup. You will be prompted for password (default: piclaw).
# Usage: .\deploy-to-pi.ps1 [<PI_IP>]
# Example: .\deploy-to-pi.ps1 192.168.178.50

param(
    [string]$PiIp = "192.168.178.50",
    [string]$User = "piclaw-01"
)

$ErrorActionPreference = "Stop"
$runtimeDir = Split-Path -Parent $PSScriptRoot

Write-Host "Deploying to $User@${PiIp} from $runtimeDir" -ForegroundColor Cyan
Write-Host "You will be prompted for password (default: piclaw)" -ForegroundColor Yellow

# Copy runtime to Pi home
Write-Host "`n[1/2] Copying piclaw_runtime to Pi..." -ForegroundColor Green
scp -r "$runtimeDir" "${User}@${PiIp}:/home/${User}/"

# Copy setup script and run it
Write-Host "`n[2/2] Running setup on Pi..." -ForegroundColor Green
scp "$PSScriptRoot\setup-pi-remote.sh" "${User}@${PiIp}:/home/${User}/"
ssh -t "${User}@${PiIp}" "chmod +x /home/${User}/setup-pi-remote.sh && /home/${User}/setup-pi-remote.sh"

Write-Host "`nDone. On the Pi: sudo nano /etc/piclaw.env to add PICLAW_TELEGRAM_TOKEN and OPENAI_API_KEY, then: sudo systemctl restart piclaw" -ForegroundColor Cyan
