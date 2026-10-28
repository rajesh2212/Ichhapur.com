$procs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'ichh-' }
"test chrome running: " + @($procs).Count
$procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3
$left = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'ichh-' }
"left: " + @($left).Count
"node: " + @(Get-CimInstance Win32_Process -Filter "Name='node.exe'").Count
"total chrome: " + @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'").Count
