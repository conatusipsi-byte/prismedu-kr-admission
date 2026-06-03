#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
건국대학교 서울캠퍼스 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 konkuk.txt(89쪽)를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 결정론적으로 파싱한 모집인원 총괄표 그리드와 결합한다.

캠퍼스:
  본 PDF는 건국대학교 '서울캠퍼스' 수시 모집요강 단독본이다. 글로컬(충주)은 별도 대학
  (kcue_0000053). 본문에 글로컬 모집단위 표 없음 → 전 학과 campus="서울".

전형 목록 (총 10개):
  정원 내 (7개): KU지역균형, KU자기추천, 기회균형, KU논술우수자, 연기우수자, 연출우수자, 체육특기자
  정원 외 (3개): 특성화고교졸업자, 특수교육대상자, 특성화고졸재직자(전형기간 자율화)

모집인원 총괄표 구조:
  - 인쇄 p19~21 = 물리 p19~21 (건국대 인쇄/물리 1:1 매핑)
  - 합계행(1,880)은 특수교육대상자 20명 미포함(정원외 단과대 단위 모집)
  - 수시모집인원 열 = 특수교육대상자 제외 합산

그리드 x-앵커 (헤더행·합계행으로 검증):
  [물리 p19] 수시@30, 교과@40, 종합@47, 기회균형@53, 특성화고교졸업자@59, (특수교육대상자 미표시),
             논술@70, 연기@75, 연출@80, 체육@87, 재직@92
  [물리 p20~21] 수시@59, 교과@69, 종합@77, 기회균형@88, 특성화고교졸업자@94, 특수교육대상자@100,
                논술@106, 연기@110, 연출@116, 체육@123, 재직@128
"""
import json, re
from pathlib import Path

BASE  = Path("scripts/etl/text-extract-test")
RAW   = (BASE / "konkuk.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")   # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 페이지 매핑 (건국대 1:1) ────────────────────────────────────────────────
# 인쇄페이지 = 물리페이지. 매핑 테이블만 완성도 확인용으로 구축.
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for num in re.findall(r"수시모집요강\s*[–\-]\s*(\d+)", pg):
        printed_to_phys.setdefault(int(num), i)
    for num in re.findall(r"(\d+)\s*[–\-]\s*KONKUK UNIVERSITY", pg):
        printed_to_phys.setdefault(int(num), i)

# 그리드 물리 페이지 (직접 확인)
PG_GRID_P1 = 19   # 문과대~공과대 (인쇄 p19)
PG_GRID_P2 = 20   # 사회과학대~영화예술학과 (인쇄 p20)
PG_GRID_P3 = 21   # 사범대 나머지·상허교양대 + 합계행 (인쇄 p21)
PG_GRID    = [PG_GRID_P1, PG_GRID_P2, PG_GRID_P3]

# 전형 세부 물리 페이지
PG = {
    "KU지역균형":       26,
    "KU자기추천":       29,
    "기회균형":         33,
    "특성화고교졸업자":  39,
    "특수교육대상자":    43,
    "KU논술우수자":     47,
    "연기우수자":        51,
    "연출우수자":        54,
    "체육특기자":        57,
    "특성화고졸재직자":  62,
}

# ── 수능최저학력기준 원문 (p47 직접 인용) ─────────────────────────────────
CSAT_2_IN_5 = "국, 수, 영, 사/과탐(1과목) 중 2개 등급 합 5, [한국사 5등급]"
CSAT_3_IN_4 = "국, 수, 영, 사/과탐(1과목) 중 3개 등급 합 4, [한국사 5등급]"
CSAT_NOTE   = ("사/과탐: 2과목 응시 중 높은 과목 반영. 영역별 선택과목 제한 없음. "
               "수능최저학력기준의 모든 반영 영역에 응시하여야 함.")

def stage(label, mult, comps, maxscore=1000):
    return {"stageLabel": label, "multiplier": mult,
            "components": comps, "stageMaxScore": maxscore}

# ── 전형 템플릿 ─────────────────────────────────────────────────────────────
def build_track(track_key, dept, gye, quota, src_pages, *, note=None):
    # KU지역균형
    if track_key == "교과":
        return _mk(
            "학생부교과(KU지역균형)", "학생부위주(교과)", None, quota,
            ("국내 고등학교에서 5학기 이상 교육과정을 이수한 졸업(예정)자로서 고등학교장의 추천을 받은 자. "
             "3학년 1학기까지 5학기 이상 성적 취득. 고교별 추천 인원 제한 없음. "
             "특성화고·마이스터고·영재학교·예술고·체육고 등 지원 불가."),
            [stage("일괄합산", None, {"학생부(교과정량)": 70, "학생부(교과정성)": 30})],
            "없음", True, None,
            src_pages + [PG["KU지역균형"]], note,
        )
    # KU자기추천
    if track_key == "종합":
        return _mk(
            "학생부종합(KU자기추천)", "학생부위주(종합)", None, quota,
            ("국내·외 고등학교 졸업(예정)자 또는 동등 학력 인정자. "
             "교내 활동에 자발적으로 참여하고 해당 전공에 관심과 소질이 있어 스스로를 추천할 수 있는 자. "
             "KU자유전공학부: 고교생 수준의 학업적 기초역량과 다양한 경험을 바탕으로 융·복합적 소양을 갖춘 자."),
            [stage("1단계", 3, {"서류": 100}),
             stage("2단계", None, {"1단계 성적": 70, "면접": 30})],
            "없음", True, None,
            src_pages + [PG["KU자기추천"]], note,
        )
    # 기회균형
    if track_key == "기회균형":
        return _mk(
            "학생부종합(기회균형)", "학생부위주(종합)", "기회균형", quota,
            ("국내·외 고등학교 졸업(예정)자 또는 동등 학력. "
             "① 국가보훈대상자 ② 농어촌학생(중·고 6년 또는 초·중·고 12년 연속이수+거주) "
             "③ 기초생활수급자 및 차상위계층 중 하나에 해당하는 자."),
            [stage("일괄합산", None, {"서류": 70, "학생부(교과정량)": 30})],
            "없음", True, None,
            src_pages + [PG["기회균형"]], note,
        )
    # 특성화고교졸업자 (정원외)
    if track_key == "특성화고교졸업자":
        return _mk(
            "학생부종합(특성화고교졸업자)", "학생부위주(종합)", "특성화고교졸업자(정원외)", quota,
            ("특성화고등학교(자연현장실습 체험위주 제외) 또는 일반고 내 특성화 학과 졸업(예정)자로서 "
             "이수 학과의 기준학과가 모집단위 기준학과를 충족하는 자. "
             "산업수요맞춤형고(마이스터고) 졸업생 제외."),
            [stage("일괄합산", None, {"서류": 70, "학생부(교과정량)": 30})],
            "없음", True, None,
            src_pages + [PG["특성화고교졸업자"]], note,
        )
    # 특수교육대상자 (정원외)
    if track_key == "특수교육대상자":
        return _mk(
            "학생부종합(특수교육대상자)", "학생부위주(종합)", "특수교육대상자(정원외)", quota,
            ("국내·외 고등학교 졸업(예정)자 또는 동등 학력. "
             "「장애인복지법」 제32조에 따라 등록된 장애인 또는 "
             "「국가유공자 예우 및 지원에 관한 법률」 제4조·제6조에 따른 상이등급자."),
            [stage("1단계", 3, {"서류": 100}),
             stage("2단계", None, {"1단계 성적": 70, "면접": 30})],
            "없음", True, None,
            src_pages + [PG["특수교육대상자"]], note,
        )
    # KU논술우수자
    if track_key == "논술":
        is_vet = (dept == "수의예과")
        raw_csat = CSAT_3_IN_4 if is_vet else CSAT_2_IN_5
        return _mk(
            "논술(KU논술우수자)", "논술위주", None, quota,
            "국내·외 고등학교 졸업(예정)자 또는 동등 학력. 수능최저학력기준 있음.",
            [stage("일괄합산", None, {"논술": 100})],
            raw_csat + " | " + CSAT_NOTE, False,
            "국어, 수학, 영어, 사/과탐(2과목 중 1과목), 한국사",
            src_pages + [PG["KU논술우수자"]], note,
        )
    # 연기우수자
    if track_key == "연기":
        return _mk(
            "실기/실적(연기우수자)", "실기/실적위주", None, quota,
            ("국내·외 고등학교 졸업(예정)자 또는 동등 학력. "
             "국내 고교 3학기 이상 학생부(교과정량) 성적 산출내역 있는 자."),
            [stage("1단계", 20, {"학생부(교과정량)": 100}),
             stage("2단계", None, {"실기": 100})],
            "없음", True, None,
            src_pages + [PG["연기우수자"]], note,
        )
    # 연출우수자
    if track_key == "연출":
        return _mk(
            "실기/실적(연출우수자)", "실기/실적위주", None, quota,
            "국내·외 고등학교 졸업(예정)자 또는 동등 학력.",
            [stage("1단계", 10, {"서류": 100}),
             stage("2단계", None, {"실기": 100})],
            "없음", True, None,
            src_pages + [PG["연출우수자"]], note,
        )
    # 체육특기자
    if track_key == "체육":
        return _mk(
            "실기/실적(체육특기자)", "실기/실적위주", None, quota,
            ("국내·외 고등학교 졸업(예정)자 또는 동등 학력으로 종목별 지원자격 해당자. "
             "종목: 야구(남, 투수/포수·내야수·외야수 포지션별), 테니스, 육상. "
             "국내 고교 3학기 이상 교과정량 성적 또는 2026년 경기실적 있는 자."),
            [stage("1단계", 6, {"경기실적": 100}),
             stage("2단계", None, {"1단계 성적": 50, "면접": 30,
                                    "학생부(교과정량)": 15, "학생부(출결정량)": 5})],
            "없음", True, None,
            src_pages + [PG["체육특기자"]], note,
        )
    # 특성화고졸재직자 (정원외, 전형기간 자율화)
    if track_key == "재직":
        return _mk(
            "학생부종합(특성화고졸재직자)", "학생부위주(종합)",
            "특성화고졸재직자(정원외, 전형기간자율화)", quota,
            ("특성화고등학교 등 졸업자로서 산업체 근무경력 3년 이상 재직자 (2027.2.28 기준). "
             "원서접수 시 및 입학 시(개강일 기준) 재직 상태 유지 필수. "
             "전형기간 자율화 전형 — 수시 지원횟수(6회) 제한 미적용."),
            [stage("일괄합산", None, {"서류": 70, "학생부(교과정량)": 30})],
            "없음", True, None,
            src_pages + [PG["특성화고졸재직자"]], note,
        )
    raise ValueError(f"unknown track_key '{track_key}'")


def _mk(name, ttype, special, quota, appq, stages, csat_raw, exempt, areas, src, note):
    t = {
        "trackName":                name,
        "trackTypeRaw":             ttype,
        "recruitmentPeriodRaw":     "수시",
        "specialTypeKeyword":       special,
        "quotaInitial":             quota,
        "applicationQualification": appq,
        "reflectionStages":         [dict(s) for s in stages],
        "csatMinimumRawText":       csat_raw,
        "csatMinimumExempt":        exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult":           None,
        "sourcePages":              sorted({p for p in src if p is not None}),
    }
    if note:
        t["note"] = note
    return t


# ── 그리드 파싱 유틸 ──────────────────────────────────────────────────────────

# 각 페이지별 x-앵커 (col_key → character position)
# 검증 방법: 헤더행 'KU KU 기 특 특 KU 연 연 체 특' 위치 + 합계행 숫자 위치 대조
ANCHORS = {
    PG_GRID_P1: {
        # 물리 p19: 인쇄p19 그리드 첫 번째 페이지
        # 헤더행(L13) 'KU KU 기 특 특 KU 연 연 체 특' 및 합계행 위치로 검증
        "수시": 30,
        "교과": 40, "종합": 47, "기회균형": 53,
        "특성화고교졸업자": 59, "특수교육대상자": 65,
        "논술": 70, "연기": 75, "연출": 80, "체육": 87, "재직": 92,
    },
    PG_GRID_P2: {
        # 물리 p20: 인쇄p20 그리드 두 번째 페이지 (들여쓰기 큰 레이아웃)
        # 헤더행(L10) 위치 확인: KU@68, KU@76, 기@84, 특@93, 특@100, KU@105-106
        "수시": 59,
        "교과": 69, "종합": 77, "기회균형": 88,
        "특성화고교졸업자": 94, "특수교육대상자": 100,
        "논술": 106, "연기": 110, "연출": 116, "체육": 123, "재직": 128,
    },
    PG_GRID_P3: {
        # 물리 p21: 인쇄p21 그리드 세 번째 페이지 (들여쓰기 중간 레이아웃)
        # 데이터행 수치 확인: 일어교육과(L19) 22@35,3@45,19@51; 합계행(L40) 1880@33,345@42,903@51,...
        "수시": 35,
        "교과": 44, "종합": 51, "기회균형": 58,
        "특성화고교졸업자": 64, "특수교육대상자": 71,
        "논술": 76, "연기": 82, "연출": 88, "체육": 95, "재직": 101,
    },
}

TOL = 5   # ±5 자 이내 최근접 앵커 배정

TRACK_COLS = ["교과", "종합", "기회균형", "특성화고교졸업자",
              "특수교육대상자", "논술", "연기", "연출", "체육", "재직"]


def parse_cells(ln, A):
    """숫자 토큰을 최근접 앵커에 배정. {col_key: value} 반환. 충돌시 더 가까운 것 우선."""
    assignments = {}  # col_key -> (value, dist)
    for m in re.finditer(r"\d[\d,]*", ln):
        val = int(m.group().replace(",", ""))
        pos = m.start()
        best_key  = None
        best_dist = TOL + 1
        for k, anchor in A.items():
            d = abs(anchor - pos)
            if d < best_dist:
                best_dist = d
                best_key  = k
        if best_key and best_dist <= TOL:
            # 충돌: 더 가까운 것만 유지
            if best_key not in assignments or best_dist < assignments[best_key][1]:
                assignments[best_key] = (val, best_dist)
    return {k: v for k, (v, _) in assignments.items()}


# 계열 추출
GYE_LABELS = ["인문/자연", "자연/인문", "예체능", "인문", "자연"]

def extract_gye(head):
    for lab in GYE_LABELS:
        if lab in head:
            return None if "/" in lab else lab  # 복합계열 → None
    return None


def _head_cut(ln, susi_anchor):
    """
    수시모집인원 숫자가 시작하는 위치 직전을 head 경계로 반환.
    앵커 ±8 범위에서 첫 숫자의 시작 위치를 탐색, 없으면 susi_anchor 자체를 반환.
    """
    lo = max(0, susi_anchor - 8)
    hi = min(len(ln), susi_anchor + 8)
    m = re.search(r"\d", ln[lo:hi])
    if m:
        return lo + m.start()
    return susi_anchor


def extract_name(head):
    """
    head 텍스트에서 모집단위명 추출.
    패턴: '[spaces][단과대학?][spaces][모집단위][spaces][계열][spaces숫자시작전]'
    → 계열 라벨(인문/자연/예체능) 제거 후 마지막 공백 분리 덩어리.
    """
    text = head.rstrip()
    # 계열 라벨(인문/자연/예체능 등) 제거
    text = re.sub(r"\s+(인문/자연|자연/인문|예체능|인문|자연)\s*$", "", text)
    text = text.rstrip()
    # 끝에 남은 숫자 제거 (혹시 첫 자리가 head에 섞인 경우 대비)
    text = re.sub(r"\s+\d+\s*$", "", text).rstrip()
    # 2+ 공백으로 분리
    chunks = [c for c in re.split(r"\s{2,}", text) if c.strip()]
    if not chunks:
        return ""
    name = chunks[-1].strip()
    # 후위 기호 제거 (* ** ☆ ★ 등)
    name = re.sub(r"[\*☆★◇◉◆]+$", "", name).strip()
    # 순수 숫자만 남으면 빈 문자열 반환
    if re.fullmatch(r"\d+", name):
        return ""
    return name


# ── 메인 파싱 ─────────────────────────────────────────────────────────────
departments = []
parse_fail  = []
_seen        = set()

# 열합 집계
col_inner = {k: 0 for k in ["교과", "종합", "기회균형", "논술", "연기", "연출", "체육"]}
col_outer = {k: 0 for k in ["특성화고교졸업자", "특수교육대상자", "재직"]}


def _is_skip_line(ln, A, head):
    """합계행·헤더·페이지번호 등 스킵 여부."""
    stripped = head.strip()
    if "합 계" in stripped or "합계" in stripped:
        return True
    if "모집인원" in stripped and "단과대학" in ln:
        return True
    if re.search(r"^\s*\d+\s*[–\-]\s*KONKUK", ln):
        return True
    if re.search(r"수시모집요강\s*[–\-]\s*\d+", ln):
        return True
    return False


# 특수교육대상자는 PDF에서 단과대학 단위로 모집 (개별 학과 배정 없음).
# 그리드에서 단독행 또는 인근 행 특수교육대상자 열로 표시.
# 3개 단과대학 그룹별 가상 모집단위로 생성:
#   - 문과대학(특수교육대상자): 8명 (p19 L33 standalone 8@pos65)
#   - 사회과학대학(특수교육대상자): 8명 (p20 L23 행정학과행 pos100=8 → 별도 추출)
#   - 경영대학(특수교육대상자): 4명 (p20 L32 standalone 4@pos100)
# → 이 값들은 개별 학과 tracks에 포함하지 않고, 별도 departments로 생성.

# 사회과학대학 특수교육대상자 8명은 행정학과 행에서 읽힘 → 행정학과 parse시 특수교육대상자 분리
# 경영대학 특수교육대상자 4명은 별도 행 → pending_specials로 캐치

SPEC_EDU_GROUPS = {
    # name → (quota, gye, source_page)
    "문과대학(특수교육대상자)":    (8, "인문", PG_GRID_P1),
    "사회과학대학(특수교육대상자)": (8, "인문", PG_GRID_P2),
    "경영대학(특수교육대상자)":    (4, "인문", PG_GRID_P2),
}

# standalone_specials: 수시 열 없이 특수교육대상자만 있는 행에서 감지
standalone_special_found = {}  # college_name → value

for pi in PG_GRID:
    A = ANCHORS[pi]
    susi_anchor = A["수시"]
    prev_name = None

    for li, ln in enumerate(pages[pi - 1].splitlines()):
        cells = parse_cells(ln, A)
        if "수시" not in cells:
            # 특수교육대상자 단독행 감지
            if "특수교육대상자" in cells and len(cells) == 1:
                v = cells["특수교육대상자"]
                # p19 pos65=8 → 문과대학
                # p20 pos100=4 (경영대학 standalone) → 경영대학
                # p20 pos100=8 from 행정학과 행은 susi가 있어 여기로 오지 않음
                if pi == PG_GRID_P1:
                    standalone_special_found["문과대학(특수교육대상자)"] = v
                elif pi == PG_GRID_P2:
                    standalone_special_found["경영대학(특수교육대상자)"] = v
            continue

        cut  = _head_cut(ln, susi_anchor)
        head = ln[:cut]
        if _is_skip_line(ln, A, head):
            continue

        if not any(c in cells for c in TRACK_COLS):
            continue

        name = extract_name(head)
        if not name:
            continue

        gye  = extract_gye(head)
        prev_name = name
        susi_total = cells.get("수시", 0)

        # 특수교육대상자 열이 있는 행 (행정학과 8, 경영학과는 별도행이라 여기선 0)
        # → 행정학과 행의 특수교육대상자=8은 사회과학대학 단과대 대표값 → 별도 집계, 행합에서 제외
        spec_edu_in_row = cells.get("특수교육대상자", 0)
        if spec_edu_in_row > 0 and name in ("행정학과",):
            # 사회과학대학(특수교육대상자) 8명 = 행정학과 행의 특수교육대상자 열
            standalone_special_found["사회과학대학(특수교육대상자)"] = spec_edu_in_row
            # 행정학과 자체 tracks에는 포함 안 함

        if name in _seen:
            continue
        _seen.add(name)

        tracks = []
        tsum   = 0
        for tk in TRACK_COLS:
            if tk == "특수교육대상자":
                continue   # 특수교육대상자는 별도 가상 departments로 처리
            v = cells.get(tk, 0)
            if v == 0:
                continue
            tsum += v
            if tk in col_inner:
                col_inner[tk] += v
            else:
                col_outer[tk] += v
            tracks.append(build_track(tk, name, gye, v, [pi]))

        if not tracks:
            continue

        # 행합 검증: tsum == susi_total (특수교육대상자 제외)
        if susi_total > 0 and tsum != susi_total:
            parse_fail.append((pi, name, susi_total, tsum))
            warnings.append(
                f"[행합불일치] {name} (p{pi}): 수시인원 {susi_total} ≠ 전형합 {tsum}"
            )

        departments.append({
            "departmentName": name,
            "campus":         "서울",
            "trackHint":      gye,
            "totalQuotaHint": susi_total if susi_total > 0 else tsum,
            "tracks":         tracks,
        })

# ── 특수교육대상자 가상 departments 생성 ──────────────────────────────────────
for grp_name, (expected_q, gye, src_pi) in SPEC_EDU_GROUPS.items():
    actual_q = standalone_special_found.get(grp_name, 0)
    q = actual_q if actual_q > 0 else expected_q
    if actual_q == 0:
        warnings.append(
            f"[특수교육대상자] {grp_name}: 그리드에서 수치 미감지, PDF 명시값 {expected_q}명으로 하드코딩."
        )
    col_outer["특수교육대상자"] += q
    departments.append({
        "departmentName": grp_name,
        "campus":         "서울",
        "trackHint":      gye,
        "totalQuotaHint": q,
        "tracks": [build_track("특수교육대상자", grp_name, gye, q, [src_pi],
                               note=f"PDF p43 기준 {grp_name.split('(')[0]} 단과대학 단위 선발")],
    })

# ── KU자유전공학부 trackHint 보정 ───────────────────────────────────────────
# 모집인원 총괄표에서 '인문/' 와 '자연' 이 두 줄로 분리 표기됨 → 복합계열
for dept in departments:
    if dept["departmentName"] == "KU자유전공학부":
        dept["trackHint"] = None   # 인문/자연 복합

# ── warnings ─────────────────────────────────────────────────────────────────
warnings.append(
    "[수시미선발] 예술디자인대학: 커뮤니케이션디자인학과·산업디자인학과·의상디자인학과(인문계·예체능계)·"
    "리빙디자인학과·현대미술학과·영상디자인학과는 모집인원 총괄표에 수시 모집인원 없음 → 생성 안 함. "
    "사범대학 음악교육과 동일."
)
warnings.append(
    "[캠퍼스] 본 PDF는 건국대학교 서울캠퍼스 수시 요강 단독본. "
    "글로컬(충주)=kcue_0000053, 본 PDF에 모집표 없음. 전 학과 campus='서울'."
)
warnings.append(
    "[특수교육대상자] 정원외 단과대 단위 모집: 인문계(문과대 등)8 + 경영대 4 + 기타 8 = 총 20명. "
    "합계행 1,880명은 특수교육대상자 미포함. 정원내외 총합 1,900명."
)
warnings.append(
    "[특성화고졸재직자] 공과대학 산업경영융합학부 165명 전담. "
    "전형기간 자율화 전형 — 수시 6회 지원 제한 미적용."
)
warnings.append(
    "[수의예과] 논술 수능최저: 국·수·영·사과탐(1과목) 중 3개 등급합 4+한국사5 (일반 학과는 2개 합5)."
)
warnings.append(
    "[KU자유전공학부] 상허교양대학 소속 무전공 모집단위. "
    "인문/자연 복합계열 → trackHint=None. "
    "수시348=교과(KU지역균형)100+종합(KU자기추천)183+논술(KU논술우수자)65. "
    "모집인원 총괄표에서 인문/자연 두 줄로 분할 표기."
)
if parse_fail:
    warnings.append(
        f"[행합실패] {len(parse_fail)}건: " +
        "; ".join(f"{n}(예상{g}≠합{s})" for _, n, g, s in parse_fail)
    )

# ── 열합 검증 ─────────────────────────────────────────────────────────────────
EXPECTED_INNER = {
    "교과": 345, "종합": 903, "기회균형": 79,
    "논술": 328, "연기": 15, "연출": 10, "체육": 13,
}
EXPECTED_OUTER = {
    "특성화고교졸업자": 22, "특수교육대상자": 20, "재직": 165,
}

coltotal_inner = [
    (t, col_inner[t], EXPECTED_INNER[t], col_inner[t] == EXPECTED_INNER[t])
    for t in EXPECTED_INNER
]
coltotal_outer = [
    (t, col_outer[t], EXPECTED_OUTER[t], col_outer[t] == EXPECTED_OUTER[t])
    for t in EXPECTED_OUTER
]

EXPECTED_INNER_GYE = 1693   # 정원내 7개 전형 합 (345+903+79+328+15+10+13)
EXPECTED_OUTER_GYE = 207    # 22(특성화고교졸업자)+20(특수교육대상자)+165(재직)
# PDF합계행(1,880) = 정원내1,693 + 정원외(특성화고교졸업자22+재직165) = 1,880
# (특수교육대상자20은 합계행에서 별도 열로 표시, 1,880에 미포함)

inner_gye = sum(col_inner.values())
outer_gye = sum(col_outer.values())

checksumPassed = (
    len(parse_fail) == 0
    and all(m for _, _, _, m in coltotal_inner)
    and all(m for _, _, _, m in coltotal_outer)
)

# ── 결과 조립 ────────────────────────────────────────────────────────────────
result = {
    "universityName":    "건국대학교",
    "year":              2027,
    "recruitmentSeason": "susi",
    "departments":       departments,
    "warnings":          warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T  = len(all_tracks)
D  = len(departments)

def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n   = cnt(lambda t: t["quotaInitial"] is not None)
r_n   = cnt(lambda t: bool(t["reflectionStages"]))
c_n   = cnt(lambda t: t["csatMinimumRawText"] is not None)
sp_n  = cnt(lambda t: bool(t["sourcePages"]))
comp_n = cnt(lambda t: t["quotaInitial"] is not None
                       and bool(t["reflectionStages"])
                       and bool(t["sourcePages"]))

row_pass = D - len(parse_fail)

meta = {
    "universityName":    "건국대학교",
    "universityId":      "kcue_0000052",
    "year":              2027,
    "recruitmentSeason": "susi",
    "sourceDocYear":     2027,
    "campusScope":       "서울캠퍼스 단독 (글로컬=kcue_0000053, 본 PDF에 없음)",
    "method":            "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost":        0.0,
    "departments":       D,
    "totalTracks":       T,
    "rowSumValidation": {
        "basis":      "수시모집인원(정원내외) + 특수교육대상자 합산",
        "passed":     row_pass,
        "failed":     len(parse_fail),
        "failedList": [{"page": p, "name": n, "expected": g, "actual": s}
                       for p, n, g, s in parse_fail],
    },
    "colTotalValidationInner": [
        {"track": n, "computed": g, "expectedSumRow": e, "match": m}
        for n, g, e, m in coltotal_inner
    ],
    "colTotalValidationOuter": [
        {"track": n, "computed": g, "expectedSumRow": e, "match": m}
        for n, g, e, m in coltotal_outer
    ],
    "colTotalGye": {
        "innerComputed": inner_gye, "innerExpected": EXPECTED_INNER_GYE,
        "innerMatch":    inner_gye == EXPECTED_INNER_GYE,
        "outerComputed": outer_gye, "outerExpected": EXPECTED_OUTER_GYE,
        "outerMatch":    outer_gye == EXPECTED_OUTER_GYE,
    },
    "fillRatios": {
        "quotaInitial":       [q_n,  T],
        "reflectionStages":   [r_n,  T],
        "csatMinimumRawText": [c_n,  T],
        "sourcePages":        [sp_n, T],
    },
    "completeRecords": [comp_n, T],
    "checksumPassed":  checksumPassed,
}

(BASE / "konkuk-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# ── 콘솔 리포트 ──────────────────────────────────────────────────────────────
SEP = "=" * 72
print(SEP)
print("건국대학교 서울캠퍼스 2027 수시 — 텍스트 직접 구조화 ($0, Vision 미사용)")
print(SEP)
print(f"그리드 물리페이지: {PG_GRID}")
print(f"캠퍼스: 서울 단독 (글로컬 kcue_0000053 별도)")
print(f"\n학과(모집단위): {D}  |  전형(track): {T}")
print(f"행합 검증: 통과 {row_pass} / 실패 {len(parse_fail)}")
if parse_fail:
    for p, n, g, s in parse_fail:
        print(f"   FAIL  p{p} {n}: 예상 {g} ≠ 합 {s}")

print("\n열합 검증 — 정원내:")
for n, g, e, m in coltotal_inner:
    mark = "OK  " if m else "FAIL"
    print(f"  {mark}  {n:14s}: 계산={g:4d}  합계행={e:4d}")
inner_match = inner_gye == EXPECTED_INNER_GYE
print(f"  {'OK  ' if inner_match else 'FAIL'}  계(정원내): 계산={inner_gye}  합계행={EXPECTED_INNER_GYE}")

print("\n열합 검증 — 정원외:")
for n, g, e, m in coltotal_outer:
    mark = "OK  " if m else "FAIL"
    print(f"  {mark}  {n:20s}: 계산={g:4d}  합계행={e:4d}")
outer_match = outer_gye == EXPECTED_OUTER_GYE
print(f"  {'OK  ' if outer_match else 'FAIL'}  계(정원외): 계산={outer_gye}  합계행={EXPECTED_OUTER_GYE}")

print(f"\nmeta.checksumPassed = {checksumPassed}")

print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n),
                 ("csatMinimumRawText", c_n), ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    pct = 100 * n // T if T else 0
    print(f"  {label:22s}: {n}/{T} ({pct}%)")

print(f"\nwarnings: {len(warnings)}건")
print(f"SAVED: {BASE / 'konkuk-text.json'}")
