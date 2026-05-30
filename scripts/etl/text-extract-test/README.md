# 텍스트 추출 ETL 테스트 — Vision API 대체 가능성 (2026-05-30)

## 목적
Claude Vision API(유료, 방준현 $25) 대신 `pdftotext -layout` + Claude Code 본체 직접 구조화(무료)로
한국 대학 모집요강 PDF를 `AdmissionRecord(PdfAnalysisResult)` 스키마로 변환 가능한지 고려대로 검증.

## 방식
1. `pdftotext -layout univ/1780023076409_0.pdf korea.txt` — 표 레이아웃 보존 텍스트 추출
2. 본체가 `korea.txt` 정독 → 9개 전형의 반영비율·수능최저 템플릿 추출 (이전 정규식 파서가 0건이던 부분)
3. `build-korea.py` — 모집인원 그리드를 우앵커 파싱 + 전형 템플릿 결합
4. **이중 체크섬 검증**: 행합(학과별 9전형=모집인원) + 열합(전형별 합=합계행 650/903/523/201/20/18/10/351/55)
5. `validate-schema.ts` — 실제 Zod 스키마(`PdfAnalysisResultSchema`) 적합성 검증

## 결과 (`korea-text.json`)
| 지표 | 값 |
|---|---|
| Vision 비용 | **$0.00** |
| 학과(모집단위) | 66 |
| 전형(track) | 329 |
| 행합 검증 | 66/66 통과 |
| 열합 검증 | 8/8 일치 (재직자는 ◉지원가능→null) |
| reflectionStages | 329/329 (100%) |
| csatMinimumRawText | 329/329 (100%) |
| sourcePages | 329/329 (100%) |
| quotaInitial | 306/329 (93%) — 미충족 23 = 재직자 ◉(고정인원 아님) |
| **완전레코드** | **306/329 (93%)** |

비교 — 검증된 SNU Vision 기준선: 완전레코드 70%, $0.47.
같은 고려대 Vision 시도(`korea-merged.json`): 2개 학과만 추출, 66학과 그리드 누락, $0.81.

## 독립 교차검증
Vision이 추출했던 2개 학과(디자인조형학부·체육교육과) 반영비율 = 텍스트 결과와 **완전 동일**.

## 정직성 처리
- 재직자전형 ◉(지원가능, 모집단위별 최대1·총18) → `quotaInitial=null` + note (추정 안 함)
- 재외국민(정원외 2%): 본 수시요강에 전형방법 표 없음 → 미추출 (warning)
- trackHint(계열): 면접안내(p15) 명시 인문계/자연계 리스트로 분류, 전사 토큰 검증 통과

## 판단
- **텍스트-우선 채택**: 고려대처럼 인라인 표 구조 PDF는 무료 텍스트 경로로 처리.
- **Vision 폴백 유지**: ① 스캔본(텍스트 안 나옴) ② 체크섬 검증 실패 ③ SNU처럼 반영비율이 인라인 아닌 별도 점수표(7개 중 SNU만 인라인 패턴 0).
- 7개 PDF 전부 텍스트 기반 확인 → 6개(고려대 포함)는 무료 경로 유력, SNU는 Vision(완료).

## 파일
- `korea.txt` — pdftotext -layout 추출 원본
- `build-korea.py` — 구조화 빌더 (이중 체크섬 검증 내장)
- `validate-schema.ts` — Zod 스키마 검증
- `korea-text.json` — 최종 결과 (meta+result)
