# DSH 会话状态备份 / 恢复（Windows PowerShell 版）。
#
# 用法：
#   pwsh -NoProfile -File tools/dsh-session-backup.ps1 backup [标签]
#   pwsh -NoProfile -File tools/dsh-session-backup.ps1 list
#   pwsh -NoProfile -File tools/dsh-session-backup.ps1 restore <备份文件> [-Yes]
#
# 环境变量：
#   DSH_HOME       DSH 数据目录，默认 ~/.dsh
#   BACKUP_DIR     备份目录，默认 ~/.dsh-session-backups
#   KEEP           保留最近几份备份，默认 10
#
# 备份内容与 tools/dsh-session-backup.sh 一致：工作区注册表、会话正文、
# 会话项目缓存和本机工作台映射。restore 前必须先退出 DeepSeek Harness，
# 并会自动做一份 pre-restore 备份。
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('backup', 'list', 'restore')]
  [string]$Action = 'backup',

  [Parameter(Position = 1)]
  [string]$Label = 'manual',

  [Parameter(Position = 2)]
  [string]$Archive,

  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }),
  [string]$BackupDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $HOME '.dsh-session-backups' }),
  [int]$Keep = $(if ($env:KEEP) { [int]$env:KEEP } else { 10 }),
  [switch]$Yes,
  [switch]$SkipPreBackup
)

$ErrorActionPreference = 'Stop'

# 会话正文和本机路径只允许当前用户读写。
$StateItems = @(
  'storages/workspace.json'
  'storages/session_projcache'
  'storages/session_projcache_archive_manager_v2'
  'sessions'
  'cache/dsh-workbench-poc/local.json'
)

function Get-NormalizedPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}

$DshHome = Get-NormalizedPath $DshHome
$BackupDir = Get-NormalizedPath $BackupDir

# 优先用 Windows 自带的 bsdtar。PATH 里若排着 Git for Windows 的 GNU tar，
# 它会把 "C:\..." 当成远程主机（同样适用于以 bash 为父进程启动 pwsh 的场景）。
$TarExe = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path -LiteralPath $TarExe)) { $TarExe = 'tar.exe' }
$TarArgs = @()
try {
  if ((& $TarExe --version 2>$null | Select-Object -First 1) -match 'GNU tar') { $TarArgs = @('--force-local') }
}
catch { }

function Test-DshRunning {
  return $null -ne (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
}

function Get-BackupFiles {
  if (-not (Test-Path -LiteralPath $BackupDir)) { return @() }
  return @(Get-ChildItem -LiteralPath $BackupDir -Filter 'dsh-sessions-*.tar.gz' -File |
    Sort-Object LastWriteTime -Descending)
}

function Remove-OldBackups {
  $files = Get-BackupFiles
  if ($files.Count -le $Keep) { return }
  $files | Select-Object -Skip $Keep | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $manifest = "$($_.FullName).manifest.txt"
    if (Test-Path -LiteralPath $manifest) { Remove-Item -LiteralPath $manifest -Force }
  }
}

function New-Backup([string]$NameLabel) {
  $safeLabel = [regex]::Replace($NameLabel, '[^A-Za-z0-9._-]+', '_').Trim('_')
  if ($safeLabel -eq '') { $safeLabel = 'manual' }
  if ($safeLabel.Length -gt 40) { $safeLabel = $safeLabel.Substring(0, 40) }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $name = "dsh-sessions-$stamp-$safeLabel.tar.gz"
  $final = Join-Path $BackupDir $name
  $partial = Join-Path $BackupDir ".$name.partial"
  $manifest = "$final.manifest.txt"

  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  $existing = @()
  foreach ($item in $StateItems) {
    if (Test-Path -LiteralPath (Join-Path $DshHome $item)) { $existing += $item }
  }
  if ($existing.Count -eq 0) {
    throw "没有可备份的 DSH 状态：$DshHome"
  }

  if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
  try {
    & $TarExe @TarArgs -czf $partial -C $DshHome @existing
    if ($LASTEXITCODE -ne 0) { throw "tar 打包失败，退出码 $LASTEXITCODE" }
    & $TarExe @TarArgs -tzf $partial | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "备份校验失败（tar -tzf）" }
    Move-Item -LiteralPath $partial -Destination $final -Force
  }
  catch {
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
    throw "备份失败，未写入正式备份：$DshHome；$($_.Exception.Message)"
  }

  @(
    "created=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
    "dsh_home=$DshHome"
    "items=$($existing -join ' ')"
  ) | Set-Content -LiteralPath $manifest -Encoding utf8

  Write-Output "已备份到 $final"
  Remove-OldBackups
}

function Invoke-Backup {
  New-Backup $Label
}

function Invoke-List {
  $files = Get-BackupFiles
  if ($files.Count -eq 0) {
    Write-Output "还没有备份：$BackupDir"
    return
  }
  foreach ($file in $files) {
    $sizeMb = [math]::Round($file.Length / 1MB, 2)
    Write-Output ("{0}  {1,8} MB  {2}" -f $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'), $sizeMb, $file.FullName)
  }
}

function Test-ArchiveSafe([string]$Path) {
  $entries = & $TarExe @TarArgs -tzf $Path
  if ($LASTEXITCODE -ne 0) { throw "不是有效的 tar.gz：$Path" }
  foreach ($entry in $entries) {
    if ($entry -match '^/' -or $entry -match '(^|/)\.\.(/|$)') {
      throw "备份包含越界路径，拒绝恢复：$entry"
    }
  }
  if ($entries -notcontains 'storages/workspace.json') {
    throw "不是有效的 DSH 会话备份（缺少 storages/workspace.json）：$Path"
  }
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Repair-WorkspaceJson([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $registry = Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json
  if ($null -eq $registry.global) { return }
  $global = $registry.global
  $workspaces = $registry.tables.workspaces
  $changed = $false

  if ($global.PSObject.Properties.Name -contains 'defaultWorkspaceId' -and $null -eq $global.defaultWorkspaceId) {
    $global.PSObject.Properties.Remove('defaultWorkspaceId')
    $changed = $true
  }
  $defaultId = $global.defaultWorkspaceId
  if ($null -ne $defaultId) {
    $known = $false
    if ($null -ne $workspaces) {
      $known = $null -ne $workspaces.PSObject.Properties[$defaultId]
    }
    if (-not $known) {
      $order = @($global.workspaceIds)
      if ($order.Count -gt 0) {
        $global.defaultWorkspaceId = $order[0]
      } else {
        $global.PSObject.Properties.Remove('defaultWorkspaceId')
      }
      $changed = $true
    }
  }
  if ($changed) {
    $tmp = "$Path.tmp"
    Write-Utf8NoBom $tmp ($registry | ConvertTo-Json -Depth 100)
    Move-Item -LiteralPath $tmp -Destination $Path -Force
    Write-Output '已修正 workspace.json 的 defaultWorkspaceId 字段'
  }
}

function Invoke-Restore {
  # 兼容 `restore <备份文件>` 的位置参数写法（第二个位置参数默认落在 Label 上）。
  if ([string]::IsNullOrWhiteSpace($Archive) -and -not [string]::IsNullOrWhiteSpace($Label) -and $Label -ne 'manual') {
    $Archive = $Label
  }
  if ([string]::IsNullOrWhiteSpace($Archive)) {
    throw '用法：dsh-session-backup.ps1 restore <备份文件> [-Yes]'
  }
  $archivePath = (Resolve-Path -LiteralPath $Archive).Path
  $defaultHome = Get-NormalizedPath (Join-Path $HOME '.dsh')
  if ($DshHome -eq $defaultHome -and (Test-DshRunning)) {
    throw 'DeepSeek Harness 正在运行。请先退出应用（托盘退出 / 关闭全部窗口），再执行 restore。'
  }
  Test-ArchiveSafe $archivePath
  if (-not $Yes) {
    $answer = Read-Host "将用 $archivePath 覆盖 $DshHome 的会话状态（先自动备份当前状态），继续？[y/N]"
    if ($answer -notmatch '^[yY]') { Write-Output '已取消'; return }
  }

  if (-not $SkipPreBackup) {
    New-Backup 'pre-restore' | Out-Null
  }
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-restore-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temp | Out-Null
  try {
    & $TarExe @TarArgs -xzf $archivePath -C $temp
    if ($LASTEXITCODE -ne 0) { throw "解包失败：$archivePath" }
    foreach ($item in $StateItems) {
      $source = Join-Path $temp $item
      $target = Join-Path $DshHome $item
      if (Test-Path -LiteralPath $source) {
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        $parent = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Move-Item -LiteralPath $source -Destination $target -Force
      }
    }
    Repair-WorkspaceJson (Join-Path $DshHome 'storages/workspace.json')
  }
  finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
  }
  Write-Output "已从 $archivePath 恢复 $DshHome"
}

switch ($Action) {
  'backup' { Invoke-Backup }
  'list' { Invoke-List }
  'restore' { Invoke-Restore }
}
