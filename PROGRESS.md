# PROGRESS

## 2026-07-02 — 분석 폼(/analysis) 정리
- **외국 고교 질문 제거**: `BasicInfoStep`에서 '외국 고교 출신인가요?' 라디오 + jaeoegukmin 리다이렉트 삭제(국내 일반고 기준). 출신 고교 자동완성은 항상 노출. `abroadHighSchool`은 데이터 계층에 `'no'` 고정 유지 → 서버(matching-kr) P-013 가드·KrSpecsSchema 계약 보존, 재외국민 트랙은 `/admissions/jaeoegukmin` 별도 운영.
- **입력 단계 참고용 안내 삭제**: `AnalysisFormWizard` 하단 "본 분석은 참고용입니다…" 제거. **P-002 정직성 안내는 결과 페이지(`AnalysisResultView` hero)에 유지** — 실제 확률이 노출되는 지점이라 그대로 둠(`result-page-policy.test.tsx`가 게이트).
- 회귀 테스트 정리: `analysis-form-policy.test`에서 삭제된 동작(폼 리다이렉트·폼 참고용) 게이트 제거. 자소서 부재·'확정 합격' 차단 게이트 유지.
- 검증: typecheck ✓ / lint(신규 경고 0) ✓ / vitest 67 pass ✓ / prod build ✓. 커밋 `715c722` → main push → Vercel Git 연동 자동 프로덕션 배포(Ready). 라이브(conatusipsi.com): 공유 청크에서 외국 고교 질문 0건·고교 필드 유지 확인, `/analysis` 307→login 게이팅 정상.
- **온보딩 일관화(커밋 `45a3dd4`)**: `/onboarding` 위저드도 `BasicInfoStep` 공유라 외국 고교 질문 이미 제거됨. 추가로 입력 단계(step 1~3) 하단 amber disclaimer 박스("입력 내용은 본인만…표본 부족…비교과 페널티 없음")도 제거해 `/analysis`와 일관화. stale P-013 주석 정리. typecheck ✓ / vitest 30 pass ✓ / build ✓ → push→자동 배포. 빌드 산출물에서 caveat 구절 0건 확인.
- **P-002 유지 결정**: 참고용/합격 보장 안 함 정직성 안내는 실제 확률이 나오는 결과 페이지(`AnalysisResultView`)에만 유지. 입력 폼(analysis·onboarding)에서는 제거. 결과 페이지 것도 지울지는 클라이언트 확인 대기.

## 2026-07-02 — 대시보드 '나의 입시' 리네이밍 + CTA 리디자인 + 재외국민 링크 (커밋 `8a00bbb`)
- **'입시 대시보드' → '나의 입시' 통일**: `DashboardView` 헤딩 + 인사말에 이름 이동("안녕하세요, {name}님 👋"), nav(헤더/드롭다운), `/what-if` 뒤로가기, 온보딩 완료 CTA, `HeroCta`, `page.tsx` title. 운영자(`/admin`) 대시보드는 별개 개념이라 유지.
- **프로필 CTA 카드 리디자인**('먼저 입시 프로필부터 채워주세요'): 그라데이션 카드 + gradient 아이콘 배지 + 기능 칩(합격률/What-If/카운슬러) + `lg` 버튼. `Card`→`div`, 미사용 `CardContent` import 제거.
- **재외국민 진입 링크(#5)**: `BasicInfoStep` 하단에 `/admissions/jaeoegukmin` 자가진단으로 가는 작은 선택 링크 추가('굳이 묻지 않되 해당자만 선택'). 국내 일반고 폼(`abroadHighSchool='no'`)·서버 P-013 가드 유지. 온보딩·분석 폼 공유라 양쪽 노출.
- 검증: typecheck ✓ / lint(신규 0) ✓ / vitest 968 pass ✓ / prod build ✓ → `deploy.sh --scope joonhyeon-s-projects` READY(conatusipsi.com alias). 라이브: `/`(200)·`/admissions/jaeoegukmin`(200) 확인, `/dashboard`·`/onboarding`·`/analysis` 307→login 정상. **인증 화면(나의 입시 헤딩·CTA·폼 링크)은 OAuth 로그인 필요라 익명 검증 불가** — 로그인 상태에서 육안 확인 필요.
- **#4 미결 유지**: 결과 페이지(`AnalysisResultView`) '본 분석은 참고용입니다…' 삭제 여부는 여전히 클라이언트 확인 대기(P-002 정직성·`result-page-policy.test` 게이트). 입력 폼 것은 이미 제거됨.

## 2026-08-26 — 학년도 시한폭탄 제거 + 테스트 시한폭탄 4건 (미커밋, main push 대기)
- **프로덕션 폭탄**: 10곳이 각자 `new Date().getFullYear() + 1` 로 학년도 계산 → **2027-01-01 부터 2028학년도 조회**. DB 실측 결과 `department_admissions` 는 2027만 4,173행(2026·2028 = 0행) → 검색·추천·비교·플래너·학과상세가 전부 빈 결과가 될 상황이었음. 테스트가 같은 식을 미러링해 자동 검출 불가.
- **해결**: `lib/admission/current-year.ts` 단일 소스 신설 — ① `NEXT_PUBLIC_ADMISSION_YEAR` env 최우선 ② 폴백은 **3월 시즌 롤오버**(1~2월은 직전 학년도 정시 마무리라 그대로 유지, KST 기준) ③ `LATEST_LOADED_ADMISSION_YEAR=2027` 상한 클램프(미적재 미래 학년도 조회 원천 차단). 10곳 전부 교체, `getFullYear() + 1` 잔존 0건. `.env.local.example` 에 갱신 절차 명시.
- **테스트 폭탄 4건**: pricing/confirm-bundle/bundle-visualizer 3건은 얼리버드가(`earlybirdUntil=2027-03-31`)에 물려 2027-04-01 파손 → `vi.setSystemTime` 으로 활성 시점 고정(useFakeTimers 미사용 = Date 만 모킹). boundary-time-slot 은 시각 미고정 + `FUTURE=2027-12-31` 의존 → 파일 기준 시각 2026-07-01 고정. **각 고정이 실효성 있는지 시각을 만료 후로 밀어 7건·2건 실패를 재현해 확인함.** 얼리버드 만료 정책 자체는 무변경.
- **부수 flaky 1건**: `chat-context-policy.test` 의 하드코딩 `waitFor { timeout: 2000 }` 2곳이 병렬 CPU 경합에서 간헐 실패(단독 14/14 통과). `vitest.config.ts` 의 testTimeout 은 waitFor 개별 timeout 을 덮지 않아 15000ms 로 상향(행 감지 용도).
- 검증: typecheck ✓ / lint ✓ / **npm test 2회 연속 90 파일·980 테스트 전부 통과** ✓ / 라이브(dev→원격 Supabase) `/api/admissions/search` 200 + `/api/admissions/{u}/{d}` 가 `year: 2027` 실데이터 반환 ✓. **DB 무변경. main push 안 함 — 사용자 확인 대기.**

## 2026-08-26 — 이관 문서 2종 PDF + HANDOVER.md C장(학년도 갱신) 추가 (미커밋)
- **HANDOVER.md 개편**: 최상위 장 C~F → D~G 로 재번호, 신설 **C장 "학년도 갱신 — 매년 반드시"**(우선순위 3단계·2028 갱신 3스텝·Vercel 3타깃·검증 URL) 삽입. E-4 예시 프롬프트 ⑥(2028 갱신) 추가, D-3 env 표에 `NEXT_PUBLIC_ADMISSION_YEAR` 행, F-5 캘린더·G 체크리스트 반영.
- **실측 정정**: 2027 전체 4,173행/93교(수시 4,170·정시 617/16교는 같은 행 안의 트랙), 입결 보유 **80교** 2,822학과(기존 "93교" 오기), 2026·2028 = 0행. `vercel env ls` 로 `NEXT_PUBLIC_ADMISSION_PROBABILITY_ENABLED=true`(ON) 재확인 + `NEXT_PUBLIC_ADMISSION_YEAR` **미등록** 확인. 고교검색·요금제 잘림은 라이브에서 정상 확인(이미 해결).
- **PDF 2종 생성**: `scripts/docs/build-handover-pdf.mjs` (HANDOVER.md 단일 원본 → micromark + 시스템 Chrome 인쇄). `docs/handover/conatus-인수인계서.pdf`(19p) / `conatus-Claude-연동-가이드.pdf`(6p). Noto Sans CJK KR, 표지·장별 페이지 브레이크·푸터 페이지번호.
- **검증**: `npm test` 90파일 980테스트 전부 통과 ✓ / `.env.local` 비밀값 12개 대조 + 키 패턴 스캔 → **문서 4종 유출 0건** ✓. DB 무변경. **커밋·푸시 안 함 — 사용자 확인 대기**(학년도 시한폭탄 수정분과 함께 push 예정).
