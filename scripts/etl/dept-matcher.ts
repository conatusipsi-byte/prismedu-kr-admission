/**
 * 학과명 정규화·매칭 (순수 — load-admissions 에서 분리, 테스트 가능). P2 3-1.
 *
 * load-admissions 는 모듈 로드 시 main() 을 자동 실행하므로 테스트에서 import 불가.
 * 매칭 엔진(정규화·정확/접두 매칭)과 별칭(NAME_ALIAS) 을 여기로 분리해 단위 테스트한다.
 */

/** 학과명 정규화 — 장식기호·공백·괄호 제거, 로마자 통일, 소문자화. */
export function norm(s: string): string {
  return s
    .normalize("NFC")
    // 장식 가운뎃점 변종 흡수 — ㆍ(U+318D)·ᆢ(U+11A2)·‧(U+2027 HYPHENATION POINT)·∙(U+2219)·⋅(U+22C5)·･(U+FF65 HALFWIDTH KATAKANA MIDDLE DOT) 등
    .replace(/[★◇◉*※☆▲△・·•∙ㆍᆢ‧⋅･․．\s]/g, "")
    .replace(/[()（）]/g, "")
    .replace(/Ⅰ/g, "I").replace(/Ⅱ/g, "II").replace(/Ⅲ/g, "III")
    .toLowerCase();
}

export interface DeptRow { id: string; name: string; active: boolean }
export interface MatchResult { id: string | null; matchedName?: string; how?: string }

/**
 * DB 학과 목록 → 매처. 추출 학과명을 받아 (정확 → 접두포함) 순으로 매칭.
 * 동일 정규화명 충돌·접두 후보는 active 우선, 그다음 길이차 작은 순.
 * 중간 부분문자열 오탐은 배제(접두만 허용) — 예: 화학과 ⊄ 연극영화학과.
 */
export function buildMatcher(deps: DeptRow[]) {
  const byNorm = new Map<string, DeptRow>();
  for (const d of deps) {
    const k = norm(d.name);
    const prev = byNorm.get(k);
    if (!prev || (!prev.active && d.active)) byNorm.set(k, d);
  }
  return (extracted: string): MatchResult => {
    const nk = norm(extracted);
    const exact = byNorm.get(nk);
    if (exact) return { id: exact.id, matchedName: exact.name, how: "exact" };
    const cands = deps
      .filter((d) => { const dn = norm(d.name); return dn.startsWith(nk) || nk.startsWith(dn); })
      .sort((a, b) => (Number(b.active) - Number(a.active)) || (Math.abs(norm(a.name).length - nk.length) - Math.abs(norm(b.name).length - nk.length)));
    if (cands.length) return { id: cands[0].id, matchedName: cands[0].name, how: "contain" };
    return { id: null };
  };
}

/**
 * 학과명 별칭 — 추출명 → 기존 DB 정규명 (개명·학부전공형). DB 무변경 부착용.
 * reconciliation(2026-06-01): prefix 매칭이 못 잡는 변형명을 기존 active 학과에 연결.
 */
export const NAME_ALIAS: Record<string, Record<string, string>> = {
  kcue_0000005: { "산림과학ㆍ조경학부": "산림과학.조경학부(임학전공,임산공학전공,조경학전공)", "자동차공학과": "자동차공학부" },
  pusan: {
    "산업공학부": "산업공학과", "데이터사이언스학부": "데이터사이언스전공",
    "반도체공학전공": "전기전자공학부 반도체공학전공", "전기공학전공": "전기전자공학부 전기공학전공",
    "전자공학전공": "전기전자공학부 전자공학전공", "컴퓨터공학전공": "정보컴퓨터공학부 컴퓨터공학전공",
    "인공지능전공": "정보컴퓨터공학부 인공지능전공",
  },
  kcue_0000003: { "의생명시스템과학과": "의생명시스템과학전공", "경제금융학과": "경제금융전공" },
  snu: { "건설환경도시공학부": "건설환경공학부" },
  // ── Phase 2 batch 2 (2026-06-03) + 후속 — 변형명/개편 rename 매핑. ㆍ(U+318D)vs·문자차이는 norm()에서 흡수. ──
  //    아래는 '2027 모집요강 명칭 → 기존 DB active 학과'가 동일 프로그램으로 확인된 개편(rename)·학부(전공) 래핑만.
  //    DB에 동일 active 학과가 없는 신설/누락 실존학과는 추정매칭 금지 → 마이그레이션(add_batch2_followup_dept_gaps)으로 INSERT.
  kcue_0000163: { "간호학부": "간호학전공" }, // 이화
  kcue_0000169: { // 인하 — 경영학부 전공 + 화공에너지공학부(전공)→기존 active 학과 개편(추출에 화학과·일본언어문화학과 등 별도 존재 = 동일 프로그램 rename 확인)
    "경영학부(경영학과)": "경영학과", "경영학부(파이낸스경영학과)": "파이낸스경영학과",
    "화공에너지공학부(화학공학전공)": "화학공학과", "화공에너지공학부(이차전지공학전공)": "이차전지융합학과",
  },
  kcue_0000100: { // 동국 — 미술학부 전공 분해 (ㆍ문자차이는 norm() 흡수)
    "컴퓨터ㆍAI학부": "컴퓨터·AI학부",
    "미술학부(한국화전공)": "한국화전공", "미술학부(서양화전공)": "서양화전공", "미술학부(불교미술전공)": "불교미술전공",
    "미디어커뮤니케이션학전공": "사회언론정보학부 미디어커뮤니케이션학전공",
  },
  kcue_0000063: { // 가천 — 미술·디자인학부 전공 래핑 + 개편 rename(토목환경→건설환경, 스마트팩토리학과=기계공학부 전공)
    "회화전공": "미술·디자인학부(회화전공)", "조소전공": "미술·디자인학부(조소전공)",
    "시각디자인전공": "미술·디자인학부(시각디자인전공)", "산업디자인전공": "미술·디자인학부(산업디자인전공)",
    "건설환경공학과": "토목환경공학과", "스마트팩토리학과": "기계공학부(스마트팩토리전공)",
  },
  // ── Phase 2 batch 2 후속 (2026-06-03) — 개편 rename(동일 프로그램, 기존 DB active 학과 부착) ──
  kcue_0000052: { "화공·생명·에너지공학부": "화공학부" }, // 건국 — 화공학부 개편(생명·에너지 통합)
  kcue_0000175: { // 중앙 — 학부(전공) 개편 → 기존 active 학과
    "국어국문학부(국어국문학)": "국어국문학과", "광고홍보학부(광고홍보학)": "광고홍보학과",
  },
  kcue_0000212: { // 홍익 — 개편 rename
    "조선해양모빌리티공학과": "조선해양공학과", "바이오화학융합공학과": "바이오화학공학과",
  },
  // ── Phase 2 batch 3 (2026-06-03) — 9개 거점국립대. 학과↔학부 동일 base rename만 alias(stem 일치 검증). ──
  //    학부(전공) 래핑·prefix 확장(산업디자인학과↔디자인학과(산업디자인전공), AI컴퓨터공학부↔컴퓨터공학부 등)은
  //    오alias 위험 → 추정매칭 금지로 신규 INSERT 처리(near-dup 허용, 잘못된 부착 회피).
  kcue_0000013: { "위성정보융합공학과": "위성정보융합공학전공" }, // 부경
  kcue_0000027: { "생활환경복지학과": "생활환경복지학부" }, // 제주
  kcue_0000023: { "글로벌비즈니스학과": "글로벌비즈니스학부" }, // 전남
};

/** univId 별 별칭 적용 — 없으면 원본 반환. */
export function resolveDeptName(univId: string, extracted: string): string {
  return NAME_ALIAS[univId]?.[extracted] ?? extracted;
}
