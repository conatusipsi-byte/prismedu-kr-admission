/**
 * 합격률(admission probability) 기능 안전 플래그.
 *
 * 긴급 안전 조치 (2026-06): 현재 합격률 표본(admission_sample_stats)과 전년도 입결
 * (department_admissions.prev_year_result, source=seed-v1)이 전부 "시연용 난수"다 —
 * scripts/seed-sample-data.ts 가 Math.random 으로 생성한 값이며 실제 입결이 아니다.
 * 실데이터(공공 API·제휴·직접 제공) 확보 전까지 OFF 로 두어 가짜 합격 확률이 학생에게
 * 노출되지 않게 한다. (정직성 원칙 + 입시 진로 오도 방지)
 *
 * 효과(OFF):
 *   - checkSampleSufficiency / checkHakjongSampleSufficiency 가 항상 '표본 없음' 반환 →
 *     match · simulate · compare · search · 학과 상세 · AI 챗 의 합격률이 전부
 *     "표본 부족 / 준비 중" 경로로 폴백 (가짜 % 미노출).
 *   - fetch-detail 은 전년도 입결(경쟁률·등급컷)도 숨김 (seed-v1 난수 차단).
 *   - 모집요강 실데이터(전형·정원·수능최저·반영비율)는 정상 노출 — 이건 실 ETL 데이터.
 *
 * 재활성화(가역적): 실 입결·표본 적재 후 Vercel 환경변수
 *   NEXT_PUBLIC_ADMISSION_PROBABILITY_ENABLED=true 설정 + 재배포.
 *
 * NEXT_PUBLIC_ 접두사 — 서버 게이트(sample-gate·fetch-detail)와 클라이언트 안내 배너
 * (AnalysisResultView·ProbabilityTab)가 동일 값을 읽도록 단일 소스. (기본값 미설정 = OFF)
 */
export const ADMISSION_PROBABILITY_ENABLED =
  process.env.NEXT_PUBLIC_ADMISSION_PROBABILITY_ENABLED === "true";
