# KCUE 통합 결정 사항 — 2026-05-20

> conatusipsi 의 학과·대학 데이터를 KCUE/대학알리미 OpenAPI + KICE 수능 통계 CSV 로
> 시드하면서 내린 결정과 그 근거를 기록. 다음 enhancement / 변경 시 참고.

## 1. 컨텍스트

- 클라이언트(방준현)로부터 academyinfo.go.kr OpenAPI 키 1개(64-hex) 수령.
- 대학알리미 5종 데이터셋(대학 기본·학과·학생·재정·교원) 활용 신청 완료.
- 또한 KICE(한국교육과정평가원) 수능 등급컷·표준점수·응시현황 CSV 4건 직접 제공
  (`university/TalkFile_*.csv`).

## 2. KCUE OpenAPI 호출

| 결정 | 사유 |
| --- | --- |
| HTTPS → HTTP 강제 | HTTPS 가 SNI 단계에서 서비스키 거부 (`SERVICE ACCESS DENIED`). HTTP 호출은 정상. data.go.kr 키는 read-only 공시 자료라 cleartext 노출 위험 낮음. |
| 단일 `KCUE_API_KEY` env | 5개 dataset 모두 같은 키 발급. 서비스별 override env 도 fallback 으로 지원. |
| `getComparisonPubYear` + `getCodeByRegion` 만 BasicInformationService 에서 사용 | 다른 op 들(`getCodeByLargeSeries` 등)은 사용자 key 권한 외 → `SERVICE ACCESS DENIED` 회피. |
| 학교 enumeration 은 `StudentService.getComparisonFreshmanChanceBalanceSelectionRatio` schlId iterate | 사용자 key 로 호출 가능한 op 중 schlId + schlKrnNm 매핑을 가장 저렴하게 줌. |
| schlId 1..1000 + emptyStreak 60 으로 조기종료 | probe 결과 ~700 까지 학교 존재, 60 연속 빈응답이면 끝. |

## 3. 데이터 모델 결정

### 3.1 universities

- `kcue_code text` — academyinfo schlId (7자리). partial unique index.
- `slug text` — URL 라우팅용 영문 슬러그. legacy 학교는 id 그대로, KCUE 학교는 주요
  학교만 영문 매핑 (37개), 나머지는 `kcue_<schlId>` fallback. unique.
- `kcue_synced_at timestamptz` — 마지막 동기화 시각.

**legacy ↔ KCUE 통합 전략**: legacy id 유지(정본). KCUE sync 로 별도 생성된
중복 row 의 departments 는 legacy id 로 재연결 후 KCUE 중복 row 삭제.
마이그레이션 `20260520141000_legacy_kcue_merge.sql`.

### 3.2 departments

- `kedi_mjr_id text` — KEDI 전공 ID. 학과 분류 코드. **NOT unique per school**
  (학사·석사·박사 행이 같은 kediMjrId 공유).
- `std_clft_mjr_id text` — 표준분류 전공 ID.
- `degree_course text` — 학사 / 석사 / 박사 / 전문학사.
- `daytime text` — 주간 / 야간.
- `id` (PK 의 일부) 는 `<kediMjrId>-<deg>-<day>` 조합 — 학위·주야까지 포함해 결정적.

**partial unique index (university_id, kedi_mjr_id) WHERE kedi_mjr_id IS NOT NULL
는 drop** (`20260520130000_drop_kedi_mjr_id_unique.sql`). 실 데이터(같은 학교에서
학사·석사 행이 kediMjrId 공유)와 모순이라 멱등 upsert 실패 원인이었음.

### 3.3 카테고리 분류 (initial_schema.sql 의 enum)

| 카테고리 | 학교 |
| --- | --- |
| `seoul_top` | snu, yonsei, korea, hanyang, sungkyunkwan, sogang (서울 SKY + 서강·성균관·한양) |
| `special` | kaist, postech, unist, gist, dgist (과학기술원·연구중심) |
| `national_flag` | pusan, knu(경북), jnu(전남), jbnu(전북), cnu(충남), cbnu(충북), kangwon, jejunu, gnu(경상국립) — 9개 거점국립대 |
| `seoul` | uos(서울시립), khu(경희), cau(중앙), ewha, konkuk, dongguk, sejong, soongsil, sookmyung, kookmin, hongik, kwangwoon, mju(명지), smu(상명), sungshin |
| `national_local` | kongju, kumoh, pknu(부경), kmou(한국해양), ut(한국교통), hanbat — 거점 외 국립 |
| `private_local` | gachon, dankook, ajou, eulji, inha, cha — 수도권 외 사립 |

매핑 전 KCUE sync 시 (`schlDivNm`, `schlEstbNm`) → `private_local` 또는
`national_local` 보수적 default. **모호한 학교는 default 유지 — 추측 분류 X.**

### 3.4 학과 표시 범위 기본 필터

`/admissions` 검색·매칭 알고리즘은 다음을 default 로:

- `active = true`
- `degree_course = '학사'`
- `daytime = '주간'`

야간 토글 (`includeNight=true`) 시 `daytime IN ('주간','야간')`.
대학원 포함 (`degreeCourse=all`) 은 admin/연구 UI 에서만 쓰는 옵션 — 일반 사용자
UI 에 노출 X.

### 3.5 URL 라우팅

`/admissions/[universityId]` 라우트 명은 유지. fetch 로직에서 `id = $1 OR slug = $1`
로 둘 다 lookup → 같은 학교를 `/admissions/snu` 또는 `/admissions/0019` 양쪽으로
접근 가능. 별도 redirect 없음 (Search Console SEO 영향 최소화).

## 4. KCUE 응답 처리 함정

- **`schlKrnNm` substring 매칭**: "서울대학교" 호출 → "남서울대학교"·"동서울대학교"
  도 함께 반환. 응답 `schlNm === u.name` 으로 후속 filter 필수.
- **multi-degree row 인플레**: 한 학과가 학사·석사·박사·전문학사 × 주야 행으로 분리
  반환 → `(kediMjrId, deg, day)` 조합 id 사용 + batch 내 Map dedup.
- **partial unique index 와 PostgREST upsert 비호환**: `onConflict='kcue_code'`
  지정 시 partial unique INDEX 와 매칭 안 됨 → PK 기반 upsert 로 우회.

## 5. KICE 수능 통계 CSV

| 결정 | 사유 |
| --- | --- |
| 별도 테이블 `csat_grade_cuts` + `csat_attendance` 분리 | 두 데이터셋의 stake-holders 다름 (등급컷은 분석·확률, 응시현황은 시즌 안내). |
| `exam_kind` enum (`main`/`mock_jun`/`mock_sep`/`mock_other`) | 파일명 패턴에서 자동 추출. |
| 파일명 yyyymmdd → exam_date | 통일된 키. |
| CP949 → UTF-8 (`iconv-lite`) | KICE 표준 인코딩. |
| 파일명 NFC 정규화 (Linux 환경) | macOS/Linux 의 NFD 표기 vs 소스 NFC 리터럴 매칭 보장. |
| 검증 실패율 ≥20% 시 적재 거부 | 파일 깨진 경우 staging 적재 차단 (P-002). |

## 6. 적재 결과 (2026-05-20)

| 카테고리 | 수 |
| --- | --- |
| KCUE universities (kcue_code 보유) | 321 (legacy 10 + 신규 311) |
| KCUE departments (kedi_mjr_id 보유) | 28,361 (active 12,974 / 폐과 15,387) |
| 학사·주간 active 학과 (default 필터 적용 시) | 별도 SQL 검증 필요 — 검증 SQL 결과 참조 |
| csat_grade_cuts | 577 (본수능 289 + 9월 모의 288) |
| csat_attendance | 34 (1994~2025 연도별) |
| 일일 API 호출 사용 | ~2,200 / 10,000 (한도 21%) |

## 7. 후속 작업

- [ ] **나머지 270여개 KCUE 학교 카테고리 정밀화** — 현재는 사립=`private_local`,
      국립=`national_local` default. admin UI 에서 수동 분류 가능하도록 페이지 추가.
- [ ] **재정·교원 indicator 컬럼 매핑** — 현재 sync 의 `phase=indicators` 는 preview only.
      `universities` 에 `tuition`, `full_time_faculty_ratio` 컬럼 추가 + 시드 작업 필요.
- [ ] **학과 데이터 정밀 매칭** — 사용자(snu 학생) 의 학과 검색 시 legacy `snu/medicine` row 와
      KCUE 시드 `snu/u04...-ba-d` row 가 공존. 같은 학과의 중복 표시 방지를 위해 매핑 룰
      필요 (admin 매뉴얼 매칭 또는 LIKE-based 자동 매핑).
- [ ] **수능 9등급 누락 row 복구** — 본수능 일부 영어·한국사 등급 빈셀(absolute 영역)이
      36건 invalid 처리됨. Zod 스키마를 z.coerce.number().nullable() 로 완화하거나
      "-" 토큰 별도 처리.
- [ ] **HWPX 파일** (`연도별 채점현황_20251231.hwpx`) — 한글 워드 바이너리. LibreOffice
      또는 hwpx-cli 로 텍스트 추출 필요. 현재 미적재.
