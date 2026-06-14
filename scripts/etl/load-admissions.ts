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
import { buildMatcher, resolveDeptName, type DeptRow } from "@/scripts/etl/dept-matcher";
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
  // ── Phase 2 batch 2 (2026-06-03) — 텍스트 추출, Zod·행합·열합·표본 원문대조 통과. ──
  //    아주대(aju)는 업로드 PDF가 모집요강이 아닌 '입학전형 안내 브로셔'라 모집인원 그리드 부재 → 제외(2027 수시 요강 재수급 대기).
  //    중앙대(cau)는 정원외/기회균형 특별전형 열합 미일치(checksumPassed=false)로 무결성 게이트가 거부 → 특별전형 귀속 재정합 후 재적재.
  { file: `${B}/uos-text.json`,     univId: "kcue_0000040", type: "text_extract", pdf: "univ/2027학년도 수시모집 신입생 모집요강.pdf" },
  { file: `${B}/ewha-text.json`,    univId: "kcue_0000163", type: "text_extract", pdf: "univ/20260602125244F7AFE4.pdf" },
  { file: `${B}/inha-text.json`,    univId: "kcue_0000169", type: "text_extract", pdf: "univ/2027학년도 인하대학교 수시모집요강_20260529.pdf" },
  { file: `${B}/konkuk-text.json`,  univId: "kcue_0000052", type: "text_extract", pdf: "univ/2027학년도 건국대학교 수시모집요강(단면)_260528.pdf" },
  { file: `${B}/dongguk-text.json`, univId: "kcue_0000100", type: "text_extract", pdf: "univ/20260601115911UVEHWG.pdf" },
  { file: `${B}/hongik-text.json`,  univId: "kcue_0000212", type: "text_extract", pdf: "univ/2027학년도_홍익대학교_수시모집요강_웹용_0529.pdf" },
  { file: `${B}/gachon-text.json`,  univId: "kcue_0000063", type: "text_extract", pdf: "univ/20260522154511HBZYTW.pdf" },
  { file: `${B}/cau-text.json`,     univId: "kcue_0000175", type: "text_extract", pdf: "univ/2027학년도 중앙대학교 수시모집요강_20260529_VF.pdf" },
  // ── Phase 2 batch 3 (2026-06-03) — 신규 9개 거점국립대. pdftotext + 본체 직접 구조화($0). 행합·열합·grand total 원문대조·central-verify 통과. ──
  //    서울과기대(seoultech)는 PDF 파일명 "(안)" = 초안. meta.draft=true 기록, 확정본 교체 시 재적재.
  { file: `${B}/pukyong-text.json`,   univId: "kcue_0000013", type: "text_extract", pdf: "univ/2027학년도 수시 신입생 모집요강(배포용)최종.pdf" },
  { file: `${B}/jeju-text.json`,      univId: "kcue_0000027", type: "text_extract", pdf: "univ/705605111b3afcc6c8075dbd0480d3a7.pdf" },
  { file: `${B}/kongju-text.json`,    univId: "kcue_0000008", type: "text_extract", pdf: "univ/2027학년도 수시 신입생 모집요강_26.05.29..pdf" },
  { file: `${B}/hanbat-text.json`,    univId: "kcue_0000039", type: "text_extract", pdf: "univ/2027학년도 신입생 수시모집요강.pdf" },
  { file: `${B}/chonnam-text.json`,   univId: "kcue_0000023", type: "text_extract", pdf: "univ/2027-susi-0529.pdf" },
  { file: `${B}/chungbuk-text.json`,  univId: "kcue_0000030", type: "text_extract", pdf: "univ/2027학년도+대학입학전형+수시+신입생+모집요강.pdf" },
  { file: `${B}/jeonbuk-text.json`,   univId: "kcue_0000025", type: "text_extract", pdf: "univ/전북대학교 2027학년도 대입전형 수시 모집요강_최초공지.pdf" },
  { file: `${B}/seoultech-text.json`, univId: "kcue_0000036", type: "text_extract", pdf: "univ/서울과학기술대학교 2027학년도 수시 신입생 모집요강(안).pdf" },
  { file: `${B}/gnu-text.json`,       univId: "kcue_0000007", type: "text_extract", pdf: "univ/(경상국립대)2027학년도 신입생 수시 모집요강(배포용).pdf" },
  // ── Phase 2 batch 4 (2026-06-14) — 인서울/수도권 5교(100교 목표). 입학처 직링크 PDF → pdftotext + 본체 구조화($0). 행합/열합 이중 체크섬·central-verify·grand total 원문대조 통과. ──
  { file: `${B}/sejong-text.json`,    univId: "kcue_0000138", type: "text_extract", pdf: "univ/susi-2027/kcue_0000138.pdf" },
  { file: `${B}/sookmyung-text.json`, univId: "kcue_0000141", type: "text_extract", pdf: "univ/susi-2027/kcue_0000141.pdf" },
  { file: `${B}/myongji-text.json`,   univId: "kcue_0000109", type: "text_extract", pdf: "univ/susi-2027/kcue_0000109.pdf" },
  { file: `${B}/dankook-text.json`,   univId: "kcue_0000082", type: "text_extract", pdf: "univ/susi-2027/kcue_0000082.pdf" },
  { file: `${B}/soongsil-text.json`,  univId: "kcue_0000143", type: "text_extract", pdf: "univ/susi-2027/kcue_0000143.pdf" },
  // ── Phase 2 batch 5 (2026-06-14) — 인서울/수도권+거점국립 5교(100교 목표). 입학처 직링크. 이중 체크섬·central-verify 통과. ──
  { file: `${B}/hallym-text.json`,    univId: "kcue_0000198", type: "text_extract", pdf: "univ/susi-2027/kcue_0000198.pdf" },
  { file: `${B}/kyungnam-text.json`,  univId: "kcue_0000059", type: "text_extract", pdf: "univ/susi-2027/kcue_0000059.pdf" },
  { file: `${B}/donga-text.json`,     univId: "kcue_0000105", type: "text_extract", pdf: "univ/susi-2027/kcue_0000105.pdf" },
  { file: `${B}/hannam-text.json`,    univId: "kcue_0000195", type: "text_extract", pdf: "univ/susi-2027/kcue_0000195.pdf" },
  { file: `${B}/cnu-text.json`,       univId: "kcue_0000029", type: "text_extract", pdf: "univ/susi-2027/kcue_0000029.pdf" },
];

/* ── 학과명 ALIAS — scripts/etl/dept-matcher 의 NAME_ALIAS/resolveDeptName 참조 ── */

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

/* ── 학과명 정규화 + 매칭 — 순수 모듈로 분리(테스트 가능, P2 3-1) ─────────────
 *   norm·buildMatcher·DeptRow·MatchResult 는 scripts/etl/dept-matcher 참조. */

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

  // ── 증분 적재 안전장치 (--only=<univId,...>) ──
  // ⚠ 전체 실행(--execute, --only 없음)은 tracks 컬럼을 통째 UPSERT 하므로,
  //    load-jeongsi-plan.ts 로 병합해 둔 정시 예정안(jeongsi_*)을 덮어쓴다.
  //    기존 대학을 재적재할 땐 반드시 정시 보존을 확인하고, 신규 대학만 넣을 땐 --only 로 한정할 것.
  const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",").filter(Boolean);
  const ACTIVE = ONLY && ONLY.length ? SOURCES.filter((s) => ONLY.includes(s.univId)) : SOURCES;
  if (ONLY && ONLY.length) console.log(`[--only] ${ACTIVE.length}개 대학만 처리: ${ONLY.join(", ")}\n`);

  for (const src of ACTIVE) {
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
      const m = match(resolveDeptName(src.univId, dep.departmentName));
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
