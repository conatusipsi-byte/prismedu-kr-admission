#!/usr/bin/env node
/**
 * 7개 대학 추출 JSON(PdfAnalysisResult) → conatus department_admissions UPSERT (2026-06-01).
 *
 *   npx tsx scripts/etl/load-admissions.ts            # dry-run (변환+매핑 리포트, DB 미변경)
 *   npx tsx scripts/etl/load-admissions.ts --execute  # 멱등 UPSERT 실행
 *
 * 입력:
 *   - 텍스트 추출(text_extract): korea/catholic/kyunghee/yonsei/ulsan/sungkyunkwan-text.json
 *   - Vision(ai_vision): snu-merged.json
 *
 * 흐름:
 *   1. 각 대학 추출 result(PdfAnalysisResult) 로드
 *   2. DB departments(university별) fetch → 추출 학과명 ↔ department_id 매칭 (정규화·폐과포함)
 *   3. track 변환: reflectionStages(한글키)→AdmissionStage(영문키, 미매핑키 보존),
 *      csatMinimumRawText→finalizeMinReq 구조화, mapAdigaToTrackKind→kind/available_track_kinds
 *   4. department_admissions row (id={univ}_{deptId}_{year}) 멱등 UPSERT (Management API SQL)
 *   5. 매핑 실패·미변환 리포트
 *
 * 정직성:
 *   - 매핑 실패 학과는 SKIP + 리포트 (FK 제약상 적재 불가). 추정 매칭 금지.
 *   - csat 복잡/모호는 finalizeMinReq 가 autoEvaluable=false 로 분류 (originalText 보존).
 *   - source.type 으로 text_extract vs ai_vision 추적.
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { finalizeMinReq } from "@/lib/admission/min-req-classifier";
import { classifyQuotaScope } from "@/lib/admission/quota-scope";
import { mapAdigaToTrackKind } from "@/scripts/etl/adiga/track-kind";
import { checkExtractionIntegrity } from "@/scripts/etl/extraction-integrity";
import type {
  AdmissionTrack,
  AdmissionTrackKind,
  AdmissionStage,
  CsatArea,
  CsatMinimum,
} from "@/types/admission";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });

const YEAR = 2027;
const EXECUTE = process.argv.includes("--execute");
// 무결성 게이트(P1-3): 체크섬/학년도 실패 source 는 적재 거부. --allow-checksum-fail 로 강제.
const ALLOW_CHECKSUM_FAIL = process.argv.includes("--allow-checksum-fail");
const B = "scripts/etl/text-extract-test";

/* ── 대학 매핑 (universityName → DB university_id, source) ──────────────── */
interface Source { file: string; univId: string; type: "text_extract" | "ai_vision"; pdf: string; }
const SOURCES: Source[] = [
  { file: `${B}/korea-text.json`,        univId: "korea",        type: "text_extract", pdf: "univ/1780023076409_0.pdf" },
  { file: `${B}/catholic-text.json`,     univId: "kcue_0000046", type: "text_extract", pdf: "univ/2027학년도 가톨릭대학교_수시모집요강_0529(최종).pdf" },
  { file: `${B}/kyunghee-text.json`,     univId: "kcue_0000066", type: "text_extract", pdf: "univ/2027학년도 경희대학교 수시 모집요강-최종.pdf" },
  { file: `${B}/yonsei-text.json`,       univId: "yonsei",       type: "text_extract", pdf: "univ/20260529204109T8NZNJ.pdf" },
  { file: `${B}/ulsan-text.json`,        univId: "kcue_0000158", type: "text_extract", pdf: "univ/2027학년도+수시+모집요강 0526.pdf" },
  { file: `${B}/sungkyunkwan-text.json`, univId: "sungkyunkwan", type: "text_extract", pdf: "univ/20260529115520H43SMR.pdf" },
  { file: `${B}/snu-text.json`, univId: "snu", type: "text_extract", pdf: "univ/SNU_2027_susi.pdf" }, // 텍스트추출로 대체(구 vision-snu-v1 14학과 → 87 모집단위)
  // ── Phase 2 batch 1 (2026-06-01) — 텍스트 추출, 학년도 독립검증 통과(2027). ──
  //    충남대(cnu)는 PDF가 2026학년도 내용(파일명만 2027)이라 제외 — 2027 요강 재수급 대기.
  { file: `${B}/hanyang-text.json`,           univId: "hanyang",      type: "text_extract", pdf: "univ/hanyang_2027_susi.pdf" },
  { file: `${B}/knu-text.json`,               univId: "kcue_0000005", type: "text_extract", pdf: "univ/knu_2027_susi.pdf" },
  { file: `${B}/pusan-text.json`,             univId: "pusan",        type: "text_extract", pdf: "univ/pusan_2027_susi.pdf" },
  { file: `${B}/kangwon_chuncheon-text.json`, univId: "kcue_0000003", type: "text_extract", pdf: "univ/2027학년도 강원대학교 춘천·삼척（도계포함）캠퍼스 수시모집요강_공개용.pdf" },
];

/* ── 학과명 ALIAS (추출명 → 기존 DB 정규명) — 개명·학부전공형 부착, DB 무변경 ──
 *   reconciliation(2026-06-01): 매핑실패 중 "이미 DB에 변형명으로 존재"하는 단위를
 *   기존 active 학과에 부착해 중복 신설 방지. 진짜 부재 학과는 departments 에 신규 추가됨. */
const NAME_ALIAS: Record<string, Record<string, string>> = {
  kcue_0000005: { "산림과학ㆍ조경학부": "산림과학.조경학부(임학전공,임산공학전공,조경학전공)", "자동차공학과": "자동차공학부" },
  pusan: {
    "산업공학부": "산업공학과", "데이터사이언스학부": "데이터사이언스전공",
    "반도체공학전공": "전기전자공학부 반도체공학전공", "전기공학전공": "전기전자공학부 전기공학전공",
    "전자공학전공": "전기전자공학부 전자공학전공", "컴퓨터공학전공": "정보컴퓨터공학부 컴퓨터공학전공",
    "인공지능전공": "정보컴퓨터공학부 인공지능전공",
  },
  kcue_0000003: { "의생명시스템과학과": "의생명시스템과학전공", "경제금융학과": "경제금융전공" },
  snu: { "건설환경도시공학부": "건설환경공학부" },
};

/* ── Management API ─────────────────────────────────────────────────────── */
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const REF = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
async function sql<T = any>(query: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

/* ── 학과명 정규화 + 매칭 ───────────────────────────────────────────────── */
function norm(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[★◇◉*※☆▲△・·•∙\s]/g, "")
    .replace(/[()（）]/g, "")
    .replace(/Ⅰ/g, "I").replace(/Ⅱ/g, "II").replace(/Ⅲ/g, "III")
    .toLowerCase();
}

interface DeptRow { id: string; name: string; active: boolean }
interface MatchResult { id: string | null; matchedName?: string; how?: string }

function buildMatcher(deps: DeptRow[]) {
  // 동일 정규화명 충돌 시 active=true 우선
  const byNorm = new Map<string, DeptRow>();
  for (const d of deps) {
    const k = norm(d.name);
    const prev = byNorm.get(k);
    if (!prev || (!prev.active && d.active)) byNorm.set(k, d);
  }
  return (extracted: string): MatchResult => {
    const nk = norm(extracted);
    // 1. 정확 일치
    const exact = byNorm.get(nk);
    if (exact) return { id: exact.id, matchedName: exact.name, how: "exact" };
    // 2. 접두(prefix) 일치만 허용 — 중간 부분문자열 오탐 방지 (예: 화학과 ⊄ 연극영화학과).
    //    정당 케이스는 전부 접두: 지리학과(인문)⊃지리학과 / 의예과⊂의예과(자연계열).
    //    active 우선, 그다음 길이차 작은 순(가장 근접).
    const cands = deps
      .filter((d) => { const dn = norm(d.name); return dn.startsWith(nk) || nk.startsWith(dn); })
      .sort((a, b) => (Number(b.active) - Number(a.active)) || (Math.abs(norm(a.name).length - nk.length) - Math.abs(norm(b.name).length - nk.length)));
    if (cands.length) return { id: cands[0].id, matchedName: cands[0].name, how: "contain" };
    return { id: null };
  };
}

/* ── component 매핑 (한글→영문, 미매핑 보존) ────────────────────────────── */
const COMP: Record<string, keyof AdmissionStage["components"] | string> = {
  "학생부(교과)": "schoolRecord", "학생부교과": "schoolRecord", "교과": "schoolRecord", "학생부": "schoolRecord",
  "학생부(비교과)": "schoolActivity", "비교과": "schoolActivity",
  "서류": "document", "서류평가": "document", "서류종합": "document", "서류종합평가": "document", "교과종합평가": "document",
  "면접": "interview", "구술": "interview", "구술면접": "interview", "심층면접": "interview", "제시문면접": "interview",
  "논술": "essay", "논술고사": "essay",
  "실기": "practical", "실적": "practical", "경기실적": "practical", "실기/실적": "practical", "경기/수상실적": "practical", "실기고사": "practical",
  "수능": "csat",
};
function mapComponents(kr: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(kr)) {
    const ek = COMP[k.trim()] ?? k.trim(); // 미매핑은 한글 그대로 보존 (UI: COMPONENT_LABEL[key] ?? key)
    out[ek] = (out[ek] ?? 0) + v;
  }
  return out;
}

function stepFromLabel(label: string, idx: number): 1 | 2 | 3 {
  const m = label.match(/([123])\s*단계/);
  if (m) return Number(m[1]) as 1 | 2 | 3;
  return (Math.min(idx + 1, 3)) as 1 | 2 | 3;
}

/* ── csat 파싱 (raw → CsatMinimum | undefined) ──────────────────────────── */
const AREA_ALL: CsatArea[] = ["korean", "math", "english", "investigation"];
function parseCsat(raw: string | null, exempt: boolean | null): CsatMinimum | undefined {
  if (exempt === true) return undefined;
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t || /^(없음|미적용|해당없음|-|N\/A)/i.test(t) || /수능\s*최저\s*(학력기준)?\s*(미적용|없음|적용\s*안)/.test(t)) return undefined;

  // requiredCount: "중 N개 영역" 우선, 없으면 "N개 영역"
  const rc = t.match(/중\s*(\d+)\s*개\s*영역/) ?? t.match(/(\d+)\s*개\s*영역/);
  // sumGradeMax: "합(이)? X (이내|등급)"
  const sg = t.match(/합(?:이)?\s*(\d+)\s*(?:이내|등급)?/);
  const hist = t.match(/한국사\s*(\d+)/);
  const requiredCount = rc ? Number(rc[1]) : undefined;
  const sumGradeMax = sg ? Number(sg[1]) : undefined;

  // candidateAreas: 명시 영역 부분집합 추정 (없으면 4영역 전체)
  let cand: CsatArea[] = [...AREA_ALL];
  const mentioned: CsatArea[] = [];
  if (/국어/.test(t)) mentioned.push("korean");
  if (/수학/.test(t)) mentioned.push("math");
  if (/영어/.test(t)) mentioned.push("english");
  if (/탐구/.test(t)) mentioned.push("investigation");
  if (mentioned.length >= 2 && mentioned.length <= 4) cand = mentioned;

  let investigationRule: CsatMinimum["investigationRule"];
  if (/2\s*과목\s*평균|두\s*과목\s*평균/.test(t)) investigationRule = "two_avg";
  else if (/2\s*과목\s*(모두|각)|각\s*과목/.test(t)) investigationRule = "two_each";
  else if (/탐구/.test(t)) investigationRule = "one";

  const partial: Omit<CsatMinimum, "complexity" | "autoEvaluable"> = {
    candidateAreas: cand,
    requiredCount: requiredCount ?? cand.length,
    sumGradeMax: sumGradeMax ?? 0,
    ...(hist ? { historyGradeMax: Number(hist[1]) } : {}),
    ...(investigationRule ? { investigationRule } : {}),
    originalText: t,
  };
  // 합/개수 파싱 실패 → custom 강제 (autoEvaluable=false, originalText 보존)
  if (sumGradeMax == null || requiredCount == null) {
    return { ...partial, sumGradeMax: sumGradeMax ?? 0, complexity: "custom", autoEvaluable: false };
  }
  return finalizeMinReq(partial); // classifier: 포함/또는/계열별 등은 자동 non-auto
}

/* ── track 변환 ─────────────────────────────────────────────────────────── */
interface RawTrack {
  trackName: string; trackTypeRaw: string; recruitmentPeriodRaw: string;
  specialTypeKeyword: string | null; quotaInitial: number | null;
  applicationQualification: string | null;
  reflectionStages: Array<{ stageLabel: string; multiplier: number | null; components: Record<string, number>; stageMaxScore?: number | null }> | null;
  csatMinimumRawText: string | null; csatMinimumExempt: boolean | null;
  csatRequiredAreasRawText: string | null; prevYearResult: unknown; sourcePages: number[];
}

function convertTrack(rt: RawTrack): { kind: AdmissionTrackKind; track: AdmissionTrack } | { skip: string } {
  const mapped = mapAdigaToTrackKind({ trackType: rt.trackTypeRaw, period: rt.recruitmentPeriodRaw, trackName: rt.trackName });
  if (!mapped.ok) return { skip: `trackKind 매핑 실패: ${rt.trackName} (${rt.trackTypeRaw}/${rt.recruitmentPeriodRaw})` };

  const stages: AdmissionStage[] = (rt.reflectionStages ?? []).map((s, i) => {
    const stage: AdmissionStage = { step: stepFromLabel(s.stageLabel, i), components: mapComponents(s.components) as AdmissionStage["components"] };
    if (s.multiplier != null) stage.multiplier = s.multiplier;
    return stage;
  });

  const csat = parseCsat(rt.csatMinimumRawText, rt.csatMinimumExempt);
  const noteParts: string[] = [];
  if (rt.applicationQualification) noteParts.push(rt.applicationQualification);
  if (rt.csatRequiredAreasRawText) noteParts.push(`수능응시영역: ${rt.csatRequiredAreasRawText}`);

  const track: AdmissionTrack = {
    name: rt.trackName,
    kind: mapped.kind,
    specialType: mapped.specialType,
    quotaInitial: rt.quotaInitial ?? 0,
    stages,
    ...(csat ? { csatMinimum: csat } : {}),
    ...(noteParts.length ? { notes: noteParts.join(" | ") } : {}),
  };
  // P-005 — 정원외/그룹 단위 전형 명시 백필 (학과별 합격률 비대상). department 는 미설정(lean).
  const scope = classifyQuotaScope(track);
  if (scope !== "department") track.quotaScope = scope;
  return { kind: mapped.kind, track };
}

/* ── 메인 ───────────────────────────────────────────────────────────────── */
interface OutRow { id: string; university_id: string; department_id: string; year: number; tracks: Record<string, AdmissionTrack[]>; available_track_kinds: string[]; source: object }

async function main() {
  console.log(`== load-admissions ${EXECUTE ? "[EXECUTE]" : "[DRY-RUN]"} year=${YEAR} ==\n`);
  const rowMap = new Map<string, OutRow>(); // id별 병합 (여러 sub-track 학과 → 동일 부모 학과)
  const merges: string[] = [];
  const unmatched: Array<{ univ: string; dept: string; tracks: number }> = [];
  const containMatches: string[] = [];
  const skips: string[] = [];
  const integrityRejected: string[] = [];
  const perUniv: Array<{ univ: string; univId: string; depts: number; matched: number; rows: number; tracks: number; kinds: Set<string> }> = [];

  for (const src of SOURCES) {
    if (!fs.existsSync(src.file)) { console.log(`⚠ ${src.file} 없음 — skip`); continue; }
    const data = JSON.parse(fs.readFileSync(src.file, "utf8"));
    const result = data.result ?? data;
    const univName: string = result.universityName ?? data.meta?.universityName ?? src.univId;
    const deps: Array<{ departmentName: string; tracks: RawTrack[] }> = result.departments;

    // ── 무결성 게이트 (P1-3): 체크섬/학년도 실패분 적재 차단 ──
    const integrity = checkExtractionIntegrity(data.meta, result, YEAR);
    integrity.warnings.forEach((w) => console.log(`  ⚠ ${univName}: ${w}`));
    if (!integrity.ok) {
      const msg = `${univName}: ${integrity.reasons.join("; ")}`;
      if (ALLOW_CHECKSUM_FAIL) {
        console.log(`  ⚠ [무결성 실패 강제적재] ${msg}`);
      } else {
        console.log(`  ❌ [적재 거부 — 무결성] ${msg}`);
        integrityRejected.push(msg);
        continue;
      }
    }

    const dbDeps = await sql<DeptRow[]>(
      `select id, name, active from public.departments where university_id='${src.univId}'`,
    );
    const match = buildMatcher(dbDeps);

    const stat = { univ: univName, univId: src.univId, depts: deps.length, matched: 0, rows: 0, tracks: 0, kinds: new Set<string>() };
    for (const dep of deps) {
      const m = match(NAME_ALIAS[src.univId]?.[dep.departmentName] ?? dep.departmentName);
      if (!m.id) { unmatched.push({ univ: univName, dept: dep.departmentName, tracks: dep.tracks.length }); continue; }
      if (m.how === "contain") containMatches.push(`${univName}: "${dep.departmentName}" → "${m.matchedName}"`);
      stat.matched++;
      const tracksByKind: Record<string, AdmissionTrack[]> = {};
      let tcount = 0;
      for (const rt of dep.tracks) {
        const c = convertTrack(rt);
        if ("skip" in c) { skips.push(`${univName}/${dep.departmentName}: ${c.skip}`); continue; }
        (tracksByKind[c.kind] ??= []).push(c.track);
        stat.kinds.add(c.kind); tcount++;
      }
      if (tcount === 0) continue;
      const id = `${src.univId}_${m.id}_${YEAR}`;
      const existing = rowMap.get(id);
      if (existing) {
        // 동일 부모 학과에 여러 추출 모집단위(인문/자연·세부전공) → 트랙 병합
        for (const [k, arr] of Object.entries(tracksByKind)) (existing.tracks[k] ??= []).push(...arr);
        existing.available_track_kinds = Array.from(new Set([...existing.available_track_kinds, ...Object.keys(tracksByKind)]));
        merges.push(`${univName}: "${dep.departmentName}" → ${m.matchedName} (병합)`);
      } else {
        rowMap.set(id, {
          id, university_id: src.univId, department_id: m.id, year: YEAR,
          tracks: tracksByKind, available_track_kinds: Object.keys(tracksByKind),
          source: { type: src.type, pdf: src.pdf, extractedAt: "2026-06-01", parserVersion: src.type === "ai_vision" ? "vision-snu-v1" : "text-extract-v1" },
        });
      }
      stat.rows++; stat.tracks += tcount;
    }
    perUniv.push(stat);
  }

  const rows = Array.from(rowMap.values());
  // 리포트
  console.log("대학별 변환:");
  for (const s of perUniv)
    console.log(`  ${s.univ.padEnd(8)} (${s.univId.padEnd(13)}) 추출학과=${String(s.depts).padStart(3)} 매칭=${String(s.matched).padStart(3)} row=${String(s.rows).padStart(3)} track=${String(s.tracks).padStart(4)} kinds=${[...s.kinds].sort().join(",")}`);
  const totalRows = rows.length, totalTracks = rows.reduce((a, r) => a + Object.values(r.tracks).flat().length, 0);
  console.log(`\n총 row(병합후)=${totalRows}  track=${totalTracks}  매핑실패학과=${unmatched.length}  병합=${merges.length}  trackKind매핑skip=${skips.length}  무결성거부source=${integrityRejected.length}`);
  if (integrityRejected.length) {
    console.log(`\n── 무결성 거부 source (${integrityRejected.length}) — 적재 제외 (--allow-checksum-fail 로 강제) ──`);
    integrityRejected.forEach((m) => console.log(`  ❌ ${m}`));
  }
  const kindDist: Record<string, number> = {};
  for (const r of rows) for (const k of r.available_track_kinds) kindDist[k] = (kindDist[k] ?? 0) + 1;
  console.log("available_track_kinds 분포(학과수):", JSON.stringify(kindDist));

  if (unmatched.length) {
    console.log(`\n── 매핑 실패 학과 (${unmatched.length}) — SKIP (FK 제약, 적재 안 함) ──`);
    const byU: Record<string, string[]> = {};
    for (const u of unmatched) (byU[u.univ] ??= []).push(`${u.dept}(${u.tracks})`);
    for (const [u, ds] of Object.entries(byU)) console.log(`  ${u}: ${ds.join(", ")}`);
  }
  if (skips.length) { console.log(`\n── trackKind 매핑 skip (${skips.length}) ──`); skips.slice(0, 20).forEach((s) => console.log(`  ${s}`)); }
  console.log(`\n── containment 매칭 (${containMatches.length}) — 오탐 점검 대상 ──`);
  containMatches.forEach((s) => console.log(`  ${s}`));

  fs.writeFileSync(`${B}/conatus-rows.json`, JSON.stringify(rows, null, 2));
  console.log(`\n💾 ${B}/conatus-rows.json (${rows.length} rows)`);

  if (!EXECUTE) { console.log("\n[DRY-RUN] DB 미변경. --execute 로 UPSERT."); return; }

  // ── 멱등 UPSERT (배치) ──
  console.log("\n== UPSERT 실행 ==");
  const esc = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
  const escArr = (a: string[]) => `ARRAY[${a.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]::text[]`;
  const BATCH = 25;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((r) =>
      `('${r.id.replace(/'/g, "''")}','${r.university_id}','${r.department_id.replace(/'/g, "''")}',${r.year},${esc(r.tracks)},${escArr(r.available_track_kinds)},${esc(r.source)},now())`,
    ).join(",\n");
    const q = `insert into public.department_admissions (id,university_id,department_id,year,tracks,available_track_kinds,source,updated_at)
values\n${values}
on conflict (id) do update set tracks=excluded.tracks, available_track_kinds=excluded.available_track_kinds, source=excluded.source, updated_at=now();`;
    await sql(q);
    done += chunk.length;
    process.stdout.write(`\r  UPSERT ${done}/${rows.length}`);
  }
  console.log(`\n✅ UPSERT 완료: ${done} rows`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
