param(
    [ValidateSet("docker", "local")]
    [string]$Mode = "docker",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-EnvFile {
    param(
        [Parameter(Mandatory = $true)][string]$ExamplePath,
        [Parameter(Mandatory = $true)][string]$EnvPath
    )
    if (-not (Test-Path $EnvPath)) {
        Copy-Item $ExamplePath $EnvPath -Force
        Write-Host "Criado: $EnvPath"
    }
}

function Get-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Key
    )
    if (-not (Test-Path $FilePath)) {
        return $null
    }
    $line = Get-Content $FilePath | Where-Object { $_ -match "^\s*$Key=" } | Select-Object -First 1
    if (-not $line) {
        return $null
    }
    return ($line -split "=", 2)[1].Trim()
}

function Test-TcpPort {
    param(
        [Parameter(Mandatory = $true)][string]$Hostname,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMs = 2000
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($Hostname, $Port, $null, $null)
        $connected = $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if (-not $connected) {
            return $false
        }
        $client.EndConnect($iar) | Out-Null
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if ($Mode -eq "docker") {
    if (-not (Test-Command "docker")) {
        throw "Docker CLI nao encontrado. Instale o Docker Desktop."
    }

    cmd /c "docker info >nul 2>nul"
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Engine nao esta ativo. Abra o Docker Desktop e aguarde ficar Running."
    }

    Write-Host "Subindo stack via Docker Compose..."
    if ($NoBuild) {
        docker compose up
    }
    else {
        docker compose up --build
    }
    exit $LASTEXITCODE
}

if (-not (Test-Command "python")) {
    throw "Python nao encontrado no PATH."
}

if (-not (Test-Command "npm")) {
    throw "npm nao encontrado no PATH."
}

$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"
$venvPath = Join-Path $backendPath ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$backendEnv = Join-Path $backendPath ".env"
$backendEnvExample = Join-Path $backendPath ".env.example"
$frontendEnv = Join-Path $frontendPath ".env"
$frontendEnvExample = Join-Path $frontendPath ".env.example"

Ensure-EnvFile -ExamplePath $backendEnvExample -EnvPath $backendEnv
Ensure-EnvFile -ExamplePath $frontendEnvExample -EnvPath $frontendEnv

$databaseUrl = Get-EnvValue -FilePath $backendEnv -Key "DATABASE_URL"
if (-not $databaseUrl) {
    throw "DATABASE_URL nao encontrado em $backendEnv"
}

$dbMatch = [regex]::Match($databaseUrl, "@(?<host>[^:/]+):(?<port>\d+)/(?<db>[^?]+)")
if (-not $dbMatch.Success) {
    throw "Nao foi possivel interpretar DATABASE_URL: $databaseUrl"
}

$dbHost = $dbMatch.Groups["host"].Value
$dbPort = [int]$dbMatch.Groups["port"].Value

if (-not (Test-TcpPort -Hostname $dbHost -Port $dbPort)) {
    throw @"
PostgreSQL nao esta acessivel em ${dbHost}:$dbPort.
Instale e inicie o PostgreSQL localmente e tente novamente.

Sugestao de instalacao via winget (PowerShell Admin):
winget install -e --id PostgreSQL.PostgreSQL.16
"@
}

try {
    $apiPortInUse = Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction Stop | Select-Object -First 1
}
catch {
    $apiPortInUse = $null
}
if ($apiPortInUse) {
    throw "A porta 8002 ja esta em uso (PID $($apiPortInUse.OwningProcess)). Finalize esse processo e rode o script novamente."
}

try {
    $frontPortInUse = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop | Select-Object -First 1
}
catch {
    $frontPortInUse = $null
}
if ($frontPortInUse) {
    throw "A porta 5173 ja esta em uso (PID $($frontPortInUse.OwningProcess)). Finalize esse processo e rode o script novamente."
}

if (-not (Test-Path $venvPython)) {
    Write-Host "Criando ambiente virtual do backend..."
    python -m venv $venvPath
}

Write-Host "Instalando dependencias do backend..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $backendPath "requirements.txt")

Write-Host "Garantindo que o banco de dados exista..."
$ensureDbScript = @"
import os
import psycopg
from sqlalchemy.engine import make_url

url = make_url(os.environ["DATABASE_URL"])
target_db = url.database
admin_url = url.set(database="postgres")
conn_str = str(admin_url).replace("+psycopg", "")

with psycopg.connect(conn_str, autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
        exists = cur.fetchone() is not None
        if not exists:
            cur.execute(f'CREATE DATABASE "{target_db}"')
            print(f"Database criada: {target_db}")
        else:
            print(f"Database ja existe: {target_db}")
"@

$previousDbUrl = $env:DATABASE_URL
$env:DATABASE_URL = $databaseUrl
try {
    & $venvPython -c $ensureDbScript
}
finally {
    $env:DATABASE_URL = $previousDbUrl
}

Write-Host "Rodando migrations e seed..."
Push-Location $backendPath
& $venvPython -m alembic -c "alembic.ini" upgrade head
& $venvPython -m app.seed
Pop-Location

Write-Host "Instalando dependencias do frontend..."
Push-Location $frontendPath
npm install
Pop-Location

$backendCommand = "Set-Location '$backendPath'; & '$venvPython' -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload"
$frontendCommand = "Set-Location '$frontendPath'; npm run dev"

Write-Host "Abrindo processos backend e frontend em novas janelas..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null

Write-Host ""
Write-Host "Pronto."
Write-Host "Frontend: http://localhost:5173"
Write-Host "API docs: http://localhost:8002/docs"
Write-Host "Login: admin@local / admin123"
Write-Host "Obs: PostgreSQL deve estar rodando em localhost:5432."
