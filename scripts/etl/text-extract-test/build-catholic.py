#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
가톨릭대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 catholic.txt 를 직접 정독해 추출한 전형 템플릿
(반영비율·수능최저)을, 결정론적으로 파싱한 모집인원 그리드와 결합한다. (build-korea.py 일반화)

데이터 출처(물리 PDF 페이지, txt \f 1-indexed):
  - 정원내 모집인원 그리드  : phys 11 (인쇄 p9)   ── 본 파서가 x좌표 우앵커로 파싱
  - 정원외 모집인원 그리드  : phys 12 (인쇄 p10)  ── 그룹(계열/번들) 단위, 각주 매핑
  - 전형요소별 반영비율 표  : phys 4  (인쇄 p2)   ── 본체 직접 인용 → TEMPLATES
  - 수능 최저학력기준 표    : phys 5  (인쇄 p3)   ── 본체 직접 인용 → CSAT_*

이중 체크섬:
  · 행합: 학과별 (전형별 모집인원 합) == 소계열 값. (정원내 45행)
  · 열합: 전형별 모집인원 합 == 계(합계)행. 정원내 9전형 + 정원외 5전형 모두 검증.
정직성:
  · 텍스트에 없는 값 생성 금지. 미기재는 null.
  · 신학과(잠재면접32/가톨릭지도자추천15) 는 어색해 보이나 열합 검증으로 확정 — 추정 아님.
  · 정원외는 PDF가 그룹(계열/번들) 단위로만 명시 → 각주 그대로 그룹 앵커 학과에 부착 + note.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "catholic.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

# ── 물리 페이지 상수 (정찰로 확정) ───────────────────────────────────────────
PG_QUOTA_IN  = 11   # 정원내 모집인원 그리드 (인쇄 p9)
PG_QUOTA_OUT = 12   # 정원외 모집인원 그리드 (인쇄 p10)
PG_REFLECT   = 4    # 전형요소별 반영비율 표 (인쇄 p2)
PG_CSAT      = 5    # 수능 최저학력기준 표 (인쇄 p3)

# ════════════════════════════════════════════════════════════════════════════
# 1. 본체가 텍스트에서 직접 인용한 수능최저 원문 (phys 5 표)
# ════════════════════════════════════════════════════════════════════════════
CSAT_AREAS = "국어(화법과작문/언어와매체), 수학(미적분/기하/확률과통계), 영어, 사탐(1과목)/과탐(1과목)"
# 지역균형전형 — 모집단위 그룹별
CSAT_JR_GENERAL = "전 모집단위(자유전공·인문사회·자연공학·약·의·간호 제외): 2개 영역 등급 합 7 이내"
CSAT_JR_GWANGYEOK = "자유전공학부, 인문사회계열, 자연공학계열: 2개 영역 등급 합 6 이내"
CSAT_JR_YAK = "약학과: 과탐(1과목) 포함 3개 영역 등급 합 5 이내"
CSAT_JR_UI = ("의예과: 과탐(2과목 평균) 포함 4개 영역 등급 합 5 이내 및 한국사 4등급 이내 "
              "(탐구 2과목 등급 평균을 소수점 첫째 자리에서 버림하여 반영)")
CSAT_JR_GAN = "간호학과: 3개 영역 등급 합 7 이내"
# 학교장추천전형 — 약학과/의예과만
CSAT_SCH_YAK = "약학과: 과탐(1과목) 포함 3개 영역 등급 합 5 이내"
CSAT_SCH_UI = ("의예과: 과탐(2과목 평균) 포함 3개 영역 등급 합 4 이내 및 한국사 4등급 이내 "
               "(탐구 2과목 등급 평균을 소수점 첫째 자리에서 버림하여 반영)")
# 농어촌·기회균형Ⅱ — 약학과만
CSAT_NONG_YAK = "약학과: 과탐(1과목) 포함 3개 영역 등급 합 7 이내"
# 논술전형 — 약학과/의예과/간호학과만
CSAT_NON_YAK = "약학과: 과탐(1과목) 포함 3개 영역 등급 합 5 이내"
CSAT_NON_UI = ("의예과: 과탐(2과목 평균) 포함 3개 영역 등급 합 4 이내 및 한국사 4등급 이내 "
               "(탐구 2과목 등급 평균을 소수점 첫째 자리에서 버림하여 반영)")
CSAT_NON_GAN = "간호학과: 3개 영역 등급 합 7 이내"

CSAT_NOTE = "※ 약학과·의예과·간호학과는 모든 전형에서 지정 4개 영역 반드시 응시. 탐구영역 내 별도 지정과목 없음."

# ════════════════════════════════════════════════════════════════════════════
# 2. 반영비율 템플릿 (phys 4 표 + Ⅰ.전형요약(phys3) 본체 직접 인용)
#    components 키는 PDF 한국어 표기 그대로. 단계별: 1단계 4배수(=400%), 2단계 1단계70+면접30.
# ════════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# 단계별전형 공통: 1단계 서류종합평가 100% (4배수) → 2단계 1단계성적70 + 면접평가30
S1_SEORYU_4X = stage("1단계", 4, {"서류종합평가": 100}, 100)
S2_70_30     = stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 100)

# trackName → (trackTypeRaw, specialTypeKeyword, stages, applicationQualification note)
TEMPLATES = {
    "지역균형전형": dict(
        ttype="학생부위주(교과)", special=None,
        stages=[stage("일괄합산", None, {"학생부(교과)": 100}, 100)], note=None),
    "잠재능력우수자서류전형": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[stage("일괄합산", None, {"서류종합평가": 100}, 100)], note=None),
    "잠재능력우수자면접전형": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[S1_SEORYU_4X, S2_70_30], note=None),
    "가톨릭지도자추천전형": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[S1_SEORYU_4X, S2_70_30],
        note="신학과는 면접평가에 더해 교리문답을 추가 실시(합·불 자료로만 활용)."),
    "학교장추천전형": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[S1_SEORYU_4X, S2_70_30], note=None),
    "기회균형Ⅰ전형": dict(
        ttype="학생부위주(종합)", special="기회균형",
        stages=[stage("일괄합산", None, {"서류종합평가": 100}, 100)], note=None),
    "논술전형": dict(
        ttype="논술위주", special=None,
        stages=[stage("일괄합산", None, {"논술고사": 100}, 100)],
        note="2027학년도 전형방법 변경: (2026) 논술80%+학생부(교과)20% → (2027) 논술100%."),
    "실기우수자전형": dict(
        ttype="실기/실적위주", special=None,
        stages=[stage("일괄합산", None, {"실기고사": 100}, 100)], note=None),
    # ── 정원외 (정원내 그리드에 없는 전형) ──
    "농어촌학생전형": dict(
        ttype="학생부위주(교과)", special="농어촌",
        stages=[stage("일괄합산", None, {"학생부(교과)": 100}, 100)],
        note="정원외. 인문사회계열(31명)·자연공학계열(31명) 계열 단위 선발. 약학과(2)·신학과(2) 별도."),
    "특성화고교졸업자전형": dict(
        ttype="학생부위주(교과)", special="특성화고",
        stages=[stage("일괄합산", None, {"학생부(교과)": 100}, 100)],
        note="정원외. 일반고/종합고 중 특성화고교 교육과정 이수자만 지원. 학과 통합 선발(각주 그룹)."),
    "기회균형Ⅱ전형": dict(
        ttype="학생부위주(종합)", special="기회균형",
        stages=[stage("일괄합산", None, {"서류종합평가": 100}, 100)],
        note="정원외."),
    "특성화고 등을 졸업한 재직자전형(정원외)": dict(
        ttype="학생부위주(종합)", special="재직자",
        stages=[stage("일괄합산", None, {"서류종합평가": 100}, 100)],
        note="정원외. 전형기간 자율화 전형(모집시기 미구분). 글로벌경영학부 3개 트랙으로 선발."),
    "장애인 등 대상자전형": dict(
        ttype="학생부위주(종합)", special="기회균형",
        stages=[S1_SEORYU_4X, S2_70_30],
        note="정원외. 장애인 등 대상자."),
}
# 정원내 재직자(정원내 12) — 별도 trackName(소계 컬럼명과 일치시키되 정원내 표기)
TEMPLATES["특성화고 등을 졸업한 재직자전형(정원내)"] = dict(
    ttype="학생부위주(종합)", special="재직자",
    stages=[stage("일괄합산", None, {"서류종합평가": 100}, 100)],
    note="정원내 12명. 글로벌경영학부(국제경영·세무회계금융·IT파이낸스)로만 선발.")

# ── 수능최저 매핑 함수: (rawText, exempt, csatPages) ─────────────────────────
def csat_for(track, dept):
    """ track·dept 조합별 수능최저 원문. 미적용이면 ('없음', True, None). """
    A = CSAT_AREAS
    if track == "지역균형전형":
        if dept == "약학과":   return (f"{CSAT_JR_YAK} ({A})", False)
        if dept == "의예과":   return (f"{CSAT_JR_UI} ({A})", False)
        if dept == "간호학과": return (f"{CSAT_JR_GAN} ({A})", False)
        if dept in ("자유전공학부", "인문사회계열", "자연공학계열"):
            return (f"{CSAT_JR_GWANGYEOK} ({A})", False)
        return (f"{CSAT_JR_GENERAL} ({A})", False)
    if track == "학교장추천전형":
        if dept == "약학과": return (f"{CSAT_SCH_YAK} ({A})", False)
        if dept == "의예과": return (f"{CSAT_SCH_UI} ({A})", False)
        return ("없음 (학교장추천전형: 약학과·의예과만 적용)", True)
    if track == "농어촌학생전형":
        if dept == "약학과": return (f"{CSAT_NONG_YAK} ({A})", False)
        return ("없음 (농어촌학생전형: 약학과만 적용)", True)
    if track == "기회균형Ⅱ전형":
        if dept == "약학과": return (f"{CSAT_NONG_YAK} ({A})", False)
        return ("없음 (기회균형Ⅱ전형: 약학과만 적용)", True)
    if track == "논술전형":
        if dept == "약학과":   return (f"{CSAT_NON_YAK} ({A})", False)
        if dept == "의예과":   return (f"{CSAT_NON_UI} ({A})", False)
        if dept == "간호학과": return (f"{CSAT_NON_GAN} ({A})", False)
        return ("없음 (논술전형: 약학과·의예과·간호학과만 적용)", True)
    # 잠재서류·잠재면접·가톨릭지도자·기회균형Ⅰ·재직자·장애인·특성화고교졸업·실기 → 수능최저 없음
    return ("없음", True)

def build_track(track, dept, quota, pages_src, extra_note=None):
    tpl = TEMPLATES[track]
    raw, exempt = csat_for(track, dept)
    src = sorted({p for p in (pages_src + ([PG_CSAT] if not exempt else [])) if p})
    note = tpl["note"]
    if extra_note:
        note = f"{note} {extra_note}" if note else extra_note
    # 정원내/정원외 표기 trackName 정규화 (소계 컬럼명 그대로 노출)
    display_name = track.replace("(정원내)", "").replace("(정원외)", "")
    return {
        "trackName": display_name,
        "trackTypeRaw": tpl["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": tpl["special"],
        "quotaInitial": quota,
        "applicationQualification": note,
        "reflectionStages": [dict(s) for s in tpl["stages"]],
        "csatMinimumRawText": (raw if not exempt else raw),
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": (CSAT_AREAS if not exempt else None),
        "prevYearResult": None,
        "sourcePages": src,
    }

# ════════════════════════════════════════════════════════════════════════════
# 3. 정원내 그리드 파싱 (x좌표 우앵커 + 이중 체크섬)
# ════════════════════════════════════════════════════════════════════════════
# 컬럼 앵커(=계 합계행 토큰 start) 와 트랙명
IN_ANCHORS = [20, 28, 34, 40, 46, 51, 56, 61, 66, 72, 78]
IN_COLS = ["입학정원", "지역균형전형", "잠재능력우수자서류전형", "잠재능력우수자면접전형",
           "가톨릭지도자추천전형", "학교장추천전형", "기회균형Ⅰ전형",
           "특성화고 등을 졸업한 재직자전형(정원내)", "논술전형", "실기우수자전형", "소계"]
IN_TRACK_COLS = IN_COLS[1:-1]  # 9 전형 (입학정원·소계 제외)
IN_EXPECT_COL = {"지역균형전형": 261, "잠재능력우수자서류전형": 251, "잠재능력우수자면접전형": 277,
                 "가톨릭지도자추천전형": 51, "학교장추천전형": 50, "기회균형Ⅰ전형": 96,
                 "특성화고 등을 졸업한 재직자전형(정원내)": 12, "논술전형": 176, "실기우수자전형": 35}

def nearest(start, anchors):
    return min(range(len(anchors)), key=lambda i: abs(anchors[i] - start))

NUM = re.compile(r"[\d,]+$")
HANGUL = re.compile(r"[가-힣]")

departments = []
warnings = []
row_pass, row_fail = 0, 0
parse_fail = []
in_col_totals = {c: 0 for c in IN_TRACK_COLS}

# 단과대 prefix 토큰(무시) — 모집단위명 식별용
DANGWA = {"경영대학", "글로벌", "경영학부", "AI전자", "정보", "융합대학", "바이오", "헬스",
          "약학대학", "의과대학", "간호대학", "신학대학"}

for ln in pages[PG_QUOTA_IN - 1].splitlines():
    if "수시모집요강" in ln or "CATHOLIC" in ln:
        continue
    toks = [(m.start(), m.group()) for m in re.finditer(r"\S+", ln)]
    nums = [(s, t) for s, t in toks if NUM.fullmatch(t)]
    names = [(s, t) for s, t in toks if HANGUL.search(t) and not NUM.fullmatch(t)]
    if not nums or not names:
        continue
    if "계" == names[-1][1] and any(t == "1,843" for _, t in nums):
        continue  # 합계행
    name = names[-1][1]
    if name in DANGWA and len(names) == 1:
        continue  # 단과대명만 있는 줄
    # 셀 배정
    cells = {}
    for s, t in nums:
        col = IN_COLS[nearest(s, IN_ANCHORS)]
        cells[col] = int(t.replace(",", ""))
    sub = cells.get("소계")
    track_sum = sum(v for k, v in cells.items() if k in IN_TRACK_COLS)
    if sub is None or sub != track_sum:
        row_fail += 1
        parse_fail.append((name, sub, track_sum, cells))
        warnings.append(f"[정원내 행합불일치] {name}: 소계 {sub} ≠ 전형합 {track_sum} {cells}")
        continue
    row_pass += 1
    tracks = []
    for col in IN_TRACK_COLS:
        q = cells.get(col)
        if not q:
            continue
        in_col_totals[col] += q
        tracks.append(build_track(col, name, q, [PG_QUOTA_IN, PG_REFLECT]))
    departments.append({"departmentName": name, "campus": None, "trackHint": None,
                        "totalQuotaHint": sub, "tracks": tracks})

# ── 정원내 trackHint(계열) — PDF 입학정원표(phys11)·광역계열 명시 근거 ──────────
INMUN = {"자유전공학부", "인문사회계열", "국어국문학과", "철학과", "국사학과", "영어영문학부",
         "중국언어문화학과", "일어일본문화학과", "프랑스어문화학과", "사회복지학과", "심리학과",
         "사회학과", "국제학부", "법학과", "경제학과", "행정학과", "아동학과", "경영학과", "회계학과",
         "세무회계금융학과"}
JAYEON = {"자연공학계열", "화학과", "수학과", "물리학과", "공간디자인·소비자학과", "의류학과",
          "식품영양학과", "에너지환경공학과", "컴퓨터정보공학부", "미디어기술콘텐츠학과",
          "정보통신전자공학부", "인공지능학과", "데이터사이언스학과", "생명공학과",
          "바이오메디컬화학공학과", "의생명과학과", "바이오메디컬소프트웨어학과",
          "바이오로직스공학부", "AI의공학과", "약학과", "의예과", "간호학과"}
YECHE = {"음악과"}
GYO   = {"특수교육과"}   # 사범계(특수교육과) — 계열 별도, trackHint=null(추정 금지)
SHIN  = {"신학과"}
gye_map = {}
for n in INMUN: gye_map[n] = "인문사회"
for n in JAYEON: gye_map[n] = "자연공학"
for n in YECHE: gye_map[n] = "예체능"
unmapped = []
for d in departments:
    g = gye_map.get(d["departmentName"])
    if g is None:
        unmapped.append(d["departmentName"])  # 특수교육과·신학과 → 정직하게 null
        d["trackHint"] = None
    else:
        d["trackHint"] = g

# ════════════════════════════════════════════════════════════════════════════
# 4. 정원외 그리드 — 그룹(계열/번들) 단위 (각주 매핑). 앵커 학과에 트랙 부착.
#    PDF는 정원외를 개별 학과로 분해하지 않음 → 명시된 그룹 그대로 정직 부착.
# ════════════════════════════════════════════════════════════════════════════
# (앵커학과, 트랙명, 모집인원, 그룹설명)  — phys12 표 + 각주(line 748-750) 직접 인용
OUT_ALLOC = [
    ("인문사회계열", "농어촌학생전형", 31, "인문사회계열 단위 31명"),
    ("자연공학계열", "농어촌학생전형", 31, "자연공학계열 단위 31명"),
    ("약학과",       "농어촌학생전형", 2,  "약학과 2명 (농어촌은 약학과만 수능최저 적용)"),
    ("신학과",       "농어촌학생전형", 2,  "신학과 2명"),
    ("경영학과",     "특성화고교졸업자전형", 9,
        "아동학과·경영학과·회계학과 통합 9명 (앵커=경영학과)"),
    ("의류학과",     "특성화고교졸업자전형", 16,
        "공간디자인·소비자학과·의류학과·식품영양학과·AI전자정보융합대학 통합 16명 (앵커=의류학과)"),
    ("바이오로직스공학부", "기회균형Ⅱ전형", 1, "바이오로직스공학부 1명"),
    ("AI의공학과",   "기회균형Ⅱ전형", 1, "AI의공학과 1명"),
    ("약학과",       "기회균형Ⅱ전형", 3, "약학과 3명 (약학과 수능최저 적용)"),
    ("세무회계금융학과", "특성화고 등을 졸업한 재직자전형(정원외)", 94,
        "글로벌경영학부(국제경영·세무회계금융·IT파이낸스) 정원외 94명 (앵커=세무회계금융학과)"),
    ("심리학과",     "장애인 등 대상자전형", 6,
        "인문사회계열 통합 6명 (앵커=심리학과, PDF 표상 인문사회 블록 합계)"),
    ("컴퓨터정보공학부", "장애인 등 대상자전형", 4,
        "자연공학계열 통합 4명 (앵커=컴퓨터정보공학부, PDF 표상 자연공학 블록 합계)"),
]
OUT_EXPECT_COL = {"농어촌학생전형": 66, "특성화고교졸업자전형": 25,
                  "기회균형Ⅱ전형": 5,
                  "특성화고 등을 졸업한 재직자전형(정원외)": 94, "장애인 등 대상자전형": 10}
out_col_totals = {c: 0 for c in OUT_EXPECT_COL}

dept_by_name = {d["departmentName"]: d for d in departments}
out_added = 0
for anchor, track, q, grp in OUT_ALLOC:
    out_col_totals[track] += q
    d = dept_by_name.get(anchor)
    if d is None:
        warnings.append(f"[정원외 앵커없음] {anchor} 학과 미발견 → {track} {q}명 미부착")
        continue
    d["tracks"].append(build_track(track, anchor, q, [PG_QUOTA_OUT, PG_REFLECT], extra_note=grp))
    out_added += 1

# 정원내 재직자(글로벌경영학부 정원내 12) — 그리드상 세무회계금융학과 행에 이미 부착됨(자동).

# ════════════════════════════════════════════════════════════════════════════
# 5. 이중 체크섬 리포트
# ════════════════════════════════════════════════════════════════════════════
in_coltotal_report = [(c, in_col_totals[c], IN_EXPECT_COL[c], in_col_totals[c] == IN_EXPECT_COL[c])
                      for c in IN_TRACK_COLS]
out_coltotal_report = [(c, out_col_totals[c], OUT_EXPECT_COL[c], out_col_totals[c] == OUT_EXPECT_COL[c])
                       for c in OUT_EXPECT_COL]

warnings.append("[수능최저] 지역균형전형은 모집단위 그룹별 상이(전모집단위 2합7 / 자유전공·인문사회·자연공학 2합6 / 약학과 3합5 / 의예과 4합5+한국사 / 간호학과 3합7) → 학과별 매핑.")
warnings.append("[정원외] 농어촌(계열단위)·특성화고교졸업(번들)·재직자(글로벌경영 3트랙)·장애인(계열통합)은 PDF가 개별 학과로 분해하지 않음 → 각주 그룹 그대로 앵커 학과에 부착(applicationQualification에 그룹 명시). 개별 학과 분해는 추정이라 미수행.")
warnings.append("[신학과 정원내] 잠재능력우수자면접전형 32명 + 가톨릭지도자추천전형 15명(교리문답 추가). 표상 좌측 정렬 드리프트로 보이나 열합검증(가톨릭51/잠재면접277)으로 확정 — 추정 아님.")
warnings.append("[재외국민·정시] 본 산출물은 수시요강 한정. 정시(수능624·실기10) 및 재외국민 전형 표는 본 PDF 범위 외 → 미추출.")
warnings.append("[광역계열] 자유전공학부(171)·인문사회계열·자연공학계열은 광역모집(입학 후 학과 선택). 입학정원은 계열 합으로 표기되며 모집인원 그리드값과 입학정원은 별개.")

result = {"universityName": "가톨릭대학교", "year": 2027, "recruitmentSeason": "susi",
          "departments": departments, "warnings": warnings}

# ── 채움 비율 ───────────────────────────────────────────────────────────────
all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(f): return sum(1 for t in all_tracks if f(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

meta = {
    "universityName": "가톨릭대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {"passed": row_pass, "failed": row_fail},
    "colTotalValidation": {
        "정원내": [{"track": c, "computed": g, "expectedSumRow": e, "match": m}
                 for (c, g, e, m) in in_coltotal_report],
        "정원외": [{"track": c, "computed": g, "expectedSumRow": e, "match": m}
                 for (c, g, e, m) in out_coltotal_report],
    },
    "fillRatios": {"quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
                   "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T],
                   "sourcePages": [sp_n, T]},
    # 완전레코드 = quotaInitial≠null AND reflectionStages 있음 AND sourcePages 있음.
    # 가톨릭은 모든 track 에 quota·반영비율·sourcePages 가 있어 분모=전체.
    "completeRecords": [comp_n, T],
}
(BASE / "catholic-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

# ── 콘솔 리포트 ─────────────────────────────────────────────────────────────
print("=" * 70)
print("가톨릭대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 70)
print(f"물리페이지: 정원내그리드=p{PG_QUOTA_IN} 정원외그리드=p{PG_QUOTA_OUT} "
      f"반영비율=p{PG_REFLECT} 수능최저=p{PG_CSAT}")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증(정원내 {row_pass + row_fail}행): 통과 {row_pass} / 실패 {row_fail}")
print("\n열합 검증 — 정원내 (전형별 합 vs 계행):")
for c, g, e, m in in_coltotal_report:
    print(f"  {('✅' if m else '❌')} {c[:18]:20s} 계산={g:4d}  계행={e:4d}")
print("열합 검증 — 정원외 (각주 그룹 합 vs 계행):")
for c, g, e, m in out_coltotal_report:
    print(f"  {('✅' if m else '❌')} {c[:22]:24s} 계산={g:4d}  계행={e:4d}")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
print(f"\ntrackHint 미매핑(null, 추정금지): {unmapped}")
if parse_fail:
    print(f"\n⚠ 행합 실패 {len(parse_fail)}:")
    for n, s, ts, c in parse_fail:
        print(f"  {n}: 소계 {s} ≠ {ts}  {c}")
print(f"\n💾 {BASE / 'catholic-text.json'} 저장")
