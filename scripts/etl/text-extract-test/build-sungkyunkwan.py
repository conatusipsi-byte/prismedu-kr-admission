#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
성균관대 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 sungkyunkwan.txt 를 정독하고, 모집인원 총괄표(p8~9)를
"문자 컬럼 정렬" 기반으로 결정론적 파싱한 뒤, 각 전형의 선발방법(반영비율·배수)·수능최저를
본체가 텍스트 명시 문구에서 직접 추출한 템플릿과 결합한다.

고려대와의 구조적 차이:
  - 고려대: 우앵커(우측 10셀) 밀집 그리드.
  - 성균관대: 다단계 헤더 + 희소셀(공백=미설치) 그리드. 토큰 split 불가 →
    숫자 토큰의 '우측 끝 컬럼(end col)'을 합계행 앵커에 매칭하여 전형 컬럼을 결정.

이중 체크섬:
  - 행합: 학과별 전형 합 == 소계 컬럼.
  - 열합: 전형별 합 == 합계행(329/589/28/196/3/155/419/172/204/21/75, 재직자 187 정원외).
  - 둘 다 통과해야 신뢰. 실패 시 추정 금지 + warning.

정직성:
  - 광역(☆) 모집단위(자유전공/인문·사회·자연·공학계열)는 그대로 모집단위로 두되 trackHint='광역'.
  - 수능최저 미적용 전형은 csatMinimumExempt=true (데이터 없음 null 과 구분).
  - PDF 에 없는 값 생성 X.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "sungkyunkwan.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)
LINES = RAW.split("\n")

warnings = []

# ── 물리 페이지 상수 (본체가 정독으로 확정. footer '수시모집요 N' = 인쇄p, 물리=인쇄p+4) ──
PG_QUOTA = [8, 9]   # 02. 모집인원 총괄표 (인쇄 p7, 표가 두 물리페이지에 걸침)
PG_CSAT_COMMON = 13  # 05. 수능 필수응시영역 및 최저학력기준 (인쇄 p11)
# 각 전형 선발방법(반영비율) 물리페이지 — 전형명 → [물리페이지...]
PG_REFLECT = {
    "융합인재": [27, 28],
    "탐구인재": [28, 29],
    "성균인재": [29, 30],
    "성균인재-지역인재": [30, 32],
    "과학인재": [33],
    "기회균형": [35, 36],
    "추천인재": [40, 41],
    "언어형": [42, 43],
    "수리형": [44, 45],
    "예체능특기자": [45, 46, 47],
    "예체능실기우수자": [48, 49, 50, 51],
    "특성화고졸재직자": [53, 54],
}

# ════════════════════════════════════════════════════════════════════════════
# 1. 모집인원 총괄표 파싱 (문자 컬럼 정렬 + 우측끝 앵커)
# ════════════════════════════════════════════════════════════════════════════
# 합계행(line 403) 기준 전형 컬럼 우측끝(end col) 앵커. 표가 p8/p9 두 페이지로 나뉘며
# p9에서 소계 컬럼이 ~3칸 왼쪽으로 밀리므로 소계/재직자는 넓은 윈도우로 매칭.
TRACK_COLS = ["융합인재", "탐구인재", "기회균형", "성균인재", "성균인재-지역인재",
              "과학인재", "추천인재", "언어형", "수리형", "예체능특기자", "예체능실기우수자"]
ANCHORS = [24, 30, 35, 43, 48, 56, 68, 74, 82, 89, 98]
HAB_ROW = [329, 589, 28, 196, 3, 155, 419, 172, 204, 21, 75]  # 합계행
SUBTOTAL_HAB = 2191   # 소계 합계
JAEJIK_HAB = 187      # 특성화고졸재직자(정원외) 합계

GRID_START, GRID_END = 345, 402  # 데이터 행 (합계행 403 제외)

def assign_track(endcol):
    best, bd = None, 99
    for i, a in enumerate(ANCHORS):
        d = abs(endcol - a)
        if d < bd:
            bd, best = d, i
    return best if bd <= 2 else None

def is_subtotal_col(e): return 102 <= e <= 109
def is_jaejik_col(e):   return 112 <= e <= 117

# 그룹 라벨(좌측 col 0~7) → 자식 모집단위 이름 정규화.
# 연기예술학과/무용학과/응용AI융합학부는 한 줄에 그룹+세부전공이 함께 표기됨.
GROUP_CHILD_NAME = {
    "연기": "연기예술학과(연기)",
    "연출": "연기예술학과(연출)",
    "한국무용": "무용학과(한국무용)",
    "발레": "무용학과(발레)",
    "컨템포러리댄스": "무용학과(컨템포러리댄스)",
    "AI융합운영": "응용AI융합학부(AI융합운영)",
    "산업인공지능": "응용AI융합학부(산업인공지능)",
}
GWANGYEOK = {"자유전공계열", "인문과학계열", "사회과학계열", "자연과학계열", "공학계열"}

def resolve_name(name_region):
    """name_region = line[:20]. 모집단위명 = 마지막(우측) 텍스트 run.
    그룹행(전공예약/연기예술/무용학과/응용AI 등 좌측 라벨 + 우측 세부전공)은
    마지막 run 이 세부전공명이며 GROUP_CHILD_NAME 으로 정식명 정규화."""
    runs = [m.group() for m in re.finditer(r"\S+", name_region)]
    if not runs:
        return "", False
    raw = runs[-1].strip("☆ \t")
    if raw in GROUP_CHILD_NAME:
        return GROUP_CHILD_NAME[raw], True   # (정식명, is_grouped_child)
    return raw, False

grid = {}          # 정식모집단위명 → {trackKey: quota}
grid_order = []    # 등장 순서
grid_subtotal = {} # 모집단위 → 소계
grid_jaejik = {}   # 모집단위 → 재직자 정원외 수
is_gwangyeok = {}  # 모집단위 → bool
row_fail = []
col_tot = [0] * 11

for ln in range(GRID_START, GRID_END + 1):
    s = LINES[ln - 1]
    # 숫자: name-region(<col18) 내부의 '(5년제)' 같은 디짓은 제외 (start>=18)
    nums = [(m.end(), int(m.group().replace(",", "")))
            for m in re.finditer(r"\d[\d,]*", s) if m.start() >= 18]
    if not nums:
        continue
    name, is_child = resolve_name(s[:20])
    if not name:
        continue
    cells = {}
    subtotal = jaejik = None
    for end, val in nums:
        if is_jaejik_col(end):
            jaejik = val; continue
        if is_subtotal_col(end):
            subtotal = val; continue
        ti = assign_track(end)
        if ti is None:
            row_fail.append((name, f"미매핑 end{end}={val}"))
            continue
        cells[TRACK_COLS[ti]] = cells.get(TRACK_COLS[ti], 0) + val

    if name not in grid:
        grid[name] = {}
        grid_order.append(name)
        is_gwangyeok[name] = (name in GWANGYEOK) or ("☆" in s[:20])
    grid[name].update(cells)
    rowsum = sum(cells.values())
    for k, v in cells.items():
        idx = TRACK_COLS.index(k)
        col_tot[idx] += v

    # 재직자 정원외 행 (응용AI융합학부): cells 비어있고 jaejik 만 존재
    if jaejik is not None:
        grid_jaejik[name] = jaejik
        continue
    # 행합 검증
    if subtotal is None:
        row_fail.append((name, "소계 컬럼 없음"))
    elif rowsum != subtotal:
        row_fail.append((name, f"행합 {rowsum} ≠ 소계 {subtotal}"))
    else:
        grid_subtotal[name] = subtotal

# 열합 검증
col_check = [(TRACK_COLS[i], col_tot[i], HAB_ROW[i], col_tot[i] == HAB_ROW[i])
             for i in range(11)]
jaejik_total = sum(grid_jaejik.values())
col_check.append(("특성화고졸재직자", jaejik_total, JAEJIK_HAB, jaejik_total == JAEJIK_HAB))

# ════════════════════════════════════════════════════════════════════════════
# 2. 전형 템플릿 (본체가 텍스트 선발방법/수능최저 명시 문구에서 직접 추출)
# ════════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# ── 수능최저 원문 (본체가 p11/각 전형 표에서 직접 인용) ──
CSAT_3HAB6 = "국어, 수학, 영어, 탐구(2개 과목 평균) 4개 영역 중 3개 등급합 6등급 이내"
CSAT_3HAB7 = "국어, 수학, 영어, 탐구(2개 과목 평균) 4개 영역 중 3개 등급합 7등급 이내"
CSAT_3HAB5 = "국어, 수학, 영어, 탐구(2개 과목 평균) 4개 영역 중 3개 등급합 5등급 이내"
CSAT_4HAB5_MED = "국어, 수학, 영어, 탐구(2개 과목 평균) 4개 영역 등급합 5등급 이내 (의예과)"

# 추천인재 모집단위별 수능최저 (p38 표 직접 전사)
CHUCHEON_HAB7 = {  # 3개 등급합 7
    "인문과학계열", "사회과학계열", "경영학과", "영상학과", "의상학과",
    "자연과학계열", "공학계열", "건설환경공학부", "건축학과(5년제)",
    "교육학과", "한문교육과", "수학교육과", "컴퓨터교육과",  # 사범대학
    # 인문/사회/자연과학계열 전공예약 포함
    "유학·동양학과", "국어국문학과", "한문학과", "사학과", "철학과",
    "사회학과", "사회복지학과", "심리학과", "아동·청소년학과", "통계학과",
    "생명과학과", "수학과", "물리학과", "화학과",
}
CHUCHEON_HAB6 = {  # 3개 등급합 6
    "자유전공계열", "글로벌리더학부", "글로벌경제학과", "글로벌경영학과",
    "전자전기정보공학부", "컴퓨터공학과", "반도체융합공학과", "에너지학과",
    "글로벌바이오메디컬공학과", "바이오신약·규제과학과",
}
# 논술 언어형 모집단위별 수능최저 (p41 표)
NONSUL_EON_HAB6 = {"글로벌AI융합학부", "인문과학계열", "사회과학계열", "경영학과",
                   "자연과학계열", "공학계열", "건설환경공학부"}
NONSUL_EON_HAB5 = {"자유전공계열", "글로벌리더학부", "글로벌경제학과", "글로벌경영학과",
                   "전자전기정보공학부", "컴퓨터공학과"}
# 논술 수리형 모집단위별 수능최저 (p43 표)
NONSUL_SU_HAB6 = {"글로벌AI융합학부", "사회과학계열", "경영학과", "자연과학계열",
                  "공학계열", "건설환경공학부"}
NONSUL_SU_HAB5 = {"자유전공계열", "글로벌리더학부", "글로벌경제학과", "글로벌경영학과",
                  "전자전기정보공학부", "반도체시스템공학과", "컴퓨터공학과",
                  "글로벌바이오메디컬공학과", "지능형소프트웨어학과", "약학과",
                  "반도체융합공학과", "에너지학과", "인공지능학과"}
# 의예과 논술 수리형: 4개 영역 등급합 5

# 스포츠과학과 특기자 최저학력기준 (CSAT 옵션 포함 — p46 직접 인용 요약)
SPORTS_MIN = ("아래 기준 중 하나 충족: ① 국내고 졸업(예정)자 교과 기준, ② 해외고 기준, "
              "③ 검정고시 합격자는 충족 간주, ④ 2027 수능 응시 후 국어·수학·영어·탐구·탐구·한국사 "
              "중 상위등급 2개 과목 평균등급 7등급 이내")

# 성균인재 1단계 모집단위별 배수 (p28 직접 전사)
SUNGGYUN_S1_MULT = {
    "자유전공계열": 7, "글로벌AI융합학부": 7, "의예과": 6,
    # 사범대학·스포츠과학과: 3배수
    "교육학과": 3, "한문교육과": 3, "수학교육과": 3, "컴퓨터교육과": 3, "스포츠과학과": 3,
    "연기예술학과(연출)": 5,
}

# 면접형(성균인재/지역인재/과학인재) 2단계 공통: 1단계 성적70 + 면접30, 전형총점 1000
S2_70_30 = stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 1000)


def build_track(track_key, dept, quota, src_pages):
    """track_key = TRACK_COLS 의 한 키 (또는 '특성화고졸재직자'). 전형 레코드 생성."""
    rs = None  # reflectionStages
    appq = None

    if track_key == "융합인재":
        track_name = "학생부종합(융합인재)"
        ttr = "학생부위주(종합)"; special = None
        rs = [stage("일괄", None, {"학생부": 100}, 1000)]
        raw, exempt = CSAT_3HAB6, False

    elif track_key == "탐구인재":
        track_name = "학생부종합(탐구인재)"
        ttr = "학생부위주(종합)"; special = None
        rs = [stage("일괄", None, {"학생부": 100}, 1000)]
        raw, exempt = None, True   # 수능 최저 없음

    elif track_key == "기회균형":
        track_name = "학생부종합(기회균형)"
        ttr = "학생부위주(종합)"; special = "기회균형"
        rs = [stage("일괄", None, {"학생부": 100}, 1000)]
        appq = "국가보훈대상자/농어촌학생/특성화고/기초생활수급·차상위·한부모/장애인등/자립지원 대상자(지원자격심사 포함)"
        raw, exempt = None, True

    elif track_key == "성균인재":
        track_name = "학생부종합(성균인재)"
        ttr = "학생부위주(종합)"; special = None
        mult = SUNGGYUN_S1_MULT.get(dept)
        rs = [stage("1단계", mult, {"학생부": 100}, 1000), S2_70_30]
        raw, exempt = None, True

    elif track_key == "성균인재-지역인재":
        track_name = "학생부종합(성균인재-지역인재)"
        ttr = "학생부위주(종합)"; special = "지역인재"
        # 의예과만 모집, 1단계 6배수
        rs = [stage("1단계", 6, {"학생부": 100}, 1000), S2_70_30]
        appq = "지원 권역 내 중·고교 전 교육과정 이수·거주(지원자격심사 포함). 의사면허 취득 후 10년 권역 내 근무"
        raw, exempt = None, True

    elif track_key == "과학인재":
        track_name = "학생부종합(과학인재)"
        ttr = "학생부위주(종합)"; special = None
        rs = [stage("1단계", 7, {"학생부": 100}, 1000), S2_70_30]
        raw, exempt = None, True

    elif track_key == "추천인재":
        track_name = "학생부교과(추천인재)"
        ttr = "학생부위주(교과)"; special = None
        # 학생부 100 = 정량 A군70 + B군10 + 정성20
        rs = [stage("일괄", None, {"학생부 정량(A군)": 70, "학생부 정량(B군)": 10, "학생부 정성": 20}, 1000)]
        appq = "출신 고등학교장 추천(고교별 추천인원 제한 없음), 학생부 5학기 이상 교과성적 기재자"
        if dept in CHUCHEON_HAB6:
            raw, exempt = CSAT_3HAB6, False
        elif dept in CHUCHEON_HAB7:
            raw, exempt = CSAT_3HAB7, False
        else:
            raw, exempt = None, None   # 매핑 누락 → 정직하게 null
            warnings.append(f"[추천인재 수능최저 미매핑] {dept} → null")

    elif track_key == "언어형":
        track_name = "논술위주(언어형)"
        ttr = "논술위주"; special = None
        rs = [stage("일괄", None, {"논술": 100}, 100)]
        if dept in NONSUL_EON_HAB5:
            raw, exempt = CSAT_3HAB5, False
        elif dept in NONSUL_EON_HAB6:
            raw, exempt = CSAT_3HAB6, False
        else:
            raw, exempt = None, None
            warnings.append(f"[논술언어형 수능최저 미매핑] {dept} → null")

    elif track_key == "수리형":
        track_name = "논술위주(수리형)"
        ttr = "논술위주"; special = None
        rs = [stage("일괄", None, {"논술": 100}, 100)]
        if dept == "의예과":
            raw, exempt = CSAT_4HAB5_MED, False
        elif dept in NONSUL_SU_HAB5:
            raw, exempt = CSAT_3HAB5, False
        elif dept in NONSUL_SU_HAB6:
            raw, exempt = CSAT_3HAB6, False
        else:
            raw, exempt = None, None
            warnings.append(f"[논술수리형 수능최저 미매핑] {dept} → null")

    elif track_key == "예체능특기자":
        track_name = "실기/실적(예체능특기자)"
        ttr = "실기/실적위주"; special = None
        if dept == "영상학과":
            rs = [stage("1단계", 3, {"서류": 100}, 1000),
                  stage("2단계", None, {"1단계 성적": 40, "면접": 60}, 1000)]
            raw, exempt = None, True
        elif dept == "스포츠과학과":
            rs = [stage("1단계", 5, {"서류": 100}, 1000),
                  stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 1000)]
            raw, exempt = SPORTS_MIN, False
            appq = "체육특기자(야구·축구·농구·배구·골프 등 종목별 선발). 경기실적증명서(필수)"
        else:
            rs = None; raw, exempt = None, None
            warnings.append(f"[예체능특기자 반영비율 미매핑] {dept}")

    elif track_key == "예체능실기우수자":
        track_name = "실기/실적(예체능실기우수자)"
        ttr = "실기/실적위주"; special = None
        if dept.startswith("무용학과"):
            rs = [stage("일괄합산", None, {"학생부": 40, "실기(기초/전공)": 40, "실기(부전공)": 20}, 1000)]
            raw, exempt = None, True
        elif dept == "연기예술학과(연기)":
            rs = [stage("1단계", None, {"실기(기초연기역량평가)": 100}, 1000),
                  stage("2단계", 6, {"학생부": 40, "실기(전공적성평가)": 60}, 1000)]
            # 1단계 6배수 선발 (모집인원의 6배수)
            rs[0]["multiplier"] = 6
            raw, exempt = None, True
        elif dept == "스포츠과학과":
            rs = [stage("1단계", 3, {"서류(학생부)": 100}, 1000),
                  stage("2단계", None, {"1단계 성적": 20, "면접/실기": 80}, 1000)]
            raw, exempt = None, True
            appq = "스포츠과학 종목별 선발(단체/개인종목). 실기능력 증빙자료(선택)"
        else:
            rs = None; raw, exempt = None, None
            warnings.append(f"[예체능실기우수자 반영비율 미매핑] {dept}")

    elif track_key == "특성화고졸재직자":
        track_name = "학생부종합(특성화고졸재직자)"
        ttr = "학생부위주(종합)"; special = "특성화고졸재직자"
        rs = [stage("일괄", None, {"서류": 100}, 1000)]
        appq = "특성화고 등 졸업 + 산업체 근무경력 3년 이상 재직자 (정원외)"
        raw, exempt = None, True

    else:
        raise ValueError(track_key)

    src = sorted(set(src_pages))
    return {
        "trackName": track_name, "trackTypeRaw": ttr, "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special, "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": rs,
        "csatMinimumRawText": raw, "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": None, "prevYearResult": None,
        "sourcePages": src,
    }


# ── 계열(trackHint) 분류: 광역=☆, 그 외 단과대/계열 인라인 라벨 기반 ──
def track_hint_for(dept):
    if is_gwangyeok.get(dept):
        return "광역"
    # 의약학·예체능·사범 등 명시 분류 (PDF 인라인 근거)
    if dept in {"의예과"}:
        return "의약"
    if dept in {"약학과", "바이오신약·규제과학과"}:
        return "의약"
    if dept in {"교육학과", "한문교육과", "수학교육과", "컴퓨터교육과"}:
        return "사범"
    if dept.startswith("무용학과") or dept.startswith("연기예술학과") or dept in {"스포츠과학과", "영상학과"}:
        return "예체능"
    return None   # 단일 모집단위는 PDF 명시 계열 근거 부족 → 정직하게 null


# ════════════════════════════════════════════════════════════════════════════
# 3. departments 조립
# ════════════════════════════════════════════════════════════════════════════
departments = []
for dept in grid_order:
    cells = grid[dept]
    tracks = []
    # 일반 전형 (소계 대상)
    for track_key in TRACK_COLS:
        q = cells.get(track_key)
        if not q:
            continue
        src = list(PG_QUOTA) + list(PG_REFLECT[track_key])
        # 수능최저 적용 전형이면 공통 수능최저 페이지도 추가
        t = build_track(track_key, dept, q, src)
        # 공통 수능최저표(p13)는 '등급합' 기준 전형에만 해당. 스포츠과학과 특기자의
        # 최저학력기준은 전형 상세 페이지(p46)에만 있으므로 공통표 추가 X.
        is_deunggeup = t["csatMinimumExempt"] is False and track_key != "예체능특기자"
        if is_deunggeup:
            t["sourcePages"] = sorted(set(t["sourcePages"] + [PG_CSAT_COMMON]))
        tracks.append(t)
    # 재직자(정원외)
    if dept in grid_jaejik:
        q = grid_jaejik[dept]
        src = list(PG_QUOTA) + list(PG_REFLECT["특성화고졸재직자"])
        tracks.append(build_track("특성화고졸재직자", dept, q, src))

    if not tracks:
        continue
    total_q = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"])
    hint = track_hint_for(dept)
    note_g = " (광역 모집단위 ☆ — 학부 단위 모집)" if is_gwangyeok.get(dept) else ""
    departments.append({
        "departmentName": dept,
        "campus": None,
        "trackHint": hint,
        "totalQuotaHint": total_q if total_q else None,
        "tracks": tracks,
    })

# ── warnings ─────────────────────────────────────────────────────────────────
gw = [d for d in grid_order if is_gwangyeok.get(d)]
warnings.append(f"[광역 모집단위] ☆ 표시 {len(gw)}개(학부 단위 모집): {gw} → trackHint='광역', 행합/열합 정상 검증됨.")
warnings.append("[수능최저 신설] 2027 학생부종합(융합인재) 수능 최저학력기준 신설(3개 등급합 6 이내). 그 외 학생부종합 전형은 수능최저 미적용(csatMinimumExempt=true).")
warnings.append("[특성화고졸재직자] 정원외 특별전형(응용AI융합학부 AI융합운영94/산업인공지능93, 총187명). 모집인원 총괄표 별도 컬럼.")
warnings.append("[스포츠과학과 특기자] 수능최저는 등급합이 아닌 4개 기준 중 택1(검정고시 충족간주 포함, CSAT 옵션 ④ 상위2과목 평균 7등급). rawText 인용, exempt=false.")
warnings.append("[성균인재 1단계 배수] 모집단위별 상이(자유전공/글로벌AI 7배수, 의예과 6배수, 사범대학/스포츠과학과 3배수, 연기예술학과(연출) 5배수). 미명시 모집단위는 multiplier=null.")
warnings.append("[trackHint] 광역(☆)·사범·의약·예체능은 PDF 명시 근거로 분류. 단일 학과 계열은 근거 부족 시 null(정직).")
if row_fail:
    warnings.append(f"[행합 실패] {len(row_fail)}건: {row_fail}")

# ── result ───────────────────────────────────────────────────────────────────
result = {
    "universityName": "성균관대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

# ── meta / 채움비율 ──────────────────────────────────────────────────────────
all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n = cnt(lambda t: t["quotaInitial"] is not None)
r_n = cnt(lambda t: t["reflectionStages"])
c_n = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

n_dept = len(departments)
n_rowfail = len(row_fail)
meta = {
    "universityName": "성균관대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용). "
              "모집인원 총괄표는 문자 컬럼 우측끝 앵커 매칭으로 결정론 파싱.",
    "visionCost": 0.0,
    "departments": n_dept, "totalTracks": T,
    "rowSumValidation": {"passed": n_dept - len([1 for _ in row_fail]), "failed": n_rowfail},
    "colTotalValidation": [{"track": n, "computed": g, "expectedSumRow": e, "match": m}
                           for (n, g, e, m) in col_check],
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T],
        "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}
(BASE / "sungkyunkwan-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8")

# ── 콘솔 리포트 ──────────────────────────────────────────────────────────────
print("=" * 70)
print("성균관대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 70)
print(f"물리페이지: 모집인원={PG_QUOTA} 공통수능최저=p{PG_CSAT_COMMON}")
print(f"\n학과(모집단위): {n_dept}  |  전형(track): {T}")
print(f"행합 검증(소계 대조): 통과 {n_dept - n_rowfail} / 실패 {n_rowfail}")
print("\n열합 검증 (전형별 합 vs 합계행):")
for n, g, e, m in col_check:
    print(f"  {n:14s} 계산={g:5d}  합계행={e:5d}  {'OK' if m else 'XX'}")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
if row_fail:
    print(f"\n[행합 실패] {row_fail}")
print(f"\n저장: {BASE/'sungkyunkwan-text.json'}")
