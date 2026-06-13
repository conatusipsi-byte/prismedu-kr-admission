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

const PILOT: JeongsiSeedRow[] = [
  { universityId: "pusan", departmentId: "u04040100012-ba-d", jeongsi: [PUSAN_MECH_JEONGSI] },
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
