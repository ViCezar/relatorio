param(
    [ValidateSet("docker", "local")]
    [string]$Mode = "local",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-EnvFile {
    param(
        [string]$ExamplePath,
        [string]$EnvPath
    )

    if (-not (Test-Path $EnvPath)) {
        Copy-Item $ExamplePath $EnvPath -Force
        Write-Host "Criado: $EnvPath"
    }
}

function Get-EnvValue {
    param(
        [string]$FilePath,
        [string]$Key
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
        [string]$Hostname,
        [int]$Port,
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

function Stop-PortProcess {
    param(
        [int]$Port
    )

    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

        foreach ($connection in $connections) {
            $pidProcess = $connection.OwningProcess

            if ($pidProcess) {
                Write-Host "Porta $Port em uso pelo PID $pidProcess. Finalizando..."

                try {
                    Stop-Process -Id $pidProcess -Force -ErrorAction Stop
                    Write-Host "Processo $pidProcess finalizado com sucesso."
                }
                catch {
                    Write-Host "Nao foi possivel finalizar o PID $pidProcess automaticamente."
                }
            }
        }
    }
    catch {
        Write-Host "Nao foi possivel verificar a porta $Port."
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "====================================="
Write-Host " INICIANDO SAAS - MODO $Mode"
Write-Host " Pasta raiz: $root"
Write-Host "====================================="
Write-Host ""

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

Verifique se o PostgreSQL esta rodando.
"@
}

Write-Host "Liberando portas antigas..."
Stop-PortProcess -Port 8003
Stop-PortProcess -Port 5173

Start-Sleep -Seconds 2

if (-not (Test-Path $venvPython)) {
    Write-Host "Criando ambiente virtual do backend..."
    python -m venv $venvPath
}

Write-Host "Instalando dependencias do backend..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $backendPath "requirements.txt")

Write-Host "Garantindo banco de dados..."

$ensureDbScriptPath = Join-Path $backendPath "ensure_db_temp.py"

@"
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
            cur.execute('CREATE DATABASE "{}"'.format(target_db))
            print("Database criada: {}".format(target_db))
        else:
            print("Database ja existe: {}".format(target_db))
"@ | Set-Content -Path $ensureDbScriptPath -Encoding UTF8

$previousDbUrl = $env:DATABASE_URL
$env:DATABASE_URL = $databaseUrl

try {
    & $venvPython $ensureDbScriptPath
}
finally {
    $env:DATABASE_URL = $previousDbUrl
    Remove-Item $ensureDbScriptPath -Force -ErrorAction SilentlyContinue
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

$backendCommand = "Set-Location '$backendPath'; & '$venvPython' -m uvicorn app.main:app --host 0.0.0.0 --port 8003 --reload"
$frontendCommand = "Set-Location '$frontendPath'; npm run dev"

Write-Host ""
Write-Host "Abrindo backend e frontend..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null

Write-Host ""
Write-Host "====================================="
Write-Host " SAAS INICIADO COM SUCESSO"
Write-Host "====================================="
Write-Host "Frontend: http://localhost:5173"
Write-Host "API Docs:  http://localhost:8003/docs"
Write-Host "Login:     admin@local / admin123"
Write-Host ""
Write-Host "Obs: PostgreSQL deve estar rodando em localhost:5432."
Write-Host "====================================="