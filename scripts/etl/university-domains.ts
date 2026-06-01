/**
 * 대학 공식 도메인 맵 + 로고 URL 헬퍼 — universities.logo_url 자동 수집용.
 *
 * 배경: universities.logo_url 100% NULL. UniversityBrand(DepartmentCard) 는 logoUrl
 *   있으면 <img>, 없으면 monogram 폴백이 이미 구현됨 (클라이언트 요청 #1, 2026-05-30).
 *   여기선 데이터만 채운다 — SKY·인서울·거점국립 등 주요교 우선.
 *
 * 로고 소스 결정 (2026-06-01 실측):
 *   - clearbit Logo API(logo.clearbit.com): 연결 실패(000) — HubSpot 인수 후 sunset. 사용 X.
 *   - Google faviconV2(t2.gstatic.com): .ac.kr 전반 직접 200 + 실제 favicon(이미지). 채택.
 *     (fallback_opts 없으면 전부 404 → 반드시 포함. 주요교는 실 favicon 반환.)
 *
 * 정직성:
 *   - 추측 도메인 금지 — 공식 .ac.kr/.edu 로 확신하는 대학만 등재. 불확실(신설 통합대·일부
 *     교대 등)은 제외 → 해당 교는 monogram 폴백(로고 필수 아님).
 *   - 수집 스크립트가 favicon 200+image 검증 후에만 logo_url 저장 (collect-university-logos.ts).
 *
 * 저작권: 대학 favicon(공개 자산)을 Google 공개 CDN 경유 표시. 문제 소지 시 monogram 폴백으로 충분.
 */

/** universities.id → 공식 도메인 (확신하는 대학만). */
export const UNIVERSITY_DOMAINS: Record<string, string> = {
  // ── 서울 주요 (SKY·인서울) ──────────────────────────────────────────────
  snu: "snu.ac.kr",
  yonsei: "yonsei.ac.kr",
  korea: "korea.ac.kr",
  sungkyunkwan: "skku.edu",
  hanyang: "hanyang.ac.kr",
  sogang: "sogang.ac.kr",
  hkuk: "hufs.ac.kr", // 한국외국어대학교
  kcue_0000052: "konkuk.ac.kr", // 건국대
  kcue_0000066: "khu.ac.kr", // 경희대
  kcue_0000074: "kw.ac.kr", // 광운대
  kcue_0000078: "kookmin.ac.kr", // 국민대
  kcue_0000100: "dongguk.edu", // 동국대
  kcue_0000109: "mju.ac.kr", // 명지대
  kcue_0000117: "smu.ac.kr", // 상명대
  kcue_0000255: "snue.ac.kr", // 서울교육대
  kcue_0000040: "uos.ac.kr", // 서울시립대
  kcue_0000136: "sungshin.ac.kr", // 성신여대
  kcue_0000138: "sejong.ac.kr", // 세종대
  kcue_0000141: "sookmyung.ac.kr", // 숙명여대
  kcue_0000143: "ssu.ac.kr", // 숭실대
  kcue_0000163: "ewha.ac.kr", // 이화여대
  kcue_0000175: "cau.ac.kr", // 중앙대
  kcue_0000212: "hongik.ac.kr", // 홍익대

  // ── 과학기술원 (special) ─────────────────────────────────────────────────
  kaist: "kaist.ac.kr",
  postech: "postech.ac.kr",
  kcue_0000381: "gist.ac.kr", // 광주과학기술원 GIST
  kcue_0000382: "dgist.ac.kr", // 대구경북과학기술원 DGIST
  kcue_0000250: "unist.ac.kr", // 울산과학기술원 UNIST

  // ── 경기·인천 (gyeonggi) ─────────────────────────────────────────────────
  kcue_0000063: "gachon.ac.kr", // 가천대
  kcue_0000082: "dankook.ac.kr", // 단국대
  kcue_0000146: "ajou.ac.kr", // 아주대
  kcue_0000169: "inha.ac.kr", // 인하대
  kcue_0000187: "cha.ac.kr", // 차의과학대

  // ── 거점·국립 (national) ─────────────────────────────────────────────────
  pusan: "pusan.ac.kr", // 부산대
  kcue_0000003: "kangwon.ac.kr", // 강원대
  kcue_0000005: "knu.ac.kr", // 경북대
  kcue_0000007: "gnu.ac.kr", // 경상국립대
  kcue_0000001: "gwnu.ac.kr", // 국립강릉원주대
  kcue_0000008: "kongju.ac.kr", // 국립공주대
  kcue_0000009: "kunsan.ac.kr", // 국립군산대
  kcue_0000010: "kumoh.ac.kr", // 국립금오공과대
  kcue_0000011: "mokpo.ac.kr", // 국립목포대
  kcue_0000012: "mmu.ac.kr", // 국립목포해양대
  kcue_0000013: "pknu.ac.kr", // 국립부경대
  kcue_0000028: "changwon.ac.kr", // 국립창원대
  kcue_0000034: "ut.ac.kr", // 국립한국교통대
  kcue_0000033: "kmou.ac.kr", // 국립한국해양대
  kcue_0000039: "hanbat.ac.kr", // 국립한밭대
  kcue_0000036: "seoultech.ac.kr", // 서울과학기술대
  kcue_0000023: "jnu.ac.kr", // 전남대
  kcue_0000025: "jbnu.ac.kr", // 전북대
  kcue_0000027: "jejunu.ac.kr", // 제주대
  kcue_0000029: "cnu.ac.kr", // 충남대
  kcue_0000030: "cbnu.ac.kr", // 충북대
  kcue_0000037: "hknu.ac.kr", // 한경국립대
  kcue_0000031: "knue.ac.kr", // 한국교원대
  kcue_0000273: "knou.ac.kr", // 한국방송통신대
  kcue_0000032: "knsu.ac.kr", // 한국체육대
  // ── 교육대학 (national) — 확신하는 도메인만 ───────────────────────────────
  kcue_0000256: "ginue.ac.kr", // 경인교대
  kcue_0000251: "gjue.ac.kr", // 공주교대
  kcue_0000252: "gnue.ac.kr", // 광주교대
  kcue_0000253: "dnue.ac.kr", // 대구교대
  kcue_0000254: "bnue.ac.kr", // 부산교대
  kcue_0000258: "jnue.ac.kr", // 전주교대
  kcue_0000262: "cnue.ac.kr", // 춘천교대
  // 제외(불확실): 국립경국대(2025 통합 신설), 국립순천대, 진주교대, 청주교대 → monogram 폴백
};

/**
 * Google faviconV2 — 도메인의 실제 favicon 직접 반환(200, image). fallback_opts 필수.
 * 외부 CDN(gstatic) 직링크 — UniversityBrand 의 plain <img> 가 그대로 사용, onError 시 monogram.
 */
export function universityLogoUrl(domain: string): string {
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
}

/** 공식 홈페이지 URL (website_url 동시 채움 — 도메인 출처 기록 겸용). */
export function universityHomepageUrl(domain: string): string {
  return `https://${domain}`;
}
