#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
서울대 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

기존 비전(vision-snu-v1, 14학과)을 텍스트추출로 대체·보강. Vision API 미사용.
Claude Code 본체가 snu.txt 를 읽고 추출한 전형 평가방법(반영비율·수능최저)을
결정론적으로 파싱한 모집인원 그리드(p9~11)와 결합한다.

전형 구조(서울대 수시 = 학생부종합 중심):
  1) 지역균형전형        — 전 모집단위 1단계 서류100(3배수)→2단계 1단계성적70+면접30, 수능최저 3합7
  2) 일반전형(음대 제외)  — 1단계 서류100(2배수)→2단계 1단계성적100+면접및구술100, 수능최저 미적용
       · 사범대학        → 2단계 1단계성적100+면접및구술60+교직적성·인성40
       · 미술대학 디자인과 → 2단계 면접및구술100, 수능최저 3합7 적용
  3) 일반전형 음악대학    — 피아노/관현악: 실기위주(1단계 실기100(2.5배수)→서류50+실기50)
                          국악과: 학생부종합(1단계 서류50+실기50(2.5배수)→서류50+실기40+면접10)
  4) 기회균형특별전형(사회통합) — 1단계 서류100(2배수)→2단계 1단계성적70+면접30, 수능최저 미적용
       · 미술대학        → 2단계 1단계성적40+실기30+면접30 (디자인과: 면접100)
       · 음악대학        → 2단계 1단계성적50+실기40+면접10

정직성:
  - 모집인원 그리드: 행합(지균+일반+기회=합계) + 열합(전형별 합=523/1,529/181 정원내) 이중 검증.
  - 반영비율·수능최저: snu.txt 의 명시 표(p18·24·35·44·붙임1)에서 본체가 인용 (추정 X).
  - 기회균형 농생대 정원외 4명은 특정 학과 귀속 아님 → 미반영(정원내 181만).
  - 매핑/계열은 load-admissions 가 DB 대조로 처리.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "snu.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

# ── 단과대학(college) 토큰 — 모집단위 행의 선두 접두로 등장(병합셀) ──────────
COLLEGES = {
    "학부대학", "인문대학", "사회과학대학", "자연과학대학", "간호대학", "경영대학",
    "공과대학", "농업생명과학대학", "미술대학", "사범대학", "생활과학대학",
    "수의과대학", "약학대학", "음악대학", "의과대학", "치의학대학원",
}
# 간호대학·경영대학은 그 자체가 모집단위 → 단독 토큰일 때는 보존(접두일 때만 제거)

# ── 템플릿용 모집단위 분류(평가방법 분기) ────────────────────────────────────
SABEOM = {"교육학과", "국어교육과", "영어교육과", "독어교육과", "불어교육과", "사회교육과",
          "역사교육과", "지리교육과", "윤리교육과", "수학교육과", "물리교육과", "화학교육과",
          "생물교육과", "지구과학교육과", "체육교육과"}
MISULDAE = {"동양화과", "서양화과", "조소과", "공예과", "디자인과"}
EUMAK_SILGI = {"피아노과", "관현악과"}    # 일반전형 = 실기위주
EUMAK_JONGHAP = {"국악과"}              # 일반전형 = 학생부종합
EUMAKDAE = {"성악과", "작곡과", "음악학과"} | EUMAK_SILGI | EUMAK_JONGHAP

# ── PDF 리프 전공명 → DB 정규 부모접두형(active) 정렬 (DB 무변경; 매칭률·정확도↑) ──
NAME_ALIAS = {
    "물리학전공": "물리·천문학부(물리학전공)",
    "천문학전공": "물리·천문학부(천문학전공)",
    "소비자학전공": "소비자아동학부(소비자학전공)",
    "아동가족학전공": "소비자아동학부(아동가족학전공)",
}

# ── 수능최저 / 응시영역 원문(본체가 PDF 에서 인용) ──────────────────────────
CSAT_3HAB7 = "4개 영역(국어, 수학, 영어, 탐구) 중 3개 영역 등급 합이 7등급 이내 (탐구영역은 2개 과목 등급 평균 반영)"
CSAT_AREAS = "국어, 수학, 영어, 한국사, 탐구(사회/과학 구분 없이 택2; 자연계 모집단위는 과학탐구 응시기준 적용). 모집단위별 수능 응시영역기준은 붙임1(50~51쪽) 참고."

# ── stage 헬퍼 ──────────────────────────────────────────────────────────────
def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

GRID_PAGES = {9: 5, 10: 6, 11: 7}  # 물리→인쇄(참고용)

def make_track(track_name, type_raw, special_kw, quota, stages,
               csat_raw, csat_exempt, src_pages, app_qual=None):
    return {
        "trackName": track_name, "trackTypeRaw": type_raw, "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special_kw, "quotaInitial": quota,
        "applicationQualification": app_qual,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": csat_raw, "csatMinimumExempt": csat_exempt,
        "csatRequiredAreasRawText": (CSAT_AREAS if not csat_exempt else None),
        "prevYearResult": None, "sourcePages": src_pages,
    }

# ── 전형별 track 빌더 ────────────────────────────────────────────────────────
def t_jiyun(name, q, gp):
    """지역균형전형 — 전 모집단위 동일(70/30) + 수능최저 3합7."""
    stages = [stage("1단계", 3, {"서류평가": 100}, 100),
              stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 100)]
    return make_track("지역균형전형", "학생부위주(종합)", None, q, stages,
                      CSAT_3HAB7, False, sorted({gp, 18, 19, 20, 54}),
                      app_qual="소속 고등학교장 추천(고교별 2명 이내), 2027년 2월 국내 고교 졸업예정자")

def t_ilban(name, q, gp):
    """일반전형(음대 제외) — 학과별 평가방법 분기. 수능최저 미적용(디자인과 제외)."""
    if name in SABEOM:
        stages = [stage("1단계", 2, {"서류평가": 100}, 100),
                  stage("2단계", None, {"1단계 성적": 100, "면접 및 구술고사": 60, "교직적성·인성면접": 40}, 200)]
        return make_track("일반전형", "학생부위주(종합)", None, q, stages, None, True, sorted({gp, 24, 25}))
    if name == "디자인과":
        stages = [stage("1단계", 2, {"서류평가": 100}, 100),
                  stage("2단계", None, {"면접 및 구술고사": 100}, 100)]
        return make_track("일반전형", "학생부위주(종합)", None, q, stages,
                          CSAT_3HAB7, False, sorted({gp, 24, 54}))
    if name in EUMAK_SILGI:
        stages = [stage("1단계", 2.5, {"실기평가": 100}, 100),
                  stage("2단계", None, {"서류평가": 50, "실기평가": 50}, 100)]
        return make_track("일반전형", "실기/실적위주", None, q, stages, None, True, sorted({gp, 35, 36}))
    if name in EUMAK_JONGHAP:
        stages = [stage("1단계", 2.5, {"서류평가": 50, "실기평가": 50}, 100),
                  stage("2단계", None, {"1단계 서류평가": 50, "실기평가": 40, "면접 및 구술고사": 10}, 100)]
        return make_track("일반전형", "학생부위주(종합)", None, q, stages, None, True, sorted({gp, 35, 36}))
    # 기본 — 전 모집단위
    stages = [stage("1단계", 2, {"서류평가": 100}, 100),
              stage("2단계", None, {"1단계 성적": 100, "면접 및 구술고사": 100}, 200)]
    return make_track("일반전형", "학생부위주(종합)", None, q, stages, None, True, sorted({gp, 24, 25}))

def t_gihoe(name, q, gp):
    """기회균형특별전형(사회통합) — 학과별 분기. 수능최저 미적용."""
    if name == "디자인과":
        stages = [stage("1단계", 3, {"서류평가": 100}, 100),
                  stage("2단계", None, {"면접": 100}, 100)]
    elif name in MISULDAE:
        stages = [stage("1단계", 3, {"서류평가": 100}, 100),
                  stage("2단계", None, {"1단계 성적": 40, "실기평가": 30, "면접": 30}, 100)]
    elif name in EUMAKDAE:
        stages = [stage("1단계", 3, {"서류평가": 100}, 100),
                  stage("2단계", None, {"1단계 성적": 50, "실기평가": 40, "면접": 10}, 100)]
    else:
        stages = [stage("1단계", 2, {"서류평가": 100}, 100),
                  stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 100)]
    return make_track("기회균형특별전형(사회통합)", "학생부위주(종합)", "기회균형", q, stages,
                      None, True, sorted({gp, 44, 45}))

# ── 모집인원 그리드 파싱 ──────────────────────────────────────────────────────
CELL = re.compile(r'[\d,]+(?:\([\d²) ]*\))?|[·․‧・･.]')
def is_cell(tok):
    return bool(re.fullmatch(r'[\d,]+(?:\([\d²)]*\))?|[·․‧・･.]', tok))

def cell_val(tok):
    """셀 → 정수(정원내) 또는 None. 괄호(정원외)·콤마 제거, 선두 정수만."""
    m = re.match(r'(\d[\d,]*)', tok)
    return int(m.group(1).replace(",", "")) if m else None

SKIP_NAMES = {"소계", "합계", "광역"}

departments = []
col_jiyun = col_ilban = col_gihoe = 0
rowsum_fail = []
seen = {}

for pidx in (9, 10, 11):
    for line in pages[pidx - 1].splitlines():
        tk = line.split()
        if len(tk) < 5:
            continue
        cells = tk[-4:]
        if not all(is_cell(c) for c in cells):
            continue
        if all(is_cell(c) for c in tk):   # 셀만 있는 라인(머리글 잔여) 제외
            continue
        name_tokens = tk[:-4]
        # 선두 단과대 토큰 제거(접두일 때만; 단독 모집단위면 보존)
        head = re.sub(r'\d+\)$', '', name_tokens[0])  # '음악대학3)'→'음악대학'
        if len(name_tokens) > 1 and head in COLLEGES:
            name_tokens = name_tokens[1:]
        name = re.sub(r'\d+\)$', '', "".join(name_tokens)).strip()
        if not name or name in SKIP_NAMES:
            continue
        jy, il, gh, tot = (cell_val(c) for c in cells)
        jy, il, gh = (jy or 0), (il or 0), (gh or 0)
        if jy == 0 and il == 0 and gh == 0:
            continue  # 광역/음악학과 등 빈 행
        # 행합 검증(정원내; 정원외 괄호분은 합계에서 제외되므로 tot 도 선두정수)
        tot_in = tot or 0
        if jy + il + gh != tot_in:
            rowsum_fail.append((pidx, name, jy, il, gh, tot_in))
        if name in seen:
            continue  # 중복 방어
        seen[name] = True
        col_jiyun += jy; col_ilban += il; col_gihoe += gh

        tracks = []
        if jy > 0:
            tracks.append(t_jiyun(name, jy, pidx))
        if il > 0:
            tracks.append(t_ilban(name, il, pidx))
        if gh > 0:
            tracks.append(t_gihoe(name, gh, pidx))
        departments.append({"departmentName": NAME_ALIAS.get(name, name), "campus": None, "trackHint": None,
                            "totalQuotaHint": tot_in, "tracks": tracks})

# ── 검증: 열합 vs 합계행(정원내 523 / 1,529 / 181) ───────────────────────────
EXPECTED = {"지역균형": 523, "일반": 1529, "기회균형": 181}
col_report = [
    ("지역균형전형", col_jiyun, EXPECTED["지역균형"], col_jiyun == EXPECTED["지역균형"]),
    ("일반전형", col_ilban, EXPECTED["일반"], col_ilban == EXPECTED["일반"]),
    ("기회균형특별(정원내)", col_gihoe, EXPECTED["기회균형"], col_gihoe == EXPECTED["기회균형"]),
]

warnings = [
    "[모집인원] p9~11 정원 내 전형 그리드(지역균형/일반/기회균형특별(사회통합)). 행합·열합 이중검증.",
    "[기회균형] 농업생명과학대학 농생명계열 정원외 4명은 특정 학과 귀속이 아니라 별도 선발 → 미반영(정원내 181만).",
    "[음악대학] 일반전형 피아노과·관현악과=실기위주전형, 국악과=학생부종합전형. 성악·작곡·음악학과는 일반전형 미실시(기회균형만).",
    "[수능최저] 지역균형전형 전 모집단위 3합7 적용 / 일반전형은 미적용(미술대학 디자인과만 3합7) / 기회균형·음악대학 미적용.",
    "[의과대학] 2027학년도부터 통합 6년제. 치의학과는 치의학대학원(학·석사 통합과정).",
    "[광역·전공예약] 인문대학 일반전형 전 모집단위·지역균형 역사학부는 전공예약 선발. 인문계열(지역균형 광역)·자유전공학부 등 광역 모집단위 포함.",
    "[학과명 정렬] 물리학전공·천문학전공·소비자학전공·아동가족학전공은 DB 정규 부모접두형(물리·천문학부(…)/소비자아동학부(…))으로 정렬해 active 학과에 부착(NAME_ALIAS).",
    "[DB 미수록] 독어독문·노어노문·종교·조선해양공학·농경제사회·조소·독어교육·조경지역시스템 등은 departments 베이스라인 공백 → load 시 매핑실패 SKIP. 건설환경도시공학부는 DB '건설환경공학부' 개명건. 거점국립 reconciliation 후속.",
]
if rowsum_fail:
    warnings.append(f"[행합불일치] {len(rowsum_fail)}건: " +
                    "; ".join(f"{n}(p{p}) {j}+{i}+{g}≠{t}" for p, n, j, i, g, t in rowsum_fail))

result = {"universityName": "서울대학교", "year": 2027, "recruitmentSeason": "susi",
          "departments": departments, "warnings": warnings}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(c): return sum(1 for t in all_tracks if c(t))
q_n = cnt(lambda t: t["quotaInitial"] is not None and t["quotaInitial"] > 0)
r_n = cnt(lambda t: t["reflectionStages"])
c_n = cnt(lambda t: t["csatMinimumRawText"] is not None)
comp_n = cnt(lambda t: t["quotaInitial"] and t["reflectionStages"] and t["sourcePages"])

# 체크섬 게이트(P1-3): 행합 전부 통과 + 모든 열합 일치여야 적재 허용. load-admissions 가 참조.
checksum_passed = (len(rowsum_fail) == 0) and all(m for (_, _, _, m) in col_report)
meta = {
    "universityName": "서울대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용; vision-snu-v1 대체)",
    "visionCost": 0.0, "departments": len(departments), "totalTracks": T,
    "checksumPassed": checksum_passed,
    "rowSumValidation": {"passed": len(departments) - len(rowsum_fail), "failed": len(rowsum_fail)},
    "colTotalValidation": [{"track": n, "computed": g, "expectedSumRow": e, "match": m}
                           for (n, g, e, m) in col_report],
    "fillRatios": {"quotaInitial": [q_n, T], "reflectionStages": [r_n, T], "csatMinimumRawText": [c_n, T]},
    "completeRecords": [comp_n, T],
}
(BASE / "snu-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

print("=" * 68)
print("서울대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 68)
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증: 통과 {len(departments) - len(rowsum_fail)} / 실패 {len(rowsum_fail)}")
print("\n열합 검증 (전형별 모집인원 합 vs 합계행 523/1,529/181 정원내):")
for n, g, e, m in col_report:
    print(f"  {n:18s} 계산={g:4d}  합계행={e:4d}  {'✅' if m else '❌'}")
print(f"\n채움 비율 ({T}전형): quota={q_n}/{T}  reflection={r_n}/{T}  csat명시={c_n}/{T}  완전={comp_n}/{T}")
if rowsum_fail:
    print(f"\n⚠ 행합 실패 {len(rowsum_fail)}:")
    for p, n, j, i, g, t in rowsum_fail:
        print(f"  p{p} {n}: {j}+{i}+{g} ≠ {t}")
print(f"\n💾 {BASE/'snu-text.json'} 저장")
