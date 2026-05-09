# 컴포넌트 인벤토리

prismedu.kr 의 `src/components/` 전수 분류와 한국 입시 프로젝트로의 이관 매핑.

코드 작업 시 본 문서를 1:1 체크리스트로 사용. 각 컴포넌트가 머지될 때마다 체크박스 갱신 권장.

---

## 0. 분류 기호

| 기호 | 의미 | 작업량 |
|---|---|---|
| ♻️ | 그대로 재사용 (텍스트만 일부 교체 또는 무수정) | 0~0.2d |
| 🔧 | 골격 유지, 도메인 데이터·라벨 교체 | 0.5~2d |
| ❌ | 제거 (한국 입시 무관) | 0d |
| ✨ | 신규 작성 | 1~3d |

---

## 1. UI 프리미티브 (`components/ui/*`) — 35개

shadcn/Radix 기반. **전부 ♻️** — 도메인 무관. 그대로 복사.

| 파일 | 분류 | 비고 |
|---|---|---|
| accordion.tsx | ♻️ | |
| alert-dialog.tsx | ♻️ | |
| alert.tsx | ♻️ | |
| avatar.tsx | ♻️ | |
| badge.tsx | ♻️ | 락/안내 카드에서 활용 |
| button.tsx | ♻️ | |
| calendar.tsx | ♻️ | 시즌 일정 위젯 |
| card.tsx | ♻️ | Gated wrapper에서 사용 |
| carousel.tsx | ♻️ | |
| checkbox.tsx | ♻️ | |
| collapsible.tsx | ♻️ | |
| dialog.tsx | ♻️ | |
| dropdown-menu.tsx | ♻️ | |
| form.tsx | ♻️ | react-hook-form 통합 |
| input.tsx | ♻️ | |
| label.tsx | ♻️ | |
| menubar.tsx | ♻️ | |
| popover.tsx | ♻️ | |
| progress.tsx | ♻️ | 학종 1단계 통과 진행도 |
| radio-group.tsx | ♻️ | |
| scroll-area.tsx | ♻️ | |
| segmented-control.tsx | ♻️ | 가/나/다군 탭 |
| select.tsx | ♻️ | |
| separator.tsx | ♻️ | |
| sheet.tsx | ♻️ | |
| sidebar.tsx | ♻️ | |
| skeleton-wrapper.tsx | ♻️ | |
| skeleton.tsx | ♻️ | |
| slider.tsx | ♻️ | what-if 시뮬레이터 |
| switch.tsx | ♻️ | |
| table.tsx | ♻️ | 모집요강 표 |
| tabs.tsx | ♻️ | |
| textarea.tsx | ♻️ | |
| toast.tsx | ♻️ | |
| toaster.tsx | ♻️ | |
| tooltip.tsx | ♻️ | |

**소계**: ♻️ × 35

---

## 2. 공용 레이아웃·인프라 — 19개

| 파일 | 분류 | 비고 |
|---|---|---|
| AppShell.tsx | ♻️ | 전체 레이아웃 |
| AuthGate.tsx | ♻️ | 인증 가드 wrapper |
| AuthRequired.tsx | ♻️ | 인증 필요 안내 |
| BottomNav.tsx | 🔧 | 메뉴 항목 한국 입시로 (essays 제거, jaeoegukmin 추가 검토) |
| ConditionalFooter.tsx | ♻️ | |
| ConfirmDialog.tsx | ♻️ | |
| DesktopSidebar.tsx | 🔧 | BottomNav와 동일 변경 |
| EmptyState.tsx | ♻️ | |
| ErrorBoundary.tsx | ♻️ | |
| Footer.tsx | 🔧 | 텍스트·링크 (회사 정보·약관) 교체 |
| InstallPrompt.tsx | ♻️ | PWA |
| PageHeader.tsx | ♻️ | |
| PageIntroCard.tsx | ♻️ | |
| PageTransition.tsx | ♻️ | |
| PrismLoader.tsx | 🔧 | 브랜드 로고 변경 |
| ServiceWorkerRegister.tsx | ♻️ | |
| SessionExpiryWatcher.tsx | ♻️ | |
| Skeleton.tsx | ♻️ | |
| SplashScreen.tsx | 🔧 | 브랜드 로고 |
| StorageQuotaBanner.tsx | ♻️ | |
| ThemeProvider.tsx | ♻️ | |
| UpgradeCTA.tsx | 🔧 | 가격·플랜 한국 시장으로 |

**소계**: ♻️ × 14, 🔧 × 8

---

## 3. 도메인별 컴포넌트

### 3.1 `components/admissions/` (3개)

| 파일 | 분류 | 작업 |
|---|---|---|
| AdmissionDetailPage.tsx | 🔧 | US 미국 대학 상세 → KR 학과 상세. P-001 핵심 무대. |
| AdmissionUnavailable.tsx | ♻️ | 학과 미운영·폐지 안내 |
| SimilarAdmissionCard.tsx | 🔧 | 합격사례 매칭 카드 — 코사인 유사도 결과 표시 |

### 3.2 `components/analysis/` (8개 + tabs/)

| 파일 | 분류 | 작업 |
|---|---|---|
| AnalysisAnalyzingView.tsx | ♻️ | 로딩/진행 화면 |
| AnalysisFormWizard.tsx | 🔧 | 입력 단계 변경 (US specs → KR specs) |
| AnalysisResultView.tsx | 🔧 | 결과 카드 분기 — 정상/insufficient/학종 분해 |
| ProbabilityReveal.tsx | ♻️ | 확률 애니메이션 |
| SchoolModal.tsx | 🔧 | → DepartmentModal 전환 |
| SchoolRow.tsx | 🔧 | → DepartmentRow 전환 |
| SpecAnalysisPanel.tsx | 🔧 | KR 스펙 항목 |
| SpecAnalysisView.tsx | 🔧 | KR 스펙 리포트 |
| form-helpers.tsx | 🔧 | KR 도메인 헬퍼 |
| tabs/CostTab.tsx | ❌ | 미국 등록금 탭 — 한국 입시 무관 |
| tabs/EssayTab.tsx | ❌ | 자소서 탭 — 한국 입시 무관 (자소서 폐지) |
| tabs/MajorTab.tsx | 🔧 | 전공 정보 탭 |
| tabs/OverviewTab.tsx | 🔧 | 개요 탭 — 한국 학과 정보 |

### 3.3 `components/dashboard/` (2개)

| 파일 | 분류 | 작업 |
|---|---|---|
| DashboardTipCard.tsx | 🔧 | 팁 콘텐츠 한국 입시로 |
| TodayFocusCard.tsx | 🔧 | D-Day 항목 (수능/원서/면접) |

### 3.4 `components/essays/` (4개) — **❌ 전부 제거**

| 파일 | 분류 | 사유 |
|---|---|---|
| EssayEditor.tsx | ❌ | 24학번부터 자소서 폐지 |
| EssayHelpers.tsx | ❌ | 동일 |
| EssayPicker.tsx | ❌ | 동일 |
| StreamingResultView.tsx | ❌ | 동일 |

### 3.5 `components/landing/` (10개)

| 파일 | 분류 | 작업 |
|---|---|---|
| AppStoreButton.tsx | ♻️ | 모바일 앱 다운로드 (해당 시) |
| AsideHighlights.tsx | 🔧 | 사이드 하이라이트 텍스트 |
| AuthSection.tsx | ♻️ | 카카오 로그인 |
| FAQAccordion.tsx | ♻️ | 콘텐츠는 `lib/landing-faq.ts` 교체 |
| LiveStatsBar.tsx | 🔧 | 통계 항목 (가입자·합격사례 수) |
| OnboardingSlides.tsx | 🔧 | 온보딩 카피 |
| PersonaCard.tsx | 🔧 | 학생/학부모 페르소나 한국 시장 |
| PersonaSection.tsx | 🔧 | 동일 |
| SampleReportShowcase.tsx | 🔧 | 샘플 리포트 한국 학과로 |
| TrustSignalBar.tsx | ♻️ | 보안·신뢰 배지 |

### 3.6 `components/parent/` (4개) — 검토 필요

prismedu.kr 의 학부모 리포트 기능. 한국 입시에 적용 여부는 클라이언트 결정 사항. 현재는 보존.

| 파일 | 분류 | 작업 |
|---|---|---|
| InvalidTokenView.tsx | ♻️ | |
| ParentNav.tsx | 🔧 | 메뉴 한국 입시로 |
| ParentReportView.tsx | 🔧 | KR 도메인 |
| ParentShareSection.tsx | ♻️ | 공유 토큰 패턴 |

⚠️ MVP 차단 요건 외. 클라이언트 의사결정 후 적용 여부 결정 — 우선 미사용으로 보존.

### 3.7 `components/planner/` (2개)

| 파일 | 분류 | 작업 |
|---|---|---|
| GeneratedTasksPreview.tsx | ♻️ | |
| TaskCategoryBadge.tsx | 🔧 | 카테고리 (수능 준비·내신·원서·면접·논술·실기) |

### 3.8 `components/reports/` (4개)

부모 리포트 PDF — `parent/` 와 동일 의사결정 대기.

| 파일 | 분류 | 작업 |
|---|---|---|
| ReportAcademicPage.tsx | 🔧 | KR 학업 정보 |
| ReportCoverPage.tsx | 🔧 | KR 표지 |
| ReportParentPage.tsx | 🔧 | KR 학부모 |
| SampleReportDocument.tsx | 🔧 | 샘플 리포트 |

### 3.9 `components/brand/` (1개)

| 파일 | 분류 | 작업 |
|---|---|---|
| PrismLogo.tsx | 🔧 | 브랜드 로고 — 새 도메인 conatusipsi 로고로 |

### 3.10 `components/ia/` (1개)

| 파일 | 분류 | 작업 |
|---|---|---|
| MigrationNudgeBanner.tsx | ❌ | prismedu.kr 사이트 마이그레이션 안내 — 신규 사이트엔 무관 |

### 3.11 루트 컴포넌트 (8개)

| 파일 | 분류 | 작업 |
|---|---|---|
| AdmissionFeed.tsx | 🔧 | 학과 검색 피드 |
| AdmissionResultModal.tsx | 🔧 | 분석 결과 모달 |
| Analytics.tsx | ♻️ | GA·analytics 통합 |
| SchoolLogo.tsx | 🔧 | 한국 대학 로고 — 데이터 교체 |
| Sparkline.tsx | ♻️ | 모의 점수 추이 차트 |

**소계**: ♻️ × 8, 🔧 × 25, ❌ × 6

---

## 4. 신규 작성 컴포넌트 (✨)

한국 입시 도메인 + MVP Launch Blocker 요구사항.

### 4.1 정책·게이트 wrapper (P-001)

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ Gated | `components/access/Gated.tsx` | **P0 (이번 PR)** |
| ✨ InsufficientSampleCard | `components/access/InsufficientSampleCard.tsx` | P0 (Gated 내부) |
| ✨ LockCard | `components/access/LockCard.tsx` | P0 (Gated 내부) |
| ✨ FreePreviewCounter | `components/access/FreePreviewCounter.tsx` | P0 |

### 4.2 한국 입시 도메인 카드

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ KrAdmissionDetailPage | `components/admissions/KrAdmissionDetailPage.tsx` | **P0 (Launch Blocker #1)** |
| ✨ AdmissionTracksTable | `components/admissions/AdmissionTracksTable.tsx` | P0 |
| ✨ CsatMinimumBlock | `components/admissions/CsatMinimumBlock.tsx` | P0 |
| ✨ RequiredAreasBadge | `components/admissions/RequiredAreasBadge.tsx` | P0 |
| ✨ PrevYearResultCard | `components/admissions/PrevYearResultCard.tsx` | P0 |
| ✨ AdmissionTrackBadge | `components/admissions/AdmissionTrackBadge.tsx` | P0 (트랙 종류 라벨) |
| ✨ ConversionTableStatus | `components/admissions/ConversionTableStatus.tsx` | P1 (P-012 preliminary 표시) |

### 4.3 학종 분해 (P-006)

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ HakjongProbabilityCard | `components/analysis/HakjongProbabilityCard.tsx` | P0 |
| ✨ ProbabilityBreakdown | `components/analysis/ProbabilityBreakdown.tsx` | P0 |

### 4.4 학과 → 의향 슬롯

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ JeongsiSlotProgress | `components/dashboard/JeongsiSlotProgress.tsx` | P1 (가/나/다군 슬롯 채움) |
| ✨ SusiSlotProgress | `components/dashboard/SusiSlotProgress.tsx` | P1 (수시 6장 진행) |
| ✨ AdmissionIntentValidator | `components/onboarding/AdmissionIntentValidator.tsx` | P0 (P-003) |

### 4.5 재외국민 분기 (P-013)

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ JaeoegukminEntryPoint | `components/landing/JaeoegukminEntryPoint.tsx` | **P0 (Launch Blocker #2)** |
| ✨ EligibilityChecker | `components/admissions/EligibilityChecker.tsx` | P0 |
| ✨ JaeoegukminTracksList | `components/admissions/JaeoegukminTracksList.tsx` | P0 |

### 4.6 검색·필터

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ DepartmentSearchBar | `components/admissions/DepartmentSearchBar.tsx` | P0 |
| ✨ RegionFilter | `components/admissions/RegionFilter.tsx` | P0 |
| ✨ TrackFilter | `components/admissions/TrackFilter.tsx` | P0 |
| ✨ UniversityCategoryFilter | `components/admissions/UniversityCategoryFilter.tsx` | P0 |

### 4.7 카운슬러 (P-002)

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ SanitizedBadge | `components/chat/SanitizedBadge.tsx` | P1 (디버그 노출) |

### 4.8 결제·주문

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ OrderList | `components/orders/OrderList.tsx` | P0 |
| ✨ OrderDetail | `components/orders/OrderDetail.tsx` | P0 |
| ✨ RefundButton | `components/orders/RefundButton.tsx` | P1 |

### 4.9 관리자 (Launch Blocker #3 외 일부 P1)

| 컴포넌트 | 경로 | 우선 |
|---|---|---|
| ✨ SanitizeRateChart | `components/admin/SanitizeRateChart.tsx` | **P0 (Launch Blocker #3)** |
| ✨ PatternDistributionDonut | `components/admin/PatternDistributionDonut.tsx` | P0 |
| ✨ RecentEventsTable | `components/admin/RecentEventsTable.tsx` | P0 |
| ✨ TopContextSchools | `components/admin/TopContextSchools.tsx` | P0 |
| ✨ AdminNotificationsList | `components/admin/AdminNotificationsList.tsx` | P1 |
| ✨ KpiOverview | `components/admin/KpiOverview.tsx` | P1 |
| ✨ StagingDiffView | `components/admin/StagingDiffView.tsx` | P1 (이월 검수) |
| ✨ EncodingStatsChart | `components/admin/EncodingStatsChart.tsx` | P2 |
| ✨ EtlPhaseStatus | `components/admin/EtlPhaseStatus.tsx` | P2 |
| ✨ TrackVocabPRList | `components/admin/TrackVocabPRList.tsx` | P2 |
| ✨ SampleStatsTable | `components/admin/SampleStatsTable.tsx` | P1 |
| ✨ InsufficientSampleList | `components/admin/InsufficientSampleList.tsx` | P1 |
| ✨ EntitlementEditor | `components/admin/EntitlementEditor.tsx` | P1 |
| ✨ RefundProcessor | `components/admin/RefundProcessor.tsx` | P1 |

**소계**: ✨ × 약 35

---

## 5. 종합 통계

| 분류 | 개수 |
|---|---|
| ♻️ 그대로 재사용 | **약 57** (35 ui + 14 인프라 + 8 도메인) |
| 🔧 수정 재사용 | **약 33** (8 인프라 + 25 도메인) |
| ❌ 제거 | **약 6** (essays 4 + cost/essay tab 2 + ia 1) |
| ✨ 신규 작성 | **약 35** (정책 wrapper 4 + 도메인 카드 등) |
| **총 컴포넌트 수** | **약 131** |

재사용 비율 (♻️+🔧): **약 90/131 ≈ 69%**, prismedu.kr 의도(80% 재활용)와 근접.

---

## 6. 우선순위별 신규 컴포넌트 작업 시간 추정

| 우선 | 컴포넌트 수 | 예상 시간 | 비고 |
|---|---|---|---|
| **P0 (Launch Blocker)** | 약 22 | 약 8~10일 | Gated wrapper · KrAdmissionDetailPage · jaeoegukmin · sanitize-monitor · 검색·필터 |
| **P1 (출시 후 1개월 내)** | 약 9 | 약 4~5일 | 슬롯 진행도·AdminNotifications·StagingDiffView 등 |
| **P2 (시즌 전)** | 약 4 | 약 2~3일 | EncodingStats·TrackVocabPR 등 |
| **합계** | **약 35** | **약 14~18일** | 1인 풀타임 기준 |

---

## 7. 다음 단계

1. **본 인벤토리 PR 머지** — 본 문서를 코드 작업 단일 진실 소스로 활용
2. **`Gated` wrapper 우선 작성** (이번 PR) — 모든 페이지의 락·안내 UI 일관성 사전 확보
3. **P0 신규 컴포넌트 22개** — Launch Blocker 5개 페이지에서 호출되는 의존성부터
4. **`🔧` 25개** — prismedu.kr 컴포넌트 복사 후 도메인 데이터 교체 (병렬 진행 가능)
5. **`❌` 제거** — `essays/`, `tabs/{Cost,Essay}Tab.tsx`, `MigrationNudgeBanner` 모두 삭제 (코드 검색 시 혼란 방지)
6. **`✨` 추가 35개** — 우선순위표대로 점진 개발

각 컴포넌트 머지 PR에는 본 문서의 해당 행 체크박스 갱신 포함 권장.
