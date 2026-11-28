# DSH 会话一键工具（Windows PowerShell 版）。
#
# 功能：
#   1. 备份当前 DSH 会话（DSH 可以开着）
#   2. 一键重置：备份 → 退出 DSH → 清除会话 → 重新打开 DSH
#   3. 一键恢复：退出 DSH → 恢复指定备份 → 重新打开 DSH（不再额外备份）
#
# 用法：
#   pwsh -NoProfile -File tools\dsh-session-manager.ps1 menu
#   pwsh -NoProfile -File tools\dsh-session-manager.ps1 reset -Scope All -Yes
#   pwsh -NoProfile -File tools\dsh-session-manager.ps1 restore -Archive <备份文件> -Yes
#   pwsh -NoProfile -File tools\dsh-session-manager.ps1 list
#
# 参数：
#   -Scope All|Workbench   清除范围：全部 DSH 会话 / 仅 WorkbenchBase 下的会话
#   -NoRelaunch            清除或恢复后不自动打开 DSH
#   -DryRun                只打印步骤，不备份、不退出、不删除
#
# 注意：重置/恢复会退出 DeepSeek Harness。请从资源管理器双击 .cmd，
# 或在独立的 PowerShell 窗口运行；不要从 DSH 内部终端运行，否则退出
# DSH 时会把脚本自身一起终止。
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('menu', 'reset', 'restore', 'backup', 'list')]
  [string]$Action = 'menu',

  [Parameter(Position = 1)]
  [string]$Archive,

  [ValidateSet('All', 'Workbench')]
  [string]$Scope = 'All',

  [string]$WorkbenchBase,
  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }),
  [string]$BackupDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $HOME '.dsh-session-backups' }),
  [string]$AppExe = $(if ($env:DSH_APP_EXE) { $env:DSH_APP_EXE } else { Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe' }),
  [switch]$Yes,
  [switch]$NoRelaunch,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Get-NormalizedPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}

$DshHome = Get-NormalizedPath $DshHome
$BackupDir = Get-NormalizedPath $BackupDir
if ([string]::IsNullOrWhiteSpace($WorkbenchBase)) {
  if (-not [string]::IsNullOrWhiteSpace($env:DSH_WORKBENCH_BASE)) {
    $WorkbenchBase = $env:DSH_WORKBENCH_BASE
  }
  else {
    $WorkbenchBase = Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime\workbench'
  }
}
$WorkbenchBase = Get-NormalizedPath $WorkbenchBase
$BackupScript = Join-Path $PSScriptRoot 'dsh-session-backup.ps1'
$DefaultDshHome = Get-NormalizedPath (Join-Path $HOME '.dsh')

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Test-IsInside([string]$Child, [string]$Parent) {
  if ([string]::IsNullOrWhiteSpace($Child) -or [string]::IsNullOrWhiteSpace($Parent)) { return $false }
  try {
    $childPath = [System.IO.Path]::GetFullPath($Child).TrimEnd('\', '/')
    $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    if ($childPath.Equals($parentPath, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $childPath.StartsWith($parentPath + '\', [System.StringComparison]::OrdinalIgnoreCase)
  }
  catch {
    return $false
  }
}

function Get-BackupFiles {
  if (-not (Test-Path -LiteralPath $BackupDir)) { return @() }
  return @(Get-ChildItem -LiteralPath $BackupDir -Filter 'dsh-sessions-*.tar.gz' -File |
    Sort-Object LastWriteTime -Descending)
}

function Invoke-BackupStep([string]$Label) {
  Write-Output "[备份] 备份当前 DSH 会话（$Label）..."
  if ($DryRun) {
    Write-Output "[dry-run] 跳过实际备份"
    return
  }
  & $BackupScript backup $Label -DshHome $DshHome -BackupDir $BackupDir
  if (-not $?) { throw '备份失败，后续步骤已中止' }
}

function Get-DshAncestorIds {
  $ids = @()
  $current = $PID
  for ($i = 0; $i -lt 16; $i++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $current" -ErrorAction SilentlyContinue
    if ($null -eq $proc) { break }
    $parent = [int]$proc.ParentProcessId
    if ($parent -eq 0 -or $parent -eq $current) { break }
    $ids += $parent
    $current = $parent
  }
  return $ids
}

# 按名称识别 DSH 的所有进程（桌面端、渲染进程、无窗口的 dsh 后台宿主）。
# 不用 CommandLine：它可能因权限读不到，也会漏掉 --no-open 的宿主。
function Get-DshProcesses {
  return @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
}

function Get-DshStoppableProcesses {
  $self = $PID
  $protected = @(Get-DshAncestorIds)
  return @(Get-DshProcesses | Where-Object { $_.Id -ne $self -and $protected -notcontains $_.Id })
}

function Test-RunningInsideDsh {
  foreach ($id in @(Get-DshAncestorIds)) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($null -ne $proc -and $proc.ProcessName -eq 'DeepSeek Harness') { return $true }
  }
  return $false
}

function Stop-DshDesktop {
  $running = @(Get-DshStoppableProcesses)
  if ($running.Count -eq 0) {
    Write-Output '[退出] DSH 当前未运行'
    return
  }
  if ($DryRun) {
    foreach ($proc in $running) { Write-Output "[dry-run] 跳过关闭 DSH 进程 PID $($proc.Id)" }
    return
  }
  foreach ($proc in @($running | Where-Object { $_.MainWindowHandle -ne 0 })) {
    Write-Output "[退出] 正在关闭 DSH 窗口 PID $($proc.Id)..."
    try { [void]$proc.CloseMainWindow() } catch { }
  }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (@(Get-DshStoppableProcesses).Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
  foreach ($proc in @(Get-DshStoppableProcesses)) {
    Write-Output "[退出] 终止 DSH 进程 PID $($proc.Id)（无窗口或未响应）..."
    & taskkill.exe /PID $proc.Id /T /F | Out-Null
  }
  Start-Sleep -Milliseconds 800
  $left = @(Get-DshStoppableProcesses)
  if ($left.Count -gt 0) {
    throw "仍有 DSH 进程未能退出：$($left.Id -join ', ')"
  }
  Write-Output '[退出] DSH 已退出'
}

function Start-DshDesktop {
  if (-not (Test-Path -LiteralPath $AppExe)) {
    throw "找不到 DeepSeek Harness：$AppExe"
  }
  Write-Output '[启动] 正在打开 DSH 桌面端...'
  if ($DryRun) {
    Write-Output '[dry-run] 跳过实际启动'
    return
  }
  Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe)
  $deadline = (Get-Date).AddSeconds(40)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $started = @(Get-DshProcesses)
    if ($started.Count -gt 0) {
      Write-Output "[启动] DSH 已启动 PID $($started[0].Id)"
      return
    }
  }
  Write-Output '[启动] DSH 进程已发起，但 40 秒内未检测到主窗口'
}

function Clear-DshSessions([string]$Mode) {
  $workspaceFile = Join-Path $DshHome 'storages\workspace.json'
  if (-not (Test-Path -LiteralPath $workspaceFile)) {
    throw "DSH 工作区注册表不存在：$workspaceFile"
  }
  $registry = Get-Content -LiteralPath $workspaceFile -Raw -Encoding utf8 | ConvertFrom-Json
  if ($null -eq $registry.tables -or $null -eq $registry.tables.workspaces) {
    throw 'workspace.json 结构异常：缺少 tables.workspaces'
  }
  $workspaces = $registry.tables.workspaces
  $purged = @{}
  $workspaceCount = 0

  if ($Mode -eq 'All') {
    foreach ($prop in @($workspaces.PSObject.Properties)) {
      $workspaceCount += 1
      foreach ($sid in @($prop.Value.sessionIds)) {
        if (-not [string]::IsNullOrWhiteSpace([string]$sid)) { $purged[[string]$sid] = $true }
      }
    }
    $registry.tables.workspaces = [PSCustomObject]@{}
    $registry.global.workspaceIds = @()
    $registry.global.archivedSessionIds = @()
    $registry.global.pinnedSessionIds = @()
    if ($registry.global.PSObject.Properties.Name -contains 'defaultWorkspaceId') {
      $registry.global.PSObject.Properties.Remove('defaultWorkspaceId')
    }
  }
  else {
    $remove = @()
    foreach ($prop in @($workspaces.PSObject.Properties)) {
      $path = [string]$prop.Value.path
      if (Test-IsInside $path $WorkbenchBase) {
        $remove += $prop.Name
        $workspaceCount += 1
        foreach ($sid in @($prop.Value.sessionIds)) {
          if (-not [string]::IsNullOrWhiteSpace([string]$sid)) { $purged[[string]$sid] = $true }
        }
      }
    }
    foreach ($name in $remove) {
      $workspaces.PSObject.Properties.Remove($name)
    }
    $registry.global.workspaceIds = @($registry.global.workspaceIds | Where-Object { $remove -notcontains $_ })
    $registry.global.archivedSessionIds = @($registry.global.archivedSessionIds | Where-Object { -not $purged.ContainsKey([string]$_) })
    $registry.global.pinnedSessionIds = @($registry.global.pinnedSessionIds | Where-Object { -not $purged.ContainsKey([string]$_) })
    $defaultId = [string]$registry.global.defaultWorkspaceId
    if ($remove -contains $defaultId) {
      $remaining = @($registry.global.workspaceIds)
      if ($remaining.Count -gt 0) {
        $registry.global.defaultWorkspaceId = $remaining[0]
      }
      elseif ($registry.global.PSObject.Properties.Name -contains 'defaultWorkspaceId') {
        $registry.global.PSObject.Properties.Remove('defaultWorkspaceId')
      }
    }
  }

  if (-not $DryRun) {
    $tmp = "$workspaceFile.tmp"
    Write-Utf8NoBom $tmp ($registry | ConvertTo-Json -Depth 100)
    Move-Item -LiteralPath $tmp -Destination $workspaceFile -Force
  }

  $sessionsRoot = Join-Path $DshHome 'sessions'
  $removedSessionDirs = 0
  if (Test-Path -LiteralPath $sessionsRoot) {
    if ($Mode -eq 'All') {
      foreach ($item in @(Get-ChildItem -LiteralPath $sessionsRoot -Force)) {
        if ($DryRun) { continue }
        Remove-Item -LiteralPath $item.FullName -Recurse -Force
        $removedSessionDirs += 1
      }
    }
    else {
      foreach ($group in @(Get-ChildItem -LiteralPath $sessionsRoot -Directory -Force)) {
        foreach ($sessionDir in @(Get-ChildItem -LiteralPath $group.FullName -Directory -Force)) {
          if ($purged.ContainsKey($sessionDir.Name)) {
            if (-not $DryRun) { Remove-Item -LiteralPath $sessionDir.FullName -Recurse -Force }
            $removedSessionDirs += 1
          }
        }
        if (-not $DryRun -and @(Get-ChildItem -LiteralPath $group.FullName -Force).Count -eq 0) {
          Remove-Item -LiteralPath $group.FullName -Force
        }
      }
    }
  }

  $removedCacheFiles = 0
  foreach ($relative in @('storages\session_projcache\sessions', 'storages\session_projcache_archive_manager_v2\sessions')) {
    $cacheDir = Join-Path $DshHome $relative
    if (-not (Test-Path -LiteralPath $cacheDir)) { continue }
    if ($Mode -eq 'All') {
      foreach ($item in @(Get-ChildItem -LiteralPath $cacheDir -Force)) {
        if (-not $DryRun) { Remove-Item -LiteralPath $item.FullName -Recurse -Force }
        $removedCacheFiles += 1
      }
    }
    else {
      foreach ($sid in $purged.Keys) {
        $path = Join-Path $cacheDir ($sid + '.json')
        if (Test-Path -LiteralPath $path) {
          if (-not $DryRun) { Remove-Item -LiteralPath $path -Force }
          $removedCacheFiles += 1
        }
      }
    }
  }

  $localFile = Join-Path $DshHome 'cache\dsh-workbench-poc\local.json'
  if (Test-Path -LiteralPath $localFile) {
    $local = Get-Content -LiteralPath $localFile -Raw -Encoding utf8 | ConvertFrom-Json
    foreach ($userProp in @($local.users.PSObject.Properties)) {
      $user = $userProp.Value
      if ($Mode -eq 'All') {
        foreach ($name in @('sessions', 'folders', 'dshSessions', 'sessionOwners', 'sessionUsers')) {
          if ($user.PSObject.Properties.Name -contains $name) { $user.$name = [PSCustomObject]@{} }
        }
      }
      else {
        foreach ($name in @('dshSessions', 'sessionOwners', 'sessionUsers')) {
          if ($user.PSObject.Properties.Name -contains $name) {
            foreach ($key in @($user.$name.PSObject.Properties.Name)) {
              if ($purged.ContainsKey([string]$key)) { $user.$name.PSObject.Properties.Remove($key) }
            }
          }
        }
        if ($user.PSObject.Properties.Name -contains 'sessions') {
          foreach ($recordId in @($user.sessions.PSObject.Properties.Name)) {
            $record = $user.sessions.$recordId
            if ($purged.ContainsKey([string]$record.dshSessionId) -or (Test-IsInside ([string]$record.folderPath) $WorkbenchBase)) {
              $user.sessions.PSObject.Properties.Remove($recordId)
            }
          }
        }
        if ($user.PSObject.Properties.Name -contains 'folders') {
          foreach ($requirementId in @($user.folders.PSObject.Properties.Name)) {
            if (Test-IsInside ([string]$user.folders.$requirementId) $WorkbenchBase) {
              $user.folders.PSObject.Properties.Remove($requirementId)
            }
          }
        }
      }
    }
    if (-not $DryRun) {
      $tmp = "$localFile.tmp"
      Write-Utf8NoBom $tmp ($local | ConvertTo-Json -Depth 100)
      Move-Item -LiteralPath $tmp -Destination $localFile -Force
    }
  }

  Write-Output "[清除] 范围 $Mode：工作区 $workspaceCount 个，会话 $($purged.Count) 个，会话目录 $removedSessionDirs 个，缓存 $removedCacheFiles 个"
}

function Select-BackupArchive {
  $files = @(Get-BackupFiles)
  if ($files.Count -eq 0) { throw "没有可用备份：$BackupDir" }
  # 这里必须用 Write-Host：函数内的 Write-Output 会混入返回值，
  # 调用方拿到的就不是单一路径，而是整个列表拼成的字符串数组。
  Write-Host ''
  Write-Host '可用备份：'
  for ($i = 0; $i -lt $files.Count; $i++) {
    $sizeMb = [math]::Round($files[$i].Length / 1MB, 2)
    Write-Host ("  [{0}] {1}  {2} MB  {3}" -f ($i + 1), $files[$i].LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'), $sizeMb, $files[$i].Name)
  }
  $choice = Read-Host '选择编号（回车默认 1）'
  if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }
  $index = 0
  if (-not [int]::TryParse($choice, [ref]$index) -or $index -lt 1 -or $index -gt $files.Count) {
    throw "无效的备份编号：$choice"
  }
  return [string]$files[$index - 1].FullName
}

function Invoke-ResetWorkflow([string]$Mode = $Scope) {
  if (-not $Yes -and -not $DryRun) {
    $scopeText = if ($Mode -eq 'All') { '全部 DSH 会话' } else { "仅 $WorkbenchBase 下的会话" }
    $answer = Read-Host "将先备份当前会话，然后退出 DSH、清除$scopeText，再重新打开 DSH。继续？[y/N]"
    if ($answer -notmatch '^[yY]') { Write-Output '已取消'; return }
  }
  $manageApp = ($DshHome -eq $DefaultDshHome)
  if ($manageApp -and -not $DryRun -and (Test-RunningInsideDsh)) {
    throw '检测到脚本运行在 DSH 进程内部；请从资源管理器或独立 PowerShell 窗口运行。'
  }
  $dshStopped = $false
  try {
    Write-Output '=== [1/4] 备份 ==='
    Invoke-BackupStep 'pre-reset'
    Write-Output '=== [2/4] 退出 DSH ==='
    if ($manageApp) {
      Stop-DshDesktop
      $dshStopped = $true
    }
    else { Write-Output '[跳过] 非默认 DSH_HOME，不操作桌面端' }
    Write-Output '=== [3/4] 清除会话 ==='
    Clear-DshSessions $Mode
  }
  finally {
    Write-Output '=== [4/4] 打开 DSH ==='
    if ($manageApp -and $dshStopped -and -not $NoRelaunch) { Start-DshDesktop }
    else { Write-Output '[跳过] 不自动打开 DSH' }
  }
  Write-Output '[完成] 重置流程结束'
}

function Invoke-RestoreWorkflow([string]$ArchivePath) {
  if ([string]::IsNullOrWhiteSpace($ArchivePath)) {
    if ($Yes -and -not $DryRun) {
      $files = @(Get-BackupFiles)
      if ($files.Count -eq 0) { throw "没有可用备份：$BackupDir" }
      $ArchivePath = $files[0].FullName
    }
    else {
      # 只取最后一项：即使以后函数里混入意外管道输出，也不会把整个列表拼进路径。
      $ArchivePath = @(Select-BackupArchive)[-1]
    }
  }
  $resolved = (Resolve-Path -LiteralPath $ArchivePath).Path
  if (-not $Yes -and -not $DryRun) {
    $answer = Read-Host "将退出 DSH、用 $resolved 覆盖当前会话，再重新打开 DSH（不再额外备份）。继续？[y/N]"
    if ($answer -notmatch '^[yY]') { Write-Output '已取消'; return }
  }
  $manageApp = ($DshHome -eq $DefaultDshHome)
  if ($manageApp -and -not $DryRun -and (Test-RunningInsideDsh)) {
    throw '检测到脚本运行在 DSH 进程内部；请从资源管理器或独立 PowerShell 窗口运行。'
  }
  $dshStopped = $false
  try {
    Write-Output '=== [1/3] 退出 DSH ==='
    if ($manageApp) {
      Stop-DshDesktop
      $dshStopped = $true
    }
    else { Write-Output '[跳过] 非默认 DSH_HOME，不操作桌面端' }
    Write-Output '=== [2/3] 恢复会话 ==='
    if ($DryRun) {
      Write-Output "[dry-run] 跳过恢复 $resolved"
    }
    else {
      & $BackupScript restore $resolved -Yes -DshHome $DshHome -BackupDir $BackupDir -SkipPreBackup
      if (-not $?) { throw '恢复失败' }
    }
  }
  finally {
    Write-Output '=== [3/3] 打开 DSH ==='
    if ($manageApp -and $dshStopped -and -not $NoRelaunch) { Start-DshDesktop }
    else { Write-Output '[跳过] 不自动打开 DSH' }
  }
  Write-Output '[完成] 恢复流程结束'
}

function Show-Menu {
  while ($true) {
    Write-Output ''
    Write-Output '========================================'
    Write-Output '            DSH 会话工具'
    Write-Output '========================================'
    Write-Output '  1. 仅备份当前会话（不会退出 DSH）'
    Write-Output '  2. 一键重置：备份 → 退出 DSH → 清除会话 → 打开 DSH'
    Write-Output '  3. 一键恢复：退出 DSH → 恢复备份 → 打开 DSH'
    Write-Output '  4. 查看备份列表'
    Write-Output '  0. 退出'
    $choice = Read-Host '请选择'
    switch ($choice) {
      '1' {
        try {
          Invoke-BackupStep 'manual'
          Write-Output '备份完成。这个选项只备份，不会退出 DSH；需要重置请选 2。'
        }
        catch { Write-Output "[错误] $($_.Exception.Message)" }
      }
      '2' {
        $scopeChoice = Read-Host '清除范围：A=全部会话 / W=仅工作台会话（默认 A）'
        $menuScope = 'All'
        if ($scopeChoice -match '^[wW]') { $menuScope = 'Workbench' }
        try { Invoke-ResetWorkflow -Mode $menuScope } catch { Write-Output "[错误] $($_.Exception.Message)" }
      }
      '3' { try { Invoke-RestoreWorkflow $null } catch { Write-Output "[错误] $($_.Exception.Message)" } }
      '4' {
        $files = @(Get-BackupFiles)
        if ($files.Count -eq 0) { Write-Output "还没有备份：$BackupDir" }
        else { foreach ($file in $files) { Write-Output ("{0}  {1,8} MB  {2}" -f $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'), [math]::Round($file.Length / 1MB, 2), $file.FullName) } }
      }
      '0' { return }
      default { Write-Output '无效选项' }
    }
  }
}

switch ($Action) {
  'menu' { Show-Menu }
  'backup' { Invoke-BackupStep 'manual' }
  'list' {
    $files = @(Get-BackupFiles)
    if ($files.Count -eq 0) { Write-Output "还没有备份：$BackupDir" }
    else { foreach ($file in $files) { Write-Output ("{0}  {1,8} MB  {2}" -f $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'), [math]::Round($file.Length / 1MB, 2), $file.FullName) } }
  }
  'reset' { Invoke-ResetWorkflow -Mode $Scope }
  'restore' {
    $resolvedArchive = $Archive
    if ([string]::IsNullOrWhiteSpace($resolvedArchive) -and $Yes -and -not $DryRun) {
      $files = @(Get-BackupFiles)
      if ($files.Count -eq 0) { throw "没有可用备份：$BackupDir" }
      $resolvedArchive = $files[0].FullName
    }
    Invoke-RestoreWorkflow $resolvedArchive
  }
}
