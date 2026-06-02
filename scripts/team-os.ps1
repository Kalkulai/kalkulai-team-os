# team-os.ps1 — Team-OS CLI fuer AI-Agenten (Claude Code, Codex, Hermes)
# Laedt Credentials aus .env.local im Repo-Root (TEAM_OS_BASE_URL + DASHBOARD_API_SECRET)
# Verwendung: .\scripts\team-os.ps1 <command> [args]
#
# Commands:
#   members                           Liste aller Teammitglieder
#   kpis <name|uuid>                  KPIs eines Members (Name: leon|felix|paul)
#   briefing <name|uuid>              Markdown-Briefing fuer Member
#   create-task <name|uuid> <title>   Linear-Task anlegen (source: hermes)
#   status-task <linear-id> <status>  Task-Status setzen: todo|in-progress|on-hold|done
#   complete-task <linear-id>         Linear-Task abschliessen
#   create-counter <name|uuid> <name> <unit> [target]  Counter anlegen
#   health <name|uuid>                Smoke-Test der Pipeline
#   crons                             Cron-Status auf Server abfragen (via SSH)

[CmdletBinding()]
param(
    [Parameter(Position=0, Mandatory=$true)]
    [string]$Command,
    [Parameter(Position=1)]
    [string]$Arg1,
    [Parameter(Position=2)]
    [string]$Arg2,
    [Parameter(Position=3)]
    [string]$Arg3,
    [Parameter(Position=4)]
    [string]$Arg4
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# .env.local laden
$envFile = Join-Path $PSScriptRoot ".." ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Error ".env.local nicht gefunden unter: $envFile"
    exit 1
}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)$') {
        $k = $Matches[1]; $v = $Matches[2].Trim('"').Trim("'")
        if (-not [System.Environment]::GetEnvironmentVariable($k)) {
            [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
        }
    }
}

$BASE = if ($env:TEAM_OS_BASE_URL) { $env:TEAM_OS_BASE_URL } else { 'https://kalkulai-team-os.vercel.app' }
$SECRET = $env:DASHBOARD_API_SECRET
if (-not $SECRET) {
    Write-Error "DASHBOARD_API_SECRET fehlt in .env.local"
    exit 1
}
$BASE = $BASE.TrimEnd('/')
$Headers = @{ Authorization = "Bearer $SECRET"; 'Content-Type' = 'application/json' }

# Hilfsfunktionen
function Invoke-API {
    param([string]$Method, [string]$Path, [hashtable]$Body = $null, [bool]$Auth = $true)
    $h = if ($Auth) { $Headers } else { @{ 'Content-Type' = 'application/json' } }
    $params = @{ Method = $Method; Uri = "$BASE$Path"; Headers = $h }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
    Invoke-RestMethod @params
}

function Resolve-Member {
    param([string]$NameOrId)
    $members = Invoke-API -Method GET -Path '/api/members' -Auth $false
    $m = $members | Where-Object { $_.name -ieq $NameOrId -or $_.id -eq $NameOrId }
    if (-not $m) { Write-Error "Member '$NameOrId' nicht gefunden. Verfuegbar: $(($members | Select-Object -Expand name) -join ', ')"; exit 1 }
    $m | Select-Object -First 1
}

# Command-Dispatch
switch ($Command.ToLower()) {

    'members' {
        $members = Invoke-API -Method GET -Path '/api/members' -Auth $false
        $members | ForEach-Object {
            Write-Host "[$($_.role.ToUpper())] $($_.name) — $($_.id)"
            Write-Host "    telegram_chat_id: $($_.telegram_chat_id)"
            Write-Host "    linear_user_id:   $($_.linear_user_id)"
            Write-Host "    notion_user_id:   $($_.notion_user_id)"
            Write-Host ""
        }
    }

    'kpis' {
        if (-not $Arg1) { Write-Error "Usage: team-os.ps1 kpis <name|uuid>"; exit 1 }
        $m = Resolve-Member $Arg1
        $kpis = Invoke-API -Method GET -Path "/api/kpis?userId=$($m.id)"
        Write-Host "KPIs fuer $($m.name) ($($m.id)):"
        $kpis | ForEach-Object {
            $done = if ($_.completed) { "x" } else { " " }
            $progress = "$($_.actual)/$($_.target)"
            Write-Host "  [$done] [$($_.type)] $($_.name) — $progress $($_.unit)   id=$($_.id)"
        }
    }

    'briefing' {
        if (-not $Arg1) { Write-Error "Usage: team-os.ps1 briefing <name|uuid>"; exit 1 }
        $m = Resolve-Member $Arg1
        $result = Invoke-API -Method GET -Path "/api/briefing/build?userId=$($m.id)"
        Write-Host $result.markdown
    }

    'create-task' {
        if (-not $Arg1 -or -not $Arg2) { Write-Error "Usage: team-os.ps1 create-task <name|uuid> <title>"; exit 1 }
        $m = Resolve-Member $Arg1
        $task = Invoke-API -Method POST -Path '/api/tasks/create' -Body @{ title = $Arg2; userId = $m.id; source = 'hermes' }
        Write-Host "Task angelegt: $($task.identifier) — $($task.title)"
        Write-Host "Linear-ID: $($task.id)"
        if ($task.url) { Write-Host "URL: $($task.url)" }
    }

    'status-task' {
        if (-not $Arg1 -or -not $Arg2) {
            Write-Error "Usage: team-os.ps1 status-task <linear-issue-id> <todo|in-progress|on-hold|done>"
            exit 1
        }
        $allowed = @('todo', 'in-progress', 'on-hold', 'done')
        if ($allowed -notcontains $Arg2) {
            Write-Error "Status '$Arg2' ungueltig. Erlaubt: $($allowed -join ', ')"
            exit 1
        }
        Invoke-API -Method PATCH -Path '/api/tasks/status' -Body @{ issueId = $Arg1; status = $Arg2 } | Out-Null
        Write-Host "Task-Status gesetzt: $Arg1 -> $Arg2"
    }

    'complete-task' {
        if (-not $Arg1) { Write-Error "Usage: team-os.ps1 complete-task <linear-issue-id>"; exit 1 }
        Invoke-API -Method POST -Path '/api/tasks/complete' -Body @{ issueId = $Arg1 } | Out-Null
        Write-Host "Task abgeschlossen: $Arg1"
    }

    'create-counter' {
        if (-not $Arg1 -or -not $Arg2 -or -not $Arg3) {
            Write-Error "Usage: team-os.ps1 create-counter <name|uuid> <counter-name> <unit> [target]"
            exit 1
        }
        $m = Resolve-Member $Arg1
        $target = if ($Arg4) { [int]$Arg4 } else { 0 }
        $kpi = Invoke-API -Method POST -Path '/api/kpis' -Body @{
            user_id = $m.id; type = 'counter'; name = $Arg2; unit = $Arg3; target = $target
        }
        Write-Host "Counter angelegt: $($kpi.name) ($($kpi.unit), Ziel=$($kpi.target)) — id=$($kpi.id)"
    }

    'health' {
        if (-not $Arg1) { Write-Error "Usage: team-os.ps1 health <name|uuid>"; exit 1 }
        $m = Resolve-Member $Arg1
        $result = Invoke-API -Method GET -Path "/api/briefing/build?userId=$($m.id)"
        $len = $result.markdown.Length
        Write-Host "OK — Briefing fuer $($m.name): $len Zeichen"
    }

    'crons' {
        $json = ssh "leon@178.104.220.160" "sudo cat /opt/agents/kalkulai/hermes-data/cron/jobs.json"
        $jobs = ($json | ConvertFrom-Json).jobs
        $jobs | ForEach-Object {
            $status = if ($_.enabled) { "AKTIV" } else { "pausiert" }
            Write-Host "[$status] $($_.name) ($($_.id)) — $($_.schedule.expr)"
        }
    }

    default {
        Write-Host @"
team-os.ps1 — Team-OS Dashboard CLI fuer AI-Agenten

Commands:
  members                                      Alle Teammitglieder
  kpis <name|uuid>                             KPIs eines Members (leon|felix|paul)
  briefing <name|uuid>                         Markdown-Briefing
  create-task <name|uuid> <title>              Linear-Task anlegen
  status-task <linear-id> <status>             Status setzen: todo|in-progress|on-hold|done
  complete-task <linear-id>                    Linear-Task abschliessen
  create-counter <name|uuid> <name> <unit> [target]  Counter anlegen
  health <name|uuid>                           Smoke-Test
  crons                                        Cron-Status (via SSH)

Credentials: .env.local (TEAM_OS_BASE_URL + DASHBOARD_API_SECRET)
Auth: DASHBOARD_API_SECRET (nicht NEXT_PUBLIC_*!)
"@
    }
}
