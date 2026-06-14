$adbPath = "C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\scrcpy-win64-v4.0\adb.exe"
$scrcpyPath = "C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\scrcpy-win64-v4.0\scrcpy.exe"

# UTF-8 Desteği
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "     DAILYWORDS TELEFON EKRAN YANSITMA (scrcpy)        " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] Telefon bağlantısı kontrol ediliyor..." -ForegroundColor Yellow
$devices = & $adbPath devices
Write-Output $devices

# Cihaz var mı kontrolü
$hasDevice = $false
foreach ($line in $devices) {
    if ($line -match "device$" -and $line -notmatch "List of") {
        $hasDevice = $true
    }
}

if (-not $hasDevice) {
    Write-Host "Hata: Bağlı cihaz bulunamadı!" -ForegroundColor Red
    Write-Host "Lütfen telefonunuzun USB ile bilgisayara bağlı olduğundan ve USB Hata Ayıklamanın açık olduğundan emin olun." -ForegroundColor Red
    Read-Host "Kapatmak için Enter tuşuna basın..."
    exit
}

Write-Host ""
Write-Host "[2/5] Kablosuz bağlantı portu (5555) aktifleştiriliyor..." -ForegroundColor Yellow
& $adbPath -d tcpip 5555
Write-Host "Telefonun yeniden bağlanması bekleniyor..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$attempts = 0
$deviceOnline = $false
while ($attempts -lt 15 -and -not $deviceOnline) {
    $devices = & $adbPath devices
    foreach ($line in $devices) {
        if ($line -match "device$" -and $line -notmatch "List of" -and $line -notmatch "5555") {
            $deviceOnline = $true
            break
        }
    }
    if (-not $deviceOnline) {
        Start-Sleep -Seconds 1
        $attempts++
    }
}
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "[3/5] Telefonun Wi-Fi IP adresi aranıyor..." -ForegroundColor Yellow
$ip = $null
$route = & $adbPath -d shell ip route
foreach ($line in $route) {
    if ($line -like "*wlan*") {
        $parts = $line -split '\s+'
        foreach ($part in $parts) {
            if ($part -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
                $ip = $part
                break
            }
        }
    }
}

if (-not $ip) {
    Write-Host "IP adresi otomatik bulunamadı. Lütfen telefonunuzun Wi-Fi IP adresini kendiniz yazın (Örn: 10.41.141.180):" -ForegroundColor Red
    $ip = Read-Host "IP Adresi"
}

if (-not $ip) {
    Write-Host "Hata: IP adresi girilmedi. İşlem iptal edildi." -ForegroundColor Red
    Read-Host "Kapatmak için Enter tuşuna basın..."
    exit
}

Write-Host "Telefon IP adresi: $ip" -ForegroundColor Green

Write-Host ""
Write-Host "[4/5] Kablosuz bağlantı kuruluyor..." -ForegroundColor Yellow
& $adbPath connect "$($ip):5555"
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  TEBRİKLER! BAĞLANTI KURULDU." -ForegroundColor Green
Write-Host "  Şimdi USB kablosunu bilgisayardan çıkarabilirsiniz." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""

Write-Host "[5/5] Ekran yansıtma başlatılıyor..." -ForegroundColor Yellow
& $scrcpyPath -s "$($ip):5555" --max-size=1024 --no-audio

Read-Host "Bağlantıyı sonlandırmak için Enter tuşuna basın..."
