#!/usr/bin/env bash
# dev-with-emulator.sh — Firebase Emulator + 시드 데이터 + Next.js dev 서버 동시 실행
#
# 흐름:
#   1. Firebase Emulator 백그라운드 시작 (Firestore + Auth + Storage + UI)
#   2. Emulator ready 대기 (포트 4000 응답)
#   3. 시드 데이터 로드 (FIRESTORE_EMULATOR_HOST=localhost:8080)
#   4. Next.js dev 서버 시작 (NEXT_PUBLIC_USE_EMULATOR=true)
#   5. SIGINT/SIGTERM 시 모든 프로세스 cleanup
#
# 의존:
#   - Java JRE 11+ (Emulator 필수)
#   - firebase-tools (devDep, 자동)
#   - .env.local 에 NEXT_PUBLIC_USE_EMULATOR=true 또는 cmd 환경변수
#
# 사용:
#   ./scripts/dev-with-emulator.sh

set -euo pipefail

cleanup() {
  echo ""
  echo "🛑 cleanup — Emulator + dev 서버 종료"
  if [[ -n "${EMULATOR_PID:-}" ]]; then
    kill -TERM "$EMULATOR_PID" 2>/dev/null || true
  fi
  if [[ -n "${DEV_PID:-}" ]]; then
    kill -TERM "$DEV_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo "🔥 Firebase Emulator 시작..."
npx firebase emulators:start --only firestore,auth,storage --project demo-conatusipsi &
EMULATOR_PID=$!

echo "⏳ Emulator UI 응답 대기 (최대 60초)..."
for i in {1..30}; do
  if curl -fsS http://localhost:4000 > /dev/null 2>&1; then
    echo "✅ Emulator ready"
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    echo "❌ Emulator 시작 실패 — Java 설치 확인 (java -version)"
    exit 1
  fi
done

echo "🌱 시드 데이터 로드..."
FIRESTORE_EMULATOR_HOST=localhost:8080 \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
GCLOUD_PROJECT=demo-conatusipsi \
  npx tsx scripts/firestore/init-collections.ts || {
  echo "⚠️ 시드 로드 실패 — 빈 Emulator 로 계속 진행"
}

echo "🚀 Next.js dev 서버 시작 (Emulator 연결됨)..."
NEXT_PUBLIC_USE_EMULATOR=true npm run dev &
DEV_PID=$!

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  🌐 dev 서버:        http://localhost:9002"
echo "  🔥 Emulator UI:     http://localhost:4000"
echo "  📦 Firestore:       localhost:8080"
echo "  🔐 Auth:            localhost:9099"
echo "  Ctrl+C 로 모두 종료"
echo "════════════════════════════════════════════════════════════════"

wait
