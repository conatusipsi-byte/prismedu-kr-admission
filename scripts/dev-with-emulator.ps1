# dev-with-emulator.ps1 — Windows PowerShell 버전
#
# 흐름은 dev-with-emulator.sh 와 동일. concurrently 로 단일 프로세스 트리.
#
# 사용:
#   pwsh ./scripts/dev-with-emulator.ps1
#   또는
#   npm run dev:emu

$ErrorActionPreference = "Stop"

# Java 사전 체크
$javaCheck = Get-Command java -ErrorAction SilentlyContinue
if (-not $javaCheck) {
    Write-Host "❌ Java 미설치. Firebase Emulator 는 JRE 11+ 필요." -ForegroundColor Red
    Write-Host "   설치: https://adoptium.net/temurin/releases/?version=17"
    exit 1
}

Write-Host "🔥 Firebase Emulator + dev 서버 동시 시작..." -ForegroundColor Cyan

# concurrently 사용 — Emulator + 시드 + dev 서버 동시.
# Emulator 가 준비되기 전에 시드가 실행될 수 있어 시드 단계는 별도 sleep 후 실행.
$emulatorCmd = "npx firebase emulators:start --only firestore,auth,storage --project demo-conatusipsi"
$seedCmd = "node -e `"setTimeout(() => 0, 8000)`" && npx cross-env FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 GCLOUD_PROJECT=demo-conatusipsi tsx scripts/firestore/init-collections.ts"
$devCmd = "npx cross-env NEXT_PUBLIC_USE_EMULATOR=true npm run dev"

npx concurrently `
    --kill-others-on-fail `
    --names "EMU,SEED,DEV" `
    --prefix-colors "magenta,yellow,cyan" `
    "$emulatorCmd" `
    "$seedCmd" `
    "$devCmd"
