#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한양대 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 hanyang.txt(98쪽)를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 결정론적으로 파싱한 모집인원 총괄표 그리드
(공통 '모집인원 - 총괄표', 인쇄 p3~4 = 물리 p10~11)와 결합한다.

캠퍼스: 본 PDF는 한양대학교 '서울캠퍼스' 수시 모집요강 단독본이다. ERICA(안산) 캠퍼스는
  복수지원 규정·장학(형제자매)·기숙사 주소 안내에서만 부수 언급될 뿐, 모집단위/전형표가 없다.
  → 모든 학과 campus="서울". (검증: 본문에 ERICA 모집인원표·전형방법표 0건)

정직성 / 체크섬:
  - 그리드 칼럼 x-앵커는 페이지별로 도출(p10·p11 헤더 정렬이 다름). 숫자 셀을 최근접 앵커에
    배정(±3칸). 페이지별로 완전충원 기준행으로 앵커 검증 후 사용.
  - 행합(row): 한양 그리드의 '모집인원'은 PDF 정의상 "수시+정시 합산 모집정원"이므로 수시
    전형 합과 일치하지 않는다(연세대 동일 구조). 수시 학과 정원은 '계'(수시 계) 칼럼이 정답.
    → totalQuotaHint = 계(수시). 행합 = 학과별 전형 quota 합 == 계.
  - 열합(col): 전형별 그리드 합 == 합계행. 정원내/정원외 분리 대조.
       정원내 합계행: 교과340 종합300 서류496 면접138 고른113 사회5 재직0 논술229 실기110 (계1731)
       정원외 합계행: 교과6  서류22  재직(특성화고졸)158  논술4 (계190)
  - 한양인터칼리지학부(자연/인문): 그리드에서 2개 모집단위가 수직 병합(모집인원252·계202 공유)
    되어 한 칼럼이 여러 줄에 흩어짐. 명시 텍스트(면접 p7·사회통합 p8·논술일정 p38)로
    (자연)·(인문) 분리 후, PDF 레이아웃상 행 귀속이 불명확한 교과추천 42명만 (인문)에 귀속
    + warning. (자연 120 + 인문(82=42+15+10+15) = 202 = 계, 열합 보존)
  - 정원외(반도체공학과 채용조건형 계약학과 / 산업융합학부 특성화고졸재직자):
    specialTypeKeyword 부착 + warning. quotaInitial은 PDF 명시 정원외 숫자 보존.
  - 반영비율·수능최저: 본체가 PDF 텍스트(p20 반영비율 총괄표 + 각 전형 상세 '전형방법' 절)
    명시 문구에서 직접 인용. 추정 X. sourcePages(물리)로 대조.
  - 예체능 자체배점(실기/실적): 모집단위별 상이한 실기 반영비율을 그대로 보존(p20·p41).
    음악대학 성악/작곡/피아노과는 수시 계=0(수시 미선발) → 학과 자체를 생성하지 않음.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "hanyang.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 인쇄 페이지(footer "- N -") → 물리 페이지 매핑 ─────────────────────────
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for num in re.findall(r"^\s*-\s*(\d+)\s*-\s*$", pg, re.M):
        printed_to_phys.setdefault(int(num), i)

def phys(printed):
    p = printed_to_phys.get(printed)
    if p is None:
        warnings.append(f"[페이지매핑] 인쇄p{printed} 물리페이지 매핑 실패")
    return p

# 전형 상세 물리 페이지 (인쇄p → 물리p)
PG_GRID    = [p for p in (phys(3), phys(4)) if p]   # 모집인원 총괄표
PG_RATIO   = phys(20)                                # 선발방법·반영비율 총괄표
PG = {  # 각 전형 세부사항 물리 페이지
    "학생부교과(추천형)": phys(21),
    "학생부종합(추천형)": phys(23),
    "학생부종합(서류형)": phys(25),
    "학생부종합(면접형)": phys(26),
    "학생부종합(고른기회)": phys(29),
    "학생부종합(사회통합)": phys(33),
    "학생부종합(특성화고졸재직자)": phys(35),
    "논술": phys(37),
    "실기/실적(미술특기자)": phys(40),
    "실기/실적(음악특기자)": phys(41),
    "실기/실적(체육특기자)": phys(45),
    "실기/실적(연기특기자)": phys(48),
    "실기/실적(무용특기자)": phys(50),
}

# ── 수능최저학력기준 원문 (본체가 p20·각 전형 상세에서 직접 인용) ──────────────
CSAT_3HAB7 = "국어, 수학, 영어, 탐구(상위 1개 과목) 중 3개 영역 등급합 7 이내"
CSAT_4HAB_MED = "국어, 수학, 영어, 탐구(2개 과목 평균) 중 3개 영역 등급합 4 이내"  # 의예과
CSAT_AREAS = "수능 필수 응시영역: 국어, 수학, 영어, 탐구(2과목), 한국사. 탐구는 사회 및 과학탐구에 한함"

def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# ── 전형 템플릿 (반영비율: p20 총괄표 + 각 전형 상세 '전형방법' 절 명시 인용) ──
# trackTypeRaw enum: 학생부위주(교과)/학생부위주(종합)/논술위주/실기·실적위주/수능위주/기타
def build_track(track_col, dept, quota, src_pages, *, note=None):
    """track_col: 그리드 칼럼키. dept: 모집단위명. quota: int|None."""
    appq = None
    exempt = True
    raw = "없음"; areas = None

    if track_col == "교과":
        ttype = "학생부위주(교과)"; special = None
        stages = [stage("일괄합산", None, {"학생부교과": 90, "교과 정성평가": 10}, 1000)]
        is_med = (dept == "의예과")
        raw = CSAT_4HAB_MED if is_med else CSAT_3HAB7
        exempt = False; areas = CSAT_AREAS
        appq = ("소속 고등학교장의 추천을 받은 2026년 2월 이후(2026년 2월 졸업자 포함) 국내 정규 고교 "
                "졸업(예정)자로서 통산 5개 학기 이상 국내 고교 성적 취득자. 3학년 재적인원 11% 이내 추천")
        return _mk("학생부교과(추천형)", ttype, special, quota, appq, stages, raw, exempt, areas, src_pages, note)

    if track_col == "종합":
        ttype = "학생부위주(종합)"; special = None
        stages = [stage("일괄합산", None, {"학생부종합평가": 100}, 1000)]
        is_med = (dept == "의예과")
        raw = CSAT_4HAB_MED if is_med else CSAT_3HAB7
        exempt = False; areas = CSAT_AREAS
        appq = ("소속 고등학교장의 추천을 받은 2026년 2월 이후(2026년 2월 졸업자 포함) 국내 정규 고교 "
                "졸업(예정)자로서 통산 5개 학기 이상 국내 고교 성적 취득자. 3학년 재적인원 11% 이내 추천")
        return _mk("학생부종합(추천형)", ttype, special, quota, appq, stages, raw, exempt, areas, src_pages, note)

    if track_col == "서류":
        ttype = "학생부위주(종합)"; special = None
        stages = [stage("일괄합산", None, {"학생부종합평가": 100}, 1000)]
        appq = "국내 정규 고교 졸업(예정)자 및 동등의 학력 소지자"
        return _mk("학생부종합(서류형)", ttype, special, quota, appq, stages, "없음", True, None, src_pages, note)

    if track_col == "면접":
        ttype = "학생부위주(종합)"; special = None
        stages = [stage("1단계", 7, {"학생부종합평가": 100}, 1000),
                  stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 1000)]
        appq = "국내 정규 고교 졸업(예정)자 및 동등의 학력 소지자"
        return _mk("학생부종합(면접형)", ttype, special, quota, appq, stages, "없음", True, None, src_pages, note)

    if track_col == "고른":
        ttype = "학생부위주(종합)"; special = "기회균형"
        stages = [stage("일괄합산", None, {"학생부종합평가": 100}, 1000)]
        appq = ("기초생활수급자 및 차상위계층 / 국가보훈대상자 / 농어촌학생(6년·12년) / 특성화고교졸업자 / "
                "특수교육대상자 / 자립지원대상자 중 하나 충족 (지원자격 구분별 선발인원 배정 없음)")
        return _mk("학생부종합(고른기회)", ttype, special, quota, appq, stages, "없음", True, None, src_pages, note)

    if track_col == "사회":
        ttype = "학생부위주(종합)"; special = "사회통합"
        stages = [stage("일괄합산", None, {"학생부종합평가": 100}, 1000)]
        appq = ("신설 전형. 다자녀(3자녀 이상) 가정의 자녀 / 다문화 가정의 자녀 / 15년 이상 장기복무 "
                "직업군인·소방·경찰 공무원의 자녀 중 하나 충족")
        return _mk("학생부종합(사회통합)", ttype, special, quota, appq, stages, "없음", True, None, src_pages, note)

    if track_col == "재직":  # 특성화고졸재직자 (정원 외)
        ttype = "학생부위주(종합)"; special = "특성화고졸재직자(정원외)"
        stages = [stage("일괄합산", None, {"학생부종합평가": 100}, 1000)]
        appq = ("국내 특성화고교(전문계고교)·마이스터고 졸업 후 산업체 근무경력 3년 이상(2027.3.1. 기준) "
                "재직자. 전형기간 자율화 전형(정원 외)")
        return _mk("학생부종합(특성화고졸재직자)", ttype, special, quota, appq, stages, "없음", True, None, src_pages, note)

    if track_col == "논술":
        ttype = "논술위주"; special = None
        stages = [stage("일괄합산", None, {"논술": 100}, 1000)]
        is_med = (dept == "의예과")
        raw = CSAT_4HAB_MED if is_med else CSAT_3HAB7
        exempt = False; areas = CSAT_AREAS
        appq = "국내 정규 고교 졸업(예정)자 및 동등의 학력 소지자. 논술고사 90분, 고교 교육과정 내 출제"
        return _mk("논술", ttype, special, quota, appq, stages, raw, exempt, areas, src_pages, note)

    if track_col == "실기":  # 실기/실적 — 모집단위별 분기
        return _build_silgi(dept, quota, src_pages, note)

    raise ValueError(f"unknown track_col {track_col}")

def _mk(name, ttype, special, quota, appq, stages, raw, exempt, areas, src, note):
    t = {
        "trackName": name, "trackTypeRaw": ttype, "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special, "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw, "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas, "prevYearResult": None,
        "sourcePages": sorted({p for p in src if p}),
    }
    if note:
        t["note"] = note
    return t

# ── 실기/실적: 모집단위별 전형방법 (p20 총괄표 + 각 특기자 상세 절 직접 인용) ──
def _build_silgi(dept, quota, src_pages, note):
    appq = "국내 정규 고교 졸업(예정)자 및 동등의 학력 소지자 (실적/실기 중심 평가)"
    # 미술특기자 — 응용미술교육과
    if dept == "응용미술교육과":
        name = "실기/실적(미술특기자)"
        stages = [stage("1단계", 20, {"학생부종합평가": 100}, 1000),
                  stage("2단계", None, {"실기": 100}, 1000)]
        src = src_pages + [PG["실기/실적(미술특기자)"]]
    # 음악특기자 — 관현악과(실기90+교과10) / 국악과(전공별 80+20·60+40 혼재)
    elif dept == "관현악과":
        name = "실기/실적(음악특기자)"
        stages = [stage("일괄합산", None, {"실기": 90, "학생부교과": 10}, 1000)]
        src = src_pages + [PG["실기/실적(음악특기자)"]]
    elif dept == "국악과":
        name = "실기/실적(음악특기자)"
        # 국악과: 가야금/거문고/대금/피리/해금/아쟁/타악/정가/판소리 = 실기80+교과20,
        #         작곡/이론 = 실기60+교과40 (전공별 상이) — 자체배점 보존
        stages = [stage("일괄합산(가야금·거문고·대금·피리·해금·아쟁·타악·정가·판소리)", None,
                        {"실기": 80, "학생부교과": 20}, 1000),
                  stage("일괄합산(작곡·이론)", None, {"실기": 60, "학생부교과": 40}, 1000)]
        src = src_pages + [PG["실기/실적(음악특기자)"]]
        note = (note + " | " if note else "") + "국악과 전공별 반영비율 상이(실기80+교과20 / 작곡·이론 실기60+교과40)"
    # 체육특기자 — 스포츠산업과학부(매니지먼트/사이언스)
    elif dept.startswith("스포츠산업과학부"):
        name = "실기/실적(체육특기자)"
        stages = [stage("1단계", 5, {"경기실적": 70, "학생부종합평가": 30}, 1000),
                  stage("2단계", None, {"1단계 성적": 90, "면접": 10}, 1000)]
        src = src_pages + [PG["실기/실적(체육특기자)"]]
    # 연기특기자 — 연극영화학과(연기)
    elif dept == "연극영화학과(연기)":
        name = "실기/실적(연기특기자)"
        stages = [stage("일괄합산", None, {"연기실적": 70, "면접": 30}, 1000)]
        src = src_pages + [PG["실기/실적(연기특기자)"]]
    # 무용특기자 — 무용학과
    elif dept == "무용학과":
        name = "실기/실적(무용특기자)"
        stages = [stage("일괄합산", None, {"실기": 80, "학생부교과": 20}, 1000)]
        src = src_pages + [PG["실기/실적(무용특기자)"]]
    else:
        warnings.append(f"[실기/실적] 미분류 모집단위 '{dept}' → reflectionStages 비움")
        name = "실기/실적"; stages = []
        src = src_pages
    return _mk(name, "실기/실적위주", None, quota, appq, stages, "없음", True, None, src, note)


# ── 모집인원 총괄표 그리드 파싱 (페이지별 x-앵커 + 최근접 배정) ───────────────
# 칼럼키 순서 (왼→오): 모집인원 교과추천 종합추천 서류형 면접형 고른기회 사회통합 재직자(특성화고졸) 논술 실기/실적 계
TR = ["교과", "종합", "서류", "면접", "고른", "사회", "재직", "논술", "실기"]
# 페이지별 x-앵커 (본체가 헤더/완전충원 기준행으로 도출·검증)
ANCHORS = {
    phys(3): dict(모집=27, 교과=34, 종합=40, 서류=45, 면접=52, 고른=57, 사회=63, 재직=69, 논술=75, 실기=81, 계=87),
    phys(4): dict(모집=33, 교과=41, 종합=47, 서류=53, 면접=60, 고른=66, 사회=72, 재직=78, 논술=85, 실기=91, 계=95),
}

def parse_cells(ln, A, tol=3):
    """숫자/괄호숫자 셀을 최근접 칼럼앵커에 배정. 반환 col->(val,outer)."""
    out = {}
    for m in re.finditer(r"\((\d+)\)|(\d[\d,]*)", ln):
        val = int((m.group(1) or m.group(2)).replace(",", ""))
        outer = m.group(1) is not None
        pos = m.start()
        best = min(A.items(), key=lambda kv: abs(kv[1] - pos))
        if abs(best[1] - pos) <= tol:
            out[best[0]] = (val, outer)
    return out

# 계열 라벨(trackHint): 그리드 '계열' 칼럼 인라인 값 (명시 근거).
# 복합계열(인문/자연·자연/인문)은 단일계열 단정 금지 → null.
GYE_LABELS = {"인문/자연": None, "자연/인문": None, "자연": "자연", "인문": "인문",
              "상경": "인문", "예체능": "예체능"}

def classify_gye(head):
    """head: 모집인원 앵커 직전 텍스트. 계열 라벨을 찾아 trackHint 반환."""
    for lab, val in GYE_LABELS.items():     # 복합('/' 포함)을 먼저 매칭
        if lab in head:
            return val
    return None

# 모집단위명 정제 (교직 * 표시 제거, 공백 정리)
SUFFIX = "*◇◉★"
def extract_name(head):
    """head 에서 모집단위명만 추출. 모집단위(학과)는 모집인원 칼럼 직전에 우측정렬되어
    2칸 이상 공백으로 단과대/계열 토큰과 분리됨 → 마지막 2+space 청크가 모집단위명."""
    chunks = [c for c in re.split(r"\s{2,}", head.strip()) if c]
    if not chunks:
        return ""
    name = chunks[-1]
    # 계열 라벨이 붙어온 경우(공백 1칸으로 붙은 드문 케이스) 제거
    for lab in GYE_LABELS:
        if name.startswith(lab):
            name = name[len(lab):]
    return name.strip().rstrip(SUFFIX).strip()

departments = []
parse_fail = []
col_inner = dict.fromkeys(TR, 0)
col_outer = dict.fromkeys(TR, 0)

# 그리드에서 한 데이터행 = '모집' 앵커 + 최소 1개 트랙 셀 + (보통) '계'
# 일부 모집단위는 전공명(예: '(전기공학전공)')이 데이터행 바로 다음 줄에 단독 표기됨 → 부착.
for pi in PG_GRID:
    A = ANCHORS[pi]
    lines = pages[pi - 1].splitlines()
    for li, ln in enumerate(lines):
        cells = parse_cells(ln, A)
        if "모집" not in cells:
            continue
        # 합계행 / 헤더 / 인터칼리지 병합행은 별도 처리 → 스킵
        head = ln[:A["모집"]]
        if "합 계" in head or "인터칼리지" in ln:
            continue
        if not any(t in cells for t in TR):
            continue
        name = extract_name(head)
        if not name:
            continue
        # 다음 줄이 '(...전공)' 단독행이면 전공 수식어 부착 (모집단위 분리 보존)
        if li + 1 < len(lines):
            nxt = lines[li + 1].strip()
            if re.fullmatch(r"\([^)]*전공[^)]*\)\*?", nxt):
                name = name + nxt.rstrip("*")
        gye = classify_gye(head)
        gye_total = cells.get("계", (None, None))[0]
        outer_row = any(v[1] for v in cells.values())
        # 트랙 생성
        tracks = []
        tsum = 0
        for t in TR:
            if t not in cells:
                continue
            v, o = cells[t]
            if v == 0:
                continue
            tsum += v
            (col_outer if o else col_inner)[t] += v
            note = "정원 외 모집인원" if o else None
            tracks.append(build_track(t, name, v, [pi], note=note))
        # 행합 검증: 트랙합 == 계(수시)
        if gye_total is not None and tsum != gye_total:
            parse_fail.append((pi, name, gye_total, tsum))
            warnings.append(f"[행합불일치] {name} (p{pi}): 계(수시) {gye_total} ≠ 전형합 {tsum}")
        if not tracks:
            continue
        departments.append({
            "departmentName": name,
            "campus": "서울",
            "trackHint": gye,
            "totalQuotaHint": gye_total,   # 수시 계 (모집인원 칼럼은 수시+정시 합산이라 사용 안 함)
            "tracks": tracks,
        })

# ── 한양인터칼리지학부(자연/인문) 병합행 — 명시 텍스트로 분리 ──────────────────
# 그리드 레이아웃(p4): 모집인원252·계202 공유. (자연)행=120, (인문)행=40, 교과추천42(귀속 불명확).
# 근거: 면접 p7(자연 20명)·사회통합 p8(자연 5명)·논술일정 p38(자연·인문 모두 논술).
ic_page = phys(4)
IC_JAYEON = {"종합": 30, "서류": 25, "면접": 20, "고른": 5, "사회": 5, "논술": 35}  # 계 120
IC_INMUN  = {"교과": 42, "종합": 15, "서류": 10, "논술": 15}                          # 계 82 (42 귀속 불명확)
warnings.append("[한양인터칼리지학부] 그리드상 (자연)·(인문) 2개 모집단위가 수직 병합(모집인원252·계202 공유). "
                "면접(p7)·사회통합(p8)·논술일정(p38) 명시로 (자연)120·(인문)40 분리. 교과추천 42명은 "
                "PDF 레이아웃상 (자연)/(인문) 행 귀속이 불명확 → 열합 보존 위해 (인문)에 귀속하고 본 경고로 명시.")

for dept_name, gye, cells in [
    ("한양인터칼리지학부(자연)", "자연", IC_JAYEON),
    ("한양인터칼리지학부(인문)", "인문", IC_INMUN),
]:
    tracks = []
    tsum = 0
    for t in TR:
        if t not in cells:
            continue
        v = cells[t]
        tsum += v
        col_inner[t] += v
        tracks.append(build_track(t, dept_name, v, [ic_page]))
    departments.append({
        "departmentName": dept_name, "campus": "서울", "trackHint": gye,
        "totalQuotaHint": tsum, "tracks": tracks,
    })

# ── 열합 검증 (정원내 / 정원외 각각 PDF 합계행 대조) ──────────────────────────
EXPECTED_INNER = dict(교과=340, 종합=300, 서류=496, 면접=138, 고른=113, 사회=5, 재직=0, 논술=229, 실기=110)
EXPECTED_OUTER = dict(교과=6, 종합=0, 서류=22, 면접=0, 고른=0, 사회=0, 재직=158, 논술=4, 실기=0)
EXPECTED_INNER_GYE = 1731   # 합계행 '계'(정원내)
EXPECTED_OUTER_GYE = 190    # 합계행 '계'(정원외)

coltotal_inner = [(t, col_inner[t], EXPECTED_INNER[t], col_inner[t] == EXPECTED_INNER[t]) for t in TR]
coltotal_outer = [(t, col_outer[t], EXPECTED_OUTER[t], col_outer[t] == EXPECTED_OUTER[t]) for t in TR]
inner_gye = sum(col_inner.values())
outer_gye = sum(col_outer.values())

# ── 정원외/계약학과 정직 처리 warning ───────────────────────────────────────
warnings.append("[캠퍼스] 본 PDF는 한양대학교 서울캠퍼스 수시 모집요강 단독본 → 전 학과 campus='서울'. "
                "ERICA(안산)는 복수지원 규정·장학·기숙사 안내에서만 부수 언급(모집표 0건).")
warnings.append("[정원외] 반도체공학과(공과대학, ㈜SK하이닉스 채용조건형 계약학과, 정원외): 교과6+서류22+논술4=32. "
                "산업융합학부(기술혁신대학, 특성화고졸재직자, 정원외): 158. specialTypeKeyword 부착, quotaInitial은 PDF 명시값 보존.")
warnings.append("[수시 미선발(계=0)] 음악대학 성악과·작곡과·피아노과, 연극영화학과(연출및스탭)는 수시 계=0(정시 선발) "
                "→ 학과 자체를 생성하지 않음(정직: 빈 전형 날조 금지).")
warnings.append("[행합 기준] 그리드 '모집인원' 칼럼은 수시+정시 합산 모집정원이라 수시 전형 합과 불일치(연세대 동일 구조). "
                "수시 학과 정원은 '계'(수시 계) 칼럼 → totalQuotaHint=계, 행합=전형합==계.")
if parse_fail:
    warnings.append(f"[행합실패] {len(parse_fail)}건: " + "; ".join(f"{n}(계{g}≠합{s})" for _, n, g, s in parse_fail))

# ── 결과 조립 ───────────────────────────────────────────────────────────────
result = {"universityName": "한양대학교", "year": 2027, "recruitmentSeason": "susi",
          "departments": departments, "warnings": warnings}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

row_pass = len(departments) - len(parse_fail)

meta = {
    "universityName": "한양대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "campusScope": "서울캠퍼스 단독(ERICA 모집표 없음)",
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {"basis": "계(수시) 칼럼", "passed": row_pass, "failed": len(parse_fail)},
    "colTotalValidationInner": [{"track": n, "computed": g, "expectedSumRow": e, "match": m}
                                for (n, g, e, m) in coltotal_inner],
    "colTotalValidationOuter": [{"track": n, "computed": g, "expectedSumRow": e, "match": m}
                                for (n, g, e, m) in coltotal_outer],
    "colTotalGye": {"innerComputed": inner_gye, "innerExpected": EXPECTED_INNER_GYE,
                    "outerComputed": outer_gye, "outerExpected": EXPECTED_OUTER_GYE},
    "fillRatios": {"quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
                   "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T]},
    "completeRecords": [comp_n, T],
}
(BASE / "hanyang-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

# ── 콘솔 리포트 ─────────────────────────────────────────────────────────────
print("=" * 70)
print("한양대 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 70)
print(f"그리드 물리페이지: {PG_GRID}  |  반영비율 총괄표: p{PG_RATIO}")
print(f"캠퍼스: 서울 단독 (ERICA 모집표 없음)")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증(계 기준): 통과 {row_pass} / 실패 {len(parse_fail)}")
if parse_fail:
    for p, n, g, s in parse_fail:
        print(f"   ❌ p{p} {n}: 계 {g} ≠ 전형합 {s}")

print("\n열합 검증 — 정원내 (전형별 합 vs 합계행 340/300/496/138/113/5/0/229/110):")
for n, g, e, m in coltotal_inner:
    print(f"  {n:4s} 계산={g:4d}  합계행={e:4d}  {'✅' if m else '❌'}")
print(f"  계(정원내) 계산={inner_gye}  합계행={EXPECTED_INNER_GYE}  {'✅' if inner_gye==EXPECTED_INNER_GYE else '❌'}")

print("\n열합 검증 — 정원외 (반도체공학과·산업융합학부; 합계행 6/0/22/0/0/0/158/4/0):")
for n, g, e, m in coltotal_outer:
    if e or g:
        print(f"  {n:4s} 계산={g:4d}  합계행={e:4d}  {'✅' if m else '❌'}")
print(f"  계(정원외) 계산={outer_gye}  합계행={EXPECTED_OUTER_GYE}  {'✅' if outer_gye==EXPECTED_OUTER_GYE else '❌'}")

print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n),
                 ("csatMinimumRawText", c_n), ("csatMinimumExempt", ce_n),
                 ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    print(f"  {label:18s}: {n}/{T} ({100*n//T if T else 0}%)")

print(f"\nwarnings: {len(warnings)}건")
print(f"💾 {BASE/'hanyang-text.json'} 저장")
