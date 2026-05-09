#!/usr/bin/env node
/**
 * scripts/firestore/seed-staging.ts — staging 환경 시드 wrapper
 *
 * init-collections.ts의 시드 로직을 그대로 재사용하면서, staging 운영자가
 * 첫 배포 검증 시 따라하기 쉽게 진행 보고를 추가한 wrapper.
 *
 * 사용:
 *   # 방법 1 — 서비스 계정 JSON 파일 경로
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
 *   npx tsx scripts/firestore/seed-staging.ts
 *
 *   # 방법 2 — JSON을 환경변수에 직접 (CI/CD 환경)
 *   export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
 *   npx tsx scripts/firestore/seed-staging.ts
 *
 * 옵션:
 *   --dry-run   실제 쓰기 없이 어떤 도큐먼트가 만들어질지 출력
 *   --force     기존 도큐먼트 덮어쓰기 (개발 환경 reset 용도, 운영 환경 사용 금지)
 *
 * 멱등성:
 *   기본 동작은 멱등 (이미 존재하는 도큐먼트는 skip). 재실행 안전.
 *
 * ⚠️ 본 스크립트는 **mock 데이터** 시드용. 실제 모집요강 ETL은 별도 파이프라인.
 *    출시 직전(2026-09)엔 mock 학과(서울대 의예 외 4개) 제거 + 실 데이터로 교체.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSeed, type Options } from "./init-collections";

/* ═══════════════════════════════════════════════════════════════════════
   환경변수 검증 — staging 환경에서 자주 빠뜨리는 부분
   ═══════════════════════════════════════════════════════════════════════ */

function ensureCredentials(): void {
  const hasFilePath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasJsonEnv = !!process.env.FIREBASE_SERVICE_ACCOUNT;

  if (hasFilePath) {
    const p = process.env.GOOGLE_APPLICATION_CREDENTIALS!;
    if (!fs.existsSync(p)) {
      console.error(`❌ GOOGLE_APPLICATION_CREDENTIALS 파일을 찾을 수 없습니다: ${p}`);
      console.error("   docs/staging-setup.md §7.5 참조");
      process.exit(1);
    }
    return;
  }

  if (hasJsonEnv) {
    // JSON env → 임시 파일로 작성하고 GOOGLE_APPLICATION_CREDENTIALS로 export
    // (firebase-admin이 두 방식 모두 지원하지만, applicationDefault()는 파일 경로만 인식)
    try {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT!;
      JSON.parse(json); // 유효성 사전 검증
      const tmpFile = path.join(os.tmpdir(), `conatusipsi-sa-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, json, { mode: 0o600 });
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;
      console.log(`🔑 FIREBASE_SERVICE_ACCOUNT → 임시 파일로 변환: ${tmpFile}`);
    } catch (e) {
      console.error("❌ FIREBASE_SERVICE_ACCOUNT JSON 파싱 실패:", (e as Error).message);
      process.exit(1);
    }
    return;
  }

  console.error("❌ Firebase 인증 환경변수가 없습니다.");
  console.error("");
  console.error("   다음 중 하나를 설정 후 재실행:");
  console.error("     GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json");
  console.error("     FIREBASE_SERVICE_ACCOUNT='{\"type\":\"service_account\",...}'");
  console.error("");
  console.error("   상세 절차: docs/staging-setup.md §2.6 + §3.2");
  process.exit(1);
}

/* ═══════════════════════════════════════════════════════════════════════
   메인
   ═══════════════════════════════════════════════════════════════════════ */

interface CliOptions extends Options {
  help: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  return {
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function printHelp(): void {
  console.log("scripts/firestore/seed-staging.ts — staging 환경 시드 wrapper");
  console.log("");
  console.log("사용:");
  console.log("  GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json npx tsx scripts/firestore/seed-staging.ts");
  console.log("");
  console.log("옵션:");
  console.log("  --dry-run   실제 쓰기 없이 시뮬레이션");
  console.log("  --force     기존 도큐먼트 덮어쓰기 (운영 환경 사용 금지)");
  console.log("  --help      본 메시지");
}

async function main(): Promise<void> {
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    return;
  }

  ensureCredentials();

  console.log("🏗  Firestore staging 시드 시작");
  console.log("   대상 학과 5개:");
  console.log("     1) 서울대학교 / 의예과 — 정시 시연 (작은 표본)");
  console.log("     2) 연세대학교 / 경영학과 — P-006 학종 분해 시연 (학종+정시)");
  console.log("     3) 부산대학교 / 정보컴퓨터공학부 — P-012 변환표 preliminary 시연");
  console.log("     4) 고려대학교 / 자유전공학부 — P-001 표본 부족 시연");
  console.log("     5) 한국예술종합학교 / 영상원 영화과 — 실기 전형");
  console.log("");
  console.log(`   모드: ${opts.dryRun ? "dry-run" : opts.force ? "force overwrite" : "idempotent"}`);
  console.log("");

  const startedAt = Date.now();
  try {
    await runSeed({ force: opts.force, dryRun: opts.dryRun });
  } catch (e) {
    console.error("");
    console.error("❌ 시드 실패:", (e as Error).message);
    console.error("   docs/staging-setup.md §7 트러블슈팅 참조");
    process.exit(1);
  }
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("");
  console.log(`✨ 시드 완료 (${elapsedSec}s)`);
  console.log("   학과 5개 / 합격 사례 27건 / 표본 통계 6건 로드됨");
  console.log("");
  console.log("   다음 단계:");
  console.log("     1. Firebase Console → Firestore에서 universities 컬렉션 확인 (snu/yonsei/pusan/korea/knua)");
  console.log("     2. docs/staging-setup.md §6 첫 배포 검증 5단계 진행");
  console.log("     3. /analysis 폼 진입 → 결과 페이지에서 P-001/P-006/P-012 분기 시각 확인");
}

main();
