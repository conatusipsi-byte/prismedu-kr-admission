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
    .replace(/[★◇◉*※☆▲△・·•∙\s]/g, "")
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
};

/** univId 별 별칭 적용 — 없으면 원본 반환. */
export function resolveDeptName(univId: string, extracted: string): string {
  return NAME_ALIAS[univId]?.[extracted] ?? extracted;
}
