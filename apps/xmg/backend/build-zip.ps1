# Build Zip Deployment Package for XIMG preserving folder structure
$zipPath = "ximg-aihost-ready.zip"

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Compress including folder directories to preserve lib/ and api/ structure
Compress-Archive -Path ".htaccess", ".user.ini", "index.php", "view.php", "image.php", "config.php", "test.php", "ximg-widget.js", "lib", "api" -DestinationPath $zipPath -Force

Write-Host "XIMG Deployment Package successfully built with folder structure: $zipPath" -ForegroundColor Cyan
