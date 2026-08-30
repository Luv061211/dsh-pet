# Creates/updates the desktop shortcut for the DeepSeek Harness desktop shell.
$desktopRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $desktop 'DeepSeek Harness.lnk'))
$lnk.TargetPath = (Join-Path $desktopRoot 'node_modules\electron\dist\electron.exe')
$lnk.Arguments = '.'
$lnk.WorkingDirectory = $desktopRoot
$lnk.IconLocation = (Join-Path $desktopRoot 'build\icon.ico') + ',0'
$lnk.Description = 'DeepSeek Harness desktop shell (electron .)'
$lnk.Save()
Write-Output 'Shortcut created.'
