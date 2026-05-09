/**
 * 모집요강 수능최저 텍스트 샘플 100건 — trackPattern 어휘 커버리지 검증용
 *
 * 갱신 주기: 매년 7~9월 ETL 시즌 시작 전
 * 갱신 방법:
 *   1. 그 해 발표된 모집요강 텍스트에서 수능최저·계열 분류 표현을 추출
 *   2. 본 배열에 신규 표현 추가 (실제 학교명·전형명 제거, 패턴만 남김)
 *   3. trackPattern-coverage.test.ts 실행 → 신규 계열명이 어휘 부족으로 잡히면
 *      lib/admission/min-req-classifier.ts 의 TRACK_PATTERN_VOCAB 보강
 *
 * 보안·저작권: 실제 학교명·전형명은 포함하지 않으며, 모집요강의 표현 패턴만
 * 합성한 텍스트. 따라서 실제 모집요강과 1:1 일치하지 않을 수 있음.
 *
 * 샘플 분포 (100건):
 *   - 인문계열: 10
 *   - 자연계열: 10
 *   - 공학계열: 8
 *   - 예체능계열: 5
 *   - 의약계열: 5
 *   - 상경계열: 5
 *   - 어문계열: 5
 *   - 사회계열: 5
 *   - 다중 계열 (conditional 후보): 7
 *   - 계열 표현 없음: 40
 */

export interface MinReqSample {
  id: number;
  text: string;
  /** 본 텍스트에 등장해야 하는 ○○계열의 ○○ 목록 (회귀 검증 보조). 없으면 빈 배열. */
  expectedTracks: string[];
}

export const SAMPLE_MIN_REQS: MinReqSample[] = [
  // ── 인문계열 (10) ───────────────────────────────────────────
  { id: 1, text: "인문계열 3개 합 5", expectedTracks: ["인문"] },
  { id: 2, text: "인문계열 4개 합 7, 한국사 4등급 이내", expectedTracks: ["인문"] },
  { id: 3, text: "인문계열 모집단위는 국·수·영 중 2개 합 4", expectedTracks: ["인문"] },
  { id: 4, text: "본 학과는 인문계열로 분류됩니다", expectedTracks: ["인문"] },
  { id: 5, text: "인문계열에 한해 영어 2등급 이내", expectedTracks: ["인문"] },
  { id: 6, text: "인문계열 학생부 등급 평균 2.0 이내 권장", expectedTracks: ["인문"] },
  { id: 7, text: "인문계열의 경우 사회탐구 2과목 평균 반영", expectedTracks: ["인문"] },
  { id: 8, text: "인문계열 모집은 국어·영어 위주", expectedTracks: ["인문"] },
  { id: 9, text: "인문계열은 수능최저 없음", expectedTracks: ["인문"] },
  { id: 10, text: "인문계열 추가 가산점 없음", expectedTracks: ["인문"] },

  // ── 자연계열 (10) ───────────────────────────────────────────
  { id: 11, text: "자연계열 3개 합 6, 한국사 4등급", expectedTracks: ["자연"] },
  { id: 12, text: "자연계열 4개 합 8", expectedTracks: ["자연"] },
  { id: 13, text: "자연계열 모집단위는 수학·과학 위주", expectedTracks: ["자연"] },
  { id: 14, text: "본 학과는 자연계열로 분류됨", expectedTracks: ["자연"] },
  { id: 15, text: "자연계열에 한해 수학(미적분) 응시 필수", expectedTracks: ["자연"] },
  { id: 16, text: "자연계열 학생부 등급 평균 2.5 이내 권장", expectedTracks: ["자연"] },
  { id: 17, text: "자연계열의 경우 과학탐구 2과목 반영", expectedTracks: ["자연"] },
  { id: 18, text: "자연계열 수능최저: 국·수·영·탐 중 3개 합 7", expectedTracks: ["자연"] },
  { id: 19, text: "자연계열은 수학 가산점 5%", expectedTracks: ["자연"] },
  { id: 20, text: "자연계열 모집인원 200명", expectedTracks: ["자연"] },

  // ── 공학계열 (8) ────────────────────────────────────────────
  { id: 21, text: "공학계열 4개 합 8", expectedTracks: ["공학"] },
  { id: 22, text: "공학계열 모집단위는 수학·과학 위주", expectedTracks: ["공학"] },
  { id: 23, text: "본 학과는 공학계열로 분류", expectedTracks: ["공학"] },
  { id: 24, text: "공학계열에 한해 수학(미적분) 응시 권장", expectedTracks: ["공학"] },
  { id: 25, text: "공학계열 추가 가산점: 미적분 5%", expectedTracks: ["공학"] },
  { id: 26, text: "공학계열 한정 수학 1등급 이상 우대", expectedTracks: ["공학"] },
  { id: 27, text: "공학계열의 경우 영어 절대평가 반영", expectedTracks: ["공학"] },
  { id: 28, text: "공학계열 모집요강 별첨 참조", expectedTracks: ["공학"] },

  // ── 예체능계열 (5) ──────────────────────────────────────────
  { id: 29, text: "예체능계열 실기 70% + 수능 30%", expectedTracks: ["예체능"] },
  { id: 30, text: "예체능계열 수능최저: 국어·영어 합 8", expectedTracks: ["예체능"] },
  { id: 31, text: "본 학과는 예체능계열로 분류됩니다", expectedTracks: ["예체능"] },
  { id: 32, text: "예체능계열에 한해 실기고사 필수", expectedTracks: ["예체능"] },
  { id: 33, text: "예체능계열 모집은 11월 실기 시행", expectedTracks: ["예체능"] },

  // ── 의약계열 (5) ────────────────────────────────────────────
  { id: 34, text: "의약계열 4개 합 4", expectedTracks: ["의약"] },
  { id: 35, text: "의약계열 수능최저: 국·수·영·탐 4개 합 5", expectedTracks: ["의약"] },
  { id: 36, text: "본 학과(의예)는 의약계열로 분류", expectedTracks: ["의약"] },
  { id: 37, text: "의약계열에 한해 면접 평가", expectedTracks: ["의약"] },
  { id: 38, text: "의약계열 모집인원 50명", expectedTracks: ["의약"] },

  // ── 상경계열 (5) ────────────────────────────────────────────
  { id: 39, text: "상경계열 3개 합 5", expectedTracks: ["상경"] },
  { id: 40, text: "상경계열 모집단위는 수학(상위) 권장", expectedTracks: ["상경"] },
  { id: 41, text: "본 학과는 상경계열로 분류됩니다", expectedTracks: ["상경"] },
  { id: 42, text: "상경계열에 한해 수학 미적분 가산점", expectedTracks: ["상경"] },
  { id: 43, text: "상경계열의 경우 영어 1등급 우대", expectedTracks: ["상경"] },

  // ── 어문계열 (5) ────────────────────────────────────────────
  { id: 44, text: "어문계열 3개 합 5", expectedTracks: ["어문"] },
  { id: 45, text: "어문계열 모집단위는 영어·국어 위주", expectedTracks: ["어문"] },
  { id: 46, text: "본 학과는 어문계열로 분류", expectedTracks: ["어문"] },
  { id: 47, text: "어문계열에 한해 제2외국어 가산점", expectedTracks: ["어문"] },
  { id: 48, text: "어문계열의 경우 영어 절대평가 반영", expectedTracks: ["어문"] },

  // ── 사회계열 (5) ────────────────────────────────────────────
  { id: 49, text: "사회계열 3개 합 6", expectedTracks: ["사회"] },
  { id: 50, text: "사회계열 모집단위는 사회탐구 위주", expectedTracks: ["사회"] },
  { id: 51, text: "본 학과는 사회계열로 분류됩니다", expectedTracks: ["사회"] },
  { id: 52, text: "사회계열에 한해 사회탐구 2과목 반영", expectedTracks: ["사회"] },
  { id: 53, text: "사회계열의 경우 영어 2등급 이내", expectedTracks: ["사회"] },

  // ── 다중 계열 (conditional 후보) (7) ────────────────────────
  { id: 54, text: "인문계열 3개 합 5, 자연계열 수학 포함 3개 합 6", expectedTracks: ["인문", "자연"] },
  { id: 55, text: "인문계열은 영어 2등급, 자연계열은 수학 1등급 이내", expectedTracks: ["인문", "자연"] },
  { id: 56, text: "인문계열 학생은 사회탐구, 자연계열 학생은 과학탐구 필수", expectedTracks: ["인문", "자연"] },
  { id: 57, text: "공학계열 4개 합 8, 의약계열 4개 합 5", expectedTracks: ["공학", "의약"] },
  { id: 58, text: "자연계열·공학계열 통합 모집", expectedTracks: ["자연", "공학"] },
  { id: 59, text: "인문계열·사회계열 합산 모집", expectedTracks: ["인문", "사회"] },
  { id: 60, text: "상경계열·인문계열 동일 기준 적용", expectedTracks: ["상경", "인문"] },

  // ── 계열 표현 없는 텍스트 (40) ──────────────────────────────
  { id: 61, text: "국·수·영·탐 중 3개 합 5등급 이내", expectedTracks: [] },
  { id: 62, text: "국·수·영·탐 4개 합 7, 한국사 4등급", expectedTracks: [] },
  { id: 63, text: "국어·수학 평균 2등급", expectedTracks: [] },
  { id: 64, text: "수능최저 없음", expectedTracks: [] },
  { id: 65, text: "국·수·영·탐 중 2개 합 4", expectedTracks: [] },
  { id: 66, text: "수학 포함 3개 합 6", expectedTracks: [] },
  { id: 67, text: "영어 2등급 이내", expectedTracks: [] },
  { id: 68, text: "한국사 5등급 이내", expectedTracks: [] },
  { id: 69, text: "탐구 두 과목 평균 2등급", expectedTracks: [] },
  { id: 70, text: "국어·영어 합 4등급", expectedTracks: [] },
  { id: 71, text: "수학(미적분) 1등급 우대", expectedTracks: [] },
  { id: 72, text: "모집요강 본문 참조", expectedTracks: [] },
  { id: 73, text: "추가 모집 시 별도 공지", expectedTracks: [] },
  { id: 74, text: "학생부 등급 평균 2.0 이내 권장", expectedTracks: [] },
  { id: 75, text: "면접 30% + 학생부 70%", expectedTracks: [] },
  { id: 76, text: "실기 50% + 학생부 50%", expectedTracks: [] },
  { id: 77, text: "논술 60% + 학생부 40%", expectedTracks: [] },
  { id: 78, text: "정시 가군 모집", expectedTracks: [] },
  { id: 79, text: "정시 나군 모집", expectedTracks: [] },
  { id: 80, text: "정시 다군 모집", expectedTracks: [] },
  { id: 81, text: "학생부교과 100% 반영", expectedTracks: [] },
  { id: 82, text: "학생부종합 단계별 평가", expectedTracks: [] },
  { id: 83, text: "1단계 서류 100% (3배수)", expectedTracks: [] },
  { id: 84, text: "2단계 서류 70% + 면접 30%", expectedTracks: [] },
  { id: 85, text: "수능 영역별 반영비: 국30%, 수40%, 영20%, 탐10%", expectedTracks: [] },
  { id: 86, text: "변환표준점수 적용", expectedTracks: [] },
  { id: 87, text: "백분위 95 이상 우대", expectedTracks: [] },
  { id: 88, text: "표준점수 130 이상", expectedTracks: [] },
  { id: 89, text: "환산점수 750점 이상", expectedTracks: [] },
  { id: 90, text: "합격선 70%컷 728점", expectedTracks: [] },
  { id: 91, text: "경쟁률 5.2:1", expectedTracks: [] },
  { id: 92, text: "모집인원 30명", expectedTracks: [] },
  { id: 93, text: "추가합격 발표 1월 31일", expectedTracks: [] },
  { id: 94, text: "원서접수 9월 11일~14일", expectedTracks: [] },
  { id: 95, text: "면접일 11월 25일", expectedTracks: [] },
  { id: 96, text: "발표일 12월 8일", expectedTracks: [] },
  { id: 97, text: "등록기간 12월 14일~16일", expectedTracks: [] },
  { id: 98, text: "미충원 시 정시 이월", expectedTracks: [] },
  { id: 99, text: "일반전형 정원내", expectedTracks: [] },
  { id: 100, text: "농어촌 정원외 5명", expectedTracks: [] },
];
