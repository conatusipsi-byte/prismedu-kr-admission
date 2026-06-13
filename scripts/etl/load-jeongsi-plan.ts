/**
 * load-jeongsi-plan.ts — 정시 예정안(전형시행계획) JSONB 병합 적재기.
 *
 * 정직성/안전 (P-002):
 *   - "예정안"(preliminary) — 12월 정시모집요강 확정본으로 교체 예정. track.planStatus="preliminary".
 *   - JSONB MERGE(read-modify-write): jeongsi_* 키만 추가/치환, 기존 수시 트랙은 100% 보존.
 *     (단순 upsert 는 tracks 통째 교체라 수시가 날아감 → 절대 금지)
 *   - 적재 후 자기검증: 적재 전 존재하던 non-jeongsi 트랙 kind 가 전부 남아있는지 assert. 실패 시 throw.
 *   - 세부 환산점수(변환표준점수표 등)는 12월 → conversionTable.status="not_applicable", 지어내지 않음.
 *
 * 무료 경로(방준현 Console API 미사용): pdftotext + 본 스크립트만.
 * DB I/O: Supabase Management API(SUPABASE_ACCESS_TOKEN) — load-admissions.ts 와 동일 패턴.
 *
 * 사용: .env.local 로드 후  `npx tsx scripts/etl/load-jeongsi-plan.ts [--commit]`
 *   --commit 없으면 DRY-RUN(미적재, before/after 미리보기만).
 */
import type { AdmissionTrack, AdmissionTrackKind } from "../../types/admission";

const REF = "bqmccfeglxzzrmgdirxe";
async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN 미설정 — .env.local 확인");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T[]>;
}
const esc = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const escArr = (a: string[]) => `ARRAY[${a.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]::text[]`;
const escStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

const YEAR = 2027;
const PLAN_PUBLISHED_YEAR = 2025;
const PUSAN_PLAN_URL =
  "부산대학교 2027학년도 대학입학전형 기본계획 (2025.4 발표, 입학처 공개 PDF)";

interface JeongsiSeedRow {
  universityId: string;
  departmentId: string;
  /** 적재할 정시 트랙들 (jeongsi_ga/na/da) */
  jeongsi: AdmissionTrack[];
}

/* ───── 부산대 파일럿 (2027 전형시행계획 추출) ─────
   기계공학부(u04040100012-ba-d) 정시:
   - 군/인원: 가군 수능전형 60명 (논술=50 컬럼 앵커로 확정). ※ 타 군 약 15명은 확정본에서 반영(예정안 단계 보류).
   - 전형방법: 수능 100% (일괄선발).
   - 수능최저: 미적용.
   - 영역별 반영(자연계열): 국200·수300·영200·탐300 = 1,000 → 국20%·수30%·영20%·탐30%.
       · 국/수 = 표준점수, 탐구 = 변환표준점수, 영어 = 등급환산(1등급 200…9등급 165), 한국사 = 등급 가산(1등급 10).
   - 가산점: 과학탐구 2과목 응시 시 과목별 변환표준점수의 5%를 전형 총점에 가산(도시공학과 제외).
   - 변환표준점수표 등 세부: 정시모집요강(12월) 확정 → conversionTable.status="not_applicable". */
const PUSAN_MECH_JEONGSI: AdmissionTrack = {
  kind: "jeongsi_ga",
  name: "수능전형",
  specialType: "general",
  quotaInitial: 60,
  stages: [{ step: 1, components: { csat: 100 } }],
  // 정시는 수능최저 미적용
  reflectionRatio: {
    korean: { ratio: 20, scoreType: "standard" },
    math: { ratio: 30, scoreType: "standard" },
    english: {
      ratio: 20,
      gradeMap: { 1: 200, 2: 198, 3: 195, 4: 190, 5: 185, 6: 180, 7: 175, 8: 170, 9: 165 },
    },
    investigation: { ratio: 30, scoreType: "converted_standard" },
    // 한국사: 전형총점 가산(반영비율 0). 1등급 10점.
    history: { ratio: 0, gradeMap: { 1: 10, 2: 10, 3: 9.8, 4: 9.6, 5: 9.4, 6: 9.2, 7: 9.0, 8: 8.8, 9: 8.6 } },
    // 과학탐구 2과목 응시 시 변환표준점수 5% 전형총점 가산
    bonusByCourse: { science_two_subjects_pct: 5 },
  },
  conversionTable: { status: "not_applicable" }, // 변환표준점수표는 12월 정시모집요강 확정
  planStatus: "preliminary",
  planSource: { kind: "admission_plan", publishedYear: PLAN_PUBLISHED_YEAR, sourceUrl: PUSAN_PLAN_URL },
  notes:
    "2027 전형시행계획(예정) 기준 · 가군 수능전형 수능100% · 자연계열 영역별 반영(국200:수300:영200:탐300) · " +
    "과학탐구 2과목 응시 시 변환표준점수 5% 전형총점 가산 · 수능최저 미적용 · 영어/한국사 등급환산 · " +
    "변환표준점수표 등 세부는 정시모집요강(12월) 확정 예정. (타 군 약 15명 모집은 확정본에서 반영 예정)",
};

/* ───── 고려대 배치1 (2027 전형시행계획 p.24-25 추출) ─────
   - 정시 일반전형, 전 모집단위 '가'군(단일군).
   - 수능 영역별 반영점수(계열별):
       자연·의학(가정교육·간호 제외): 국200·수240·탐200(표준점수) + 영어/한국사 등급별 감점(별도) + 과탐 변환점수 3% 가산
       인문 전체:                    국200·수200·탐160(표준점수) + 영어/한국사 등급별 감점(별도)
   - 수능최저: 정시 일반전형 미적용(의대 등 특수는 보류). 변환표준점수표 등 세부는 12월 확정 → conversionTable null.
   - 모집인원: 정시 일반전형 모집단위별 인원(총괄표 last numeric column). 예체능·간호·가정교육·의대 등 상이 스킴은 이번 배치 보류.
   ※ 영어/한국사 '등급별 감점' 표 수치는 PDF에 미상세 → 지어내지 않고 ratio 0 + 비고 처리(정직성). */
const KOREA_RR_NATURAL = {
  korean: { ratio: 200, scoreType: "standard" as const },
  math: { ratio: 240, scoreType: "standard" as const },
  investigation: { ratio: 200, scoreType: "converted_standard" as const },
  english: { ratio: 0 }, // 등급별 감점(별도) — 등급표 미상세, 지어내지 않음
  history: { ratio: 0 }, // 등급별 감점(별도)
  bonusByCourse: { science_two_subjects_converted_pct: 3 },
};
const KOREA_RR_HUM = {
  korean: { ratio: 200, scoreType: "standard" as const },
  math: { ratio: 200, scoreType: "standard" as const },
  investigation: { ratio: 160, scoreType: "converted_standard" as const },
  english: { ratio: 0 },
  history: { ratio: 0 },
};
const KOREA_NOTE_N =
  "2027 전형시행계획(예정) · 가군 정시 일반전형 · 자연계열 국200:수240:탐200(표준점수) · " +
  "영어·한국사 등급별 감점(별도, 등급표는 정시모집요강 12월 확정) · 과학탐구 변환점수 3% 가산 · 변환표준점수 등 세부 12월 확정";
const KOREA_NOTE_H =
  "2027 전형시행계획(예정) · 가군 정시 일반전형 · 인문계열 국200:수200:탐160(표준점수) · " +
  "영어·한국사 등급별 감점(별도, 등급표는 정시모집요강 12월 확정) · 변환표준점수 등 세부 12월 확정";

// [DB dept_id, 정시 일반전형 모집인원, 계열 H=인문/N=자연] — 총괄표 직독, 이름 DB 정확 매칭
const KOREA_DEPTS: Array<[string, number, "H" | "N"]> = [
  ["u02010100035-ba-d", 46, "H"], // 경영대학 → 경영학과
  ["u01010200008-ba-d", 8, "H"],  // 국어국문학과
  ["u01020700029-ba-d", 6, "H"],  // 철학과
  ["u01020400022-ba-d", 3, "H"],  // 한국사학과
  ["u01020400006-ba-d", 6, "H"],  // 사학과
  ["u02030400005-ba-d", 11, "H"], // 사회학과
  ["u01010400019-ba-d", 3, "H"],  // 한문학과
  ["u01010600018-ba-d", 14, "H"], // 영어영문학과
  ["u01010700003-ba-d", 5, "H"],  // 독어독문학과
  ["u01011000004-ba-d", 5, "H"],  // 불어불문학과
  ["u01010400016-ba-d", 7, "H"],  // 중어중문학과
  ["u01010800003-ba-d", 5, "H"],  // 노어노문학과
  ["u01010300010-ba-d", 6, "H"],  // 일어일문학과
  ["u01010900004-ba-d", 7, "H"],  // 서어서문학과
  ["u01010100006-ba-d", 4, "H"],  // 언어학과
  ["u05020400078-ba-d", 8, "H"],  // 식품자원경제학과
  ["u02030600012-ba-d", 11, "H"], // 정치외교학과
  ["u02010200014-ba-d", 18, "H"], // 경제학과
  ["u05040200022-ba-d", 10, "H"], // 통계학과(정경대 인문계열)
  ["u02030700081-ba-d", 10, "H"], // 행정학과
  ["u05020100017-ba-d", 14, "N"], // 생명과학부
  ["u05020100011-ba-d", 15, "N"], // 생명공학부
  ["u05030200017-ba-d", 6, "N"],  // 식품공학과
  ["u05020600069-ba-d", 10, "N"], // 환경생태공학부
  ["u05040100016-ba-d", 7, "N"],  // 수학과
  ["u05040300016-ba-d", 7, "N"],  // 물리학과
  ["u05020500010-ba-d", 6, "N"],  // 화학과
  ["u05020600018-ba-d", 5, "N"],  // 지구환경과학과
];

function koreaTrack(quota: number, gye: "H" | "N"): AdmissionTrack {
  return {
    kind: "jeongsi_ga",
    name: "수능전형(일반전형)",
    specialType: "general",
    quotaInitial: quota,
    stages: [{ step: 1, components: { csat: 100 } }],
    reflectionRatio: gye === "N" ? KOREA_RR_NATURAL : KOREA_RR_HUM,
    conversionTable: { status: "not_applicable" },
    planStatus: "preliminary",
    planSource: {
      kind: "admission_plan",
      publishedYear: PLAN_PUBLISHED_YEAR,
      sourceUrl: "고려대학교 2027학년도 대학입학전형 시행계획 (2025.04, 입학처 공개 PDF)",
    },
    notes: gye === "N" ? KOREA_NOTE_N : KOREA_NOTE_H,
  };
}

const PILOT: JeongsiSeedRow[] = [
  { universityId: "pusan", departmentId: "u04040100012-ba-d", jeongsi: [PUSAN_MECH_JEONGSI] },
  ...KOREA_DEPTS.map(([id, quota, gye]) => ({
    universityId: "korea",
    departmentId: id,
    jeongsi: [koreaTrack(quota, gye)],
  })),
];

const JEONGSI_KINDS: AdmissionTrackKind[] = ["jeongsi_ga", "jeongsi_na", "jeongsi_da"];

interface DbRow { tracks: Record<string, AdmissionTrack[]> | null; available_track_kinds: string[] | null; source: object | null }

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`[load-jeongsi-plan] ${commit ? "COMMIT" : "DRY-RUN"} · ${PILOT.length} dept(s)\n`);

  for (const row of PILOT) {
    const id = `${row.universityId}_${row.departmentId}_${YEAR}`;
    const existingRows = await sql<DbRow>(
      `select tracks, available_track_kinds, source from public.department_admissions where id=${escStr(id)};`,
    );
    const existing = existingRows[0] ?? null;

    const prevTracks: Record<string, AdmissionTrack[]> = existing?.tracks ?? {};
    const prevKinds = Object.keys(prevTracks);
    const prevNonJeongsi = prevKinds.filter((k) => !JEONGSI_KINDS.includes(k as AdmissionTrackKind));

    // ── MERGE: jeongsi_* 만 치환, 그 외(수시) 보존 ──
    const merged: Record<string, AdmissionTrack[]> = { ...prevTracks };
    for (const t of row.jeongsi) merged[t.kind] = [t];
    const availableKinds = Object.keys(merged);

    // ── 자기검증: 적재 전 수시 kind 가 merge 결과에 전부 남아있어야 함 ──
    const lost = prevNonJeongsi.filter((k) => !(k in merged));
    if (lost.length > 0) throw new Error(`[ABORT] ${id} 수시 트랙 유실: ${lost.join(",")}`);

    console.log(`▶ ${id}  (${existing ? "MERGE 기존행" : "INSERT 신규행"})`);
    console.log(`   before kinds: [${prevKinds.join(", ") || "—"}]`);
    console.log(`   after  kinds: [${availableKinds.join(", ")}]  (수시 보존: ${prevNonJeongsi.join(",") || "없음"})`);

    if (!commit) continue;

    // 기존 행이면 row.source 보존(수시 출처) — 예정안 출처는 track.planSource 가 담당.
    const source =
      existing?.source ??
      { type: "admission_plan", parsedAt: new Date().toISOString(), parserVersion: "jeongsi-plan-v1" };

    await sql(
      `insert into public.department_admissions (id,university_id,department_id,year,tracks,available_track_kinds,source,updated_at)
       values (${escStr(id)},${escStr(row.universityId)},${escStr(row.departmentId)},${YEAR},${esc(merged)},${escArr(availableKinds)},${esc(source)},now())
       on conflict (id) do update set tracks=excluded.tracks, available_track_kinds=excluded.available_track_kinds, source=excluded.source, updated_at=now();`,
    );

    // ── 적재 후 재확인: DB 에서 다시 읽어 수시 보존 검증 ──
    const afterRows = await sql<DbRow>(
      `select available_track_kinds, tracks from public.department_admissions where id=${escStr(id)};`,
    );
    const afterKinds: string[] = afterRows[0]?.available_track_kinds ?? [];
    const stillLost = prevNonJeongsi.filter((k) => !afterKinds.includes(k));
    if (stillLost.length > 0) throw new Error(`[POST-VERIFY FAIL] ${id} 수시 유실: ${stillLost.join(",")}`);
    console.log(`   ✓ 적재 완료 · DB 재확인 kinds: [${afterKinds.join(", ")}]\n`);
  }
  console.log(`[done] ${commit ? "적재 완료" : "DRY-RUN 종료 (--commit 로 실제 적재)"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
