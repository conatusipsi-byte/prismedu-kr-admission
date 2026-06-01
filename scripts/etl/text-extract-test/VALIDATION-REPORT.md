# 7개 대학 모집요강 ETL — 검증 리포트 (2026-06-01)

텍스트 추출(무료, Vision/Console API 미사용) + conatus DB 적재. 재현:
`python3 scripts/etl/text-extract-test/central-verify.py` / `npx tsx scripts/etl/load-admissions.ts`(dry-run).

## 1. 추출·구조화 (작업 A·B)

| 대학 | id | 학과 | 전형 | 행합 | 열합 체크섬 | 완전레코드 | Zod | source |
|---|---|---:|---:|---|---|---|---|---|
| 고려대 | korea | 66 | 329 | 66/66 | 8/8 | 306/329(93%)¹ | ✅ | text_extract |
| 가톨릭 | kcue_0000046 | 45 | 221 | 45/45² | 14/14 | 221/221(100%) | ✅ | text_extract |
| 경희 | kcue_0000066 | 91 | 343 | 89/89³ | 7/7 | 341/343(99%) | ✅ | text_extract |
| 연세 | yonsei | 67 | 228 | N/A⁴ | 8/8 | 228/228(100%) | ✅ | text_extract |
| 울산 | kcue_0000158 | 17 | 111 | 17/17 | 15/15 | 111/111(100%) | ✅ | text_extract |
| 성균관 | sungkyunkwan | 56 | 161 | 56/56 | 12/12 | 161/161(100%) | ✅ | text_extract |
| 서울대 | snu | 15 | 41 | — | — | (기존 Vision) | ✅ | ai_vision |

¹ 고려대 23 null = 재직자 ◉(고정인원 아님), 정상.
² 가톨릭 정원내 그리드 45/45. **정원외 그룹 전형**(농어촌31·재직자94·특성화고16·장애인4 등)은 PDF가 학과별 미분해 → 앵커 학과 부착 + `applicationQualification` 그룹 명시. 열합 14/14가 권위 검증. ⚠ 정원외(specialType≠general) quota는 그룹 단위이므로 학과 단위 합격률 분석에서 신뢰 금지.
³ 경희 통합 그리드 병합셀로 위치파싱 불가 → 전형별 상세표 전사, grand-total + 변경표 교차검증. 2 null = 장애인 통합선발(고정인원 아님).
⁴ 연세 모집인원*에 정시 포함 → 행합 체크섬 불가, 열합 8/8 + 무충돌 배정으로 검증.

**반영비율·수능최저(체크섬 비대상) 표본 원문 대조**: 5개 대학 의예과 전부 일치 확인.

## 2. 변환·매핑·적재 (작업 D·E·F)

- **변환기** `scripts/etl/load-admissions.ts`: reflectionStages(한글키)→AdmissionStage(영문키, 미매핑 carryover키 보존), `csatMinimumRawText`→`finalizeMinReq()` 구조화, `mapAdigaToTrackKind()`→kind/available_track_kinds.
- csatMinimum 복잡도: simple_sum 238 / simple_avg 199 / with_required 15 / conditional 3 / custom 127. autoEvaluable true 437 / false 145(복잡·모호는 originalText 보존, 정직).
- **매핑**: 추출 357학과 → DB department_id. exact + 접두(prefix) 매칭(중간 부분문자열 오탐 방지). 동일 부모 학과의 인문/자연·세부전공 트랙 8건 병합.
- **적재**: 멱등 UPSERT(ON CONFLICT id). 331 row(text_extract 317 + ai_vision 14) + 미처리 시드 10 = DB 총 341.

### 매핑 실패 (18학과, FK 제약상 SKIP — 추정 오매칭 금지)
- 경희: 경영회계계열(광역), 한의예과(인문)·기계공학부·전자공학부 전자공학과·전자공학부 반도체공학과·지능형전자시스템학과(DB 명칭상이/신설), 장애인 통합선발 풀×2(pseudo)
- 연세: 모빌리티시스템전공·첨단약과학과(신설), 진리자유학부(인문)/(자연)(DB 미존재)
- 성균관: 전자전기정보공학부·배터리학과·바이오신약규제과학과·인공지능학과·글로벌AI융합학부(신설/개편)
- 서울대: 농업생명과학대학(단과대 pseudo)

→ 신설/개편 학과는 DB departments 추가 후 재적재, 또는 수동 매핑 필요. 정직하게 스킵·보고.

## 3. trackKind 검색 확장 (작업 G)

`search_admissions_v2` RPC (시드 16학과 → ):
susi_subject **282** · susi_comprehensive **310** · susi_essay **209** · susi_practical **28** ·
jeongsi_na 6(시드만, 수시 요강만 적재) · jaeoegukmin 0(재외국민 수시 제외).
da 보유 학과 총 **341**. (active=false 폐과 마킹 6학과는 검색 미노출 — 별도 활성화 필요.)

## 4. smoke (작업 H)
typecheck ✅ / test ✅×2 (815/815) / build ✅(exit 0) / lint ✅(경고만).

**비용 $0** (전부 무료 텍스트 경로, Claude Console/Vision API 미사용).
