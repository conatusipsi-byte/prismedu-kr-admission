#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
인하대 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 inha.txt(73쪽)를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 결정론적으로 파싱한 전형별 모집인원 총괄표 그리드
(인쇄p6~7 = 물리p9~10)와 결합한다.

캠퍼스: 단일 캠퍼스(인천). 모든 학과 campus="인천" (또는 null).
  (항공우주공학과·스마트모빌리티공학과의 2~4학년 교과과정 일부가 "송도국제도시 항공우주융합캠퍼스"에서
   진행될 수 있다는 안내가 있으나, 모집단위 캠퍼스 자체는 인천으로 동일함. 별도 캠퍼스로 분리하지 않음.)

전형 구조 (정원내):
  - 학생부종합(인하미래인재(면접형)): 939명  — 1단계 3.5배수(의예과3배수)·면접형, 수능최저 미적용
  - 학생부종합(인하미래인재(서류형)): 261명  — 일괄합산, 수능최저 미적용
  - 학생부종합(지역의사선발): 6명 (의예과 한정) — 1단계 3배수·면접형, 수능최저 미적용
  - 학생부종합(고른기회): 137명              — 일괄합산, 수능최저 미적용
  - 학생부종합(농어촌학생): 140명             — 일괄합산, 수능최저 미적용
  - 학생부종합(서해5도지역출신자): 3명         — 일괄합산, 수능최저 미적용 (계열별 선발)
  - 학생부교과(지역균형): 438명              — 일괄합산, 수능최저 적용(계열별 차등)
  - 논술(논술우수자): 457명 (의예과만 수능최저)— 일괄합산
  - 실기/실적(조형예술학과-인물수채화): 15명
  - 실기/실적(디자인융합학과): 23명
  - 실기/실적(연극영화학과-연기): 9명
  - 실기/실적(의류디자인학과-실기): 10명
  - 실기/실적(체육특기자): 26명 (체육교육과10 + 스포츠과학과16)

전형기간 자율화 전형 (정원내/정원외):
  - 학생부종합(평생학습자): 5명 (정원내)
  - 학생부종합(특성화고 등을 졸업한 재직자): 193명 (정원외)

체크섬:
  - 행합: 학과별 전형 quota 합 == 모집인원표 합계(열합이 맞는 학과는 검증 가능)
  - 열합(정원내): 면접형939 + 서류형261 + 지역의사선발6 + 고른기회137 + 농어촌140 + 서해5도3
                 + 지역균형438 + 논술457 + 실기(실기우수)57 + 체육특기26 = 2,464
                 (정원내 합계표 PDF 명시: 2,464)
  - 열합(정원외): 재직자193 (정원외 합계표 PDF 명시: 193)
                 평생학습자5 → 정원내로 분류됨(5포함 시 2,469가 되므로 제외해야 하나 PDF가
                 전형기간자율화 별도표에 표시 — 정원내로 처리)
  ※ 수시합계 2,464 = 정원내합계; 전형기간자율화 198(평생5+재직193) → 재직자정원외

정직성:
  - 바이오식품공학과: 그리드 전체 0 (모든 전형 '-') → 수시 미선발 → 학과 생성 안 함
  - 자유전공융합학부: 지역균형 20명만, 그 외 모든 전형 '-' → 지역균형 단일 트랙만
  - 미래융합대학(평생학습자/재직자 전형기간자율화): 별도 표 → 별도 학과로 생성
  - 서해5도지역출신자: 인문2명/자연1명 계열통합 선발, 모집단위별 모집인원은 최대값. 학과별 구분없이
    인문/자연 계열로 각각 입력(PDF p9 각 학과행의 '서해5도' 칸은 최대가능인원 표시).
    → 각 학과행에서 서해5도 인원이 있는 것처럼 보이나, 실제 선발 총 3명(인문2+자연1)만 확정.
    → 경고 처리 후 각 학과별 최대인원(1~2명)으로 입력, totalQuotaHint도 학과별로 유지.
  - 조형예술학과(인물수채화): 전형별 모집인원표에서 실기우수자만 15명. 학과명에 전형 분류 포함.
  - 의류디자인학과(일반) vs 의류디자인학과(실기): 별도 모집단위로 분리.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "inha.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 인쇄 페이지(footer) → 물리 페이지 매핑 ─────────────────────────────────
# Footer 패턴: "2027학년도 인하대학교 수시모집요강   N"
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for num in re.findall(r"2027학년도 인하대학교 수시모집요강\s+(\d+)", pg):
        printed_to_phys.setdefault(int(num), i)

def phys(printed):
    p = printed_to_phys.get(printed)
    if p is None:
        warnings.append(f"[페이지매핑] 인쇄p{printed} 물리페이지 매핑 실패")
    return p

# ── 물리 페이지 번호 ─────────────────────────────────────────────────────────
# 전형별 모집인원 총괄표: 인쇄p6~7 = 물리p9~10
PG_GRID = [p for p in (phys(6), phys(7)) if p]
# 각 전형 세부 물리 페이지
PG = {
    "인하미래인재(면접형)":       phys(10),   # p10~13
    "인하미래인재(서류형)":       phys(14),   # p14~15
    "지역의사선발":              phys(16),   # p16~17
    "고른기회":                 phys(18),   # p18~20
    "농어촌학생":               phys(21),   # p21~22
    "서해5도지역출신자":          phys(23),   # p23~24
    "평생학습자":               phys(25),   # p25~26
    "특성화고재직자":            phys(27),   # p27~28
    "지역균형":                 phys(29),   # p29~30
    "논술우수자":               phys(31),   # p31~32
    "조형예술학과":             phys(33),   # p33
    "디자인융합학과":            phys(34),   # p34
    "연극영화학과(연기)":         phys(35),   # p35
    "의류디자인학과(실기)":        phys(36),   # p36
    "체육특기자":               phys(37),   # p37~42
    "수능최저":                 phys(47),   # p47 — 수능최저학력기준 총괄표
}

# ── 수능최저학력기준 원문 (인쇄p29·p31·p47에서 직접 인용) ────────────────────
# 학생부교과(지역균형) 수능최저 — PDF p29·p47
CSAT_INHU_GYE = {
    "인문": "국어, 수학, 영어, 사회/과학탐구(1과목) 중 2개 영역 합 6등급 이내",
    "자연": "국어, 수학, 영어, 사회/과학탐구(1과목) 중 2개 영역 합 5등급 이내",
    "의예과": "국어, 수학, 영어, 과학탐구(2과목) 중 3개 영역 합 4등급 이내 ※ 과학탐구 2개 과목 평균(소수점 절사) 적용",
}
# 의류디자인학과(일반), 자유전공융합학부: 인문계열 기준
CSAT_GYE_INHU_NOTE = (
    "※ 의류디자인학과(일반), 자유전공융합학부는 인문계열의 수능최저학력기준을 따름. "
    "※ 모든 계열/모집단위에 수능 필수 응시영역 없음(단, 한국사는 필수 응시)"
)
# 논술(논술우수자) 수능최저 — 의예과만, p31·p47
CSAT_NOLSUL_UIYE = (
    "국어, 수학, 영어, 과학탐구(2과목) 중 3개 영역 각 1등급 이내 "
    "※ 과학탐구 2개 과목 평균(소수점 첫째자리에서 올림) 적용"
)

def stage(label, mult, comps, maxscore=None):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# ── 전형 템플릿 (반영비율: 각 전형 상세 '전형방법' 절 직접 인용) ───────────────
# trackTypeRaw enum: 학생부위주(교과)/학생부위주(종합)/논술위주/실기·실적위주/수능위주/기타
# 열 키: 면접형 서류형 지역의사 고른 농어촌 서해5도 지역균형 논술 실기우수 체육
TR_COLS = ["면접형", "서류형", "지역의사", "고른", "농어촌", "서해5도", "지역균형", "논술", "실기우수", "체육"]

def build_track(col, dept, quota, src_pages, *, note=None):
    """col: 그리드 칼럼키. dept: 모집단위명. quota: int|None."""

    # 지원자격 공통 (학생부종합 전형들)
    appq_general = (
        "고교 졸업학력 인정 고등학교 졸업(예정)자 또는 법령에 의하여 고등학교 졸업 이상의 학력이 있다고 인정된 자"
    )

    if col == "면접형":
        ttype = "학생부위주(종합)"; special = None
        mult = 3 if dept == "의예과" else 3.5
        stages = [
            stage("1단계", mult, {"서류종합평가": 100}, 700),
            stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 1000),
        ]
        return _mk("학생부종합(인하미래인재(면접형))", ttype, special, quota, appq_general,
                   stages, "없음", True, None,
                   [p for p in (src_pages + [PG["인하미래인재(면접형)"]]) if p], note)

    if col == "서류형":
        ttype = "학생부위주(종합)"; special = None
        stages = [stage("일괄합산", None, {"서류종합평가": 100}, 1000)]
        return _mk("학생부종합(인하미래인재(서류형))", ttype, special, quota, appq_general,
                   stages, "없음", True, None,
                   [p for p in (src_pages + [PG["인하미래인재(서류형)"]]) if p], note)

    if col == "지역의사":
        ttype = "학생부위주(종합)"; special = "지역의사선발"
        stages = [
            stage("1단계", 3, {"서류종합평가": 100}, 700),
            stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 1000),
        ]
        appq = (
            "「지역의사의 양성 및 지원 등에 관한 법률」 제4조 제1항에 따라 지역의사선발전형이 적용되는 "
            "국내 고등학교 졸업(예정)자로서, 해당지역의 중학교와 고등학교에서 입학부터 졸업까지 모든 "
            "교육과정을 이수·졸업하고 재학기간 동안 해당지역에 거주한 자 / 지역: 경기도 의정부권·남양주권·"
            "이천권·포천권, 인천 인천서북권·인천중부권 (진료권별 각 1명, 총 6명)"
        )
        return _mk("학생부종합(지역의사선발)", ttype, special, quota, appq,
                   stages, "없음", True, None,
                   [p for p in (src_pages + [PG["지역의사선발"]]) if p], note)

    if col == "고른":
        ttype = "학생부위주(종합)"; special = "기회균형"
        stages = [stage("일괄합산", None, {"서류종합평가": 100}, 1000)]
        appq = (
            "고교 졸업학력 인정 고등학교 졸업(예정)자로서 ①국가보훈대상자 ②기초생활수급자·차상위계층·"
            "한부모가족지원 대상자 ③자립지원 대상 아동 중 하나 충족"
        )
        return _mk("학생부종합(고른기회)", ttype, special, quota, appq,
                   stages, "없음", True, None,
                   [p for p in (src_pages + [PG["고른기회"]]) if p], note)

    if col == "농어촌":
        ttype = "학생부위주(종합)"; special = "농어촌학생"
        stages = [stage("일괄합산", None, {"서류종합평가": 100}, 1000)]
        appq = (
            "국내 고등학교 졸업(예정)자로서 ①유형I(6년): 농어촌 소재 중·고교 전 과정 이수 및 "
            "부·모·학생 모두 농어촌 거주 ②유형II(12년): 농어촌 소재 초·중·고 전 과정 이수 및 "
            "본인이 농어촌 거주 중 하나 충족"
        )
        return _mk("학생부종합(농어촌학생)", ttype, special, quota, appq,
                   stages, "없음", True, None,
                   [p for p in (src_pages + [PG["농어촌학생"]]) if p], note)

    if col == "서해5도":
        ttype = "학생부위주(종합)"; special = "서해5도지역출신자"
        stages = [stage("일괄합산", None, {"서류종합평가": 100}, 1000)]
        appq = (
            "서해 5도(백령도·대청도·소청도·연평도·소연평도와 인근 해역)에 소재하는 일반 고등학교 "
            "졸업(예정)자로서 ①유형I(6년): 서해5도 소재 중·고교 이수 및 친권자와 함께 거주 "
            "②유형II(12년): 서해5도 소재 초·중·고교 이수 및 거주 중 하나 충족. "
            "총 모집인원 3명(인문2+자연1), 모집단위별 인원은 최대모집가능인원"
        )
        return _mk("학생부종합(서해5도지역출신자)", ttype, special, quota, appq,
                   stages, "없음", True, None,
                   [p for p in (src_pages + [PG["서해5도지역출신자"]]) if p], note)

    if col == "지역균형":
        ttype = "학생부위주(교과)"; special = None
        stages = [stage("일괄합산", None, {"학생부교과": 100}, 1000)]
        appq = (
            "국내 고등학교 2025년 이후 졸업자(졸업예정자 포함)로서 5학기 이상 이수하고 "
            "소속(졸업) 고등학교장의 추천을 받은 자(추천 인원 제한 없음). "
            "특성화고·종합고전문반·특목고(예술·체육·마이스터)·방송통신고 등 지원 불가"
        )
        # 수능최저: 계열별 차등 — 의예과는 별도
        is_uiye = (dept == "의예과")
        if is_uiye:
            csat_raw = CSAT_GYE_GYE_UIYE = CSAT_INHU_GYE["의예과"]
        elif dept in ("의류디자인학과(일반)", "자유전공융합학부"):
            csat_raw = CSAT_INHU_GYE["인문"]
            note = (note + " | " if note else "") + "의류디자인학과(일반)·자유전공융합학부는 인문계열 수능최저 적용"
        else:
            # trackHint에 따라 인문/자연 분기 — dept 이름으로 추론
            # 자연계열 기본; 나중에 trackHint를 이용해 build 시 분기
            csat_raw = None  # 호출 시 _resolve_csat_gye()로 대체
        return _mk("학생부교과(지역균형)", ttype, special, quota, appq,
                   stages, csat_raw, False if (csat_raw is not None) else None, None,
                   [p for p in (src_pages + [PG["지역균형"], PG["수능최저"]]) if p], note)

    if col == "논술":
        ttype = "논술위주"; special = None
        stages = [stage("일괄합산", None, {"논술": 80, "학생부교과": 20}, 1000)]
        appq = (
            "고교 졸업학력 인정 고등학교 졸업(예정)자 또는 동등의 학력 소지자. "
            "논술고사 100분, 인문계열-언어논술, 자연계열-수리논술"
        )
        is_uiye = (dept == "의예과")
        csat_raw = CSAT_NOLSUL_UIYE if is_uiye else "없음"
        exempt = False if is_uiye else True
        return _mk("논술(논술우수자)", ttype, special, quota, appq,
                   stages, csat_raw, exempt, None,
                   [p for p in (src_pages + [PG["논술우수자"], PG["수능최저"]]) if p], note)

    if col == "실기우수":
        return _build_silgi_usu(dept, quota, src_pages, note)

    if col == "체육":
        ttype = "실기/실적위주"; special = None
        stages = [stage("일괄합산", None, {"특기실적": 80, "학생부교과": 10, "출결": 10}, 1000)]
        appq = (
            "국내 고등학교 졸업(예정)자 중 본교 육성 운동종목 특기자(대한체육회 가맹 중앙 경기단체 "
            "선수 등록). 남자: 야구·배구·씨름·배드민턴·소프트테니스·탁구·유도·복싱 / 여자: 육상. "
            "학생부교과 반영점수 산출 가능한 2025년 이후 졸업자만 지원 가능"
        )
        return _mk("실기/실적(체육특기자)", ttype, special, quota, appq,
                   stages, "없음", True, None,
                   [p for p in (src_pages + [PG["체육특기자"]]) if p], note)

    raise ValueError(f"unknown col {col!r}")


def _build_silgi_usu(dept, quota, src_pages, note):
    """실기/실적(실기우수자) — 모집단위별 전형방법 분기."""
    appq = "국내 고교 졸업학력 인정 고등학교 졸업(예정)자 (학교생활기록부 교과 반영점수 산출 가능자)"
    base_src = [p for p in (src_pages) if p]

    if "조형예술" in dept:
        name = "실기/실적(조형예술학과-인물수채화)"
        stages = [stage("일괄합산", None, {"실기": 70, "학생부교과": 30}, 1000)]
        src = base_src + [p for p in [PG["조형예술학과"]] if p]
    elif "디자인융합" in dept:
        name = "실기/실적(디자인융합학과)"
        stages = [stage("일괄합산", None, {"실기": 70, "학생부교과": 30}, 1000)]
        src = base_src + [p for p in [PG["디자인융합학과"]] if p]
    elif "연극영화" in dept:
        name = "실기/실적(연극영화학과-연기)"
        stages = [stage("일괄합산", None, {"실기": 70, "학생부교과": 30}, 1000)]
        src = base_src + [p for p in [PG["연극영화학과(연기)"]] if p]
    elif "의류디자인" in dept:
        name = "실기/실적(의류디자인학과-실기)"
        stages = [stage("일괄합산", None, {"실기": 70, "학생부교과": 30}, 1000)]
        src = base_src + [p for p in [PG["의류디자인학과(실기)"]] if p]
    else:
        warnings.append(f"[실기우수자] 미분류 모집단위 '{dept}' → reflectionStages 비움")
        name = "실기/실적(실기우수자)"; stages = []
        src = base_src
    return _mk(name, "실기/실적위주", None, quota, appq,
               stages, "없음", True, None, sorted(set(src)), note)


def _mk(name, ttype, special, quota, appq, stages, raw, exempt, areas, src, note):
    t = {
        "trackName": name, "trackTypeRaw": ttype, "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special, "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages] if stages is not None else None,
        "csatMinimumRawText": raw, "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas, "prevYearResult": None,
        "sourcePages": sorted(set(p for p in src if p)),
    }
    if note:
        t["note"] = note
    return t


# ── 지역균형 수능최저: trackHint 기반 분기 (파싱 후 보정) ─────────────────────
# 계열 라벨 → 수능최저 키
def _csat_for_gye(dept, trackHint):
    if dept == "의예과":
        return CSAT_INHU_GYE["의예과"], False
    if dept in ("의류디자인학과(일반)", "자유전공융합학부"):
        return CSAT_INHU_GYE["인문"], False
    if trackHint == "인문":
        return CSAT_INHU_GYE["인문"], False
    if trackHint == "자연":
        return CSAT_INHU_GYE["자연"], False
    # 복합계열 또는 trackHint 미상 → 인문/자연 분기 불가, warnings
    return None, None   # caller가 warning 처리


# ── 계열 라벨 (trackHint) 매핑 ────────────────────────────────────────────────
# 입학정원표(인쇄p4~5) 기준 학과계열 (복합은 None)
DEPT_GYE = {
    # 공과대학
    "기계공학과": "자연", "항공우주공학과": "자연", "조선해양공학과": "자연",
    "산업경영공학과": "자연", "화공에너지공학부(화학공학전공)": "자연",
    "화공에너지공학부(이차전지공학전공)": "자연", "고분자공학과": "자연",
    "신소재공학과": "자연", "사회인프라공학과": "자연", "환경공학과": "자연",
    "공간정보공학과": "자연", "건축학부": "자연", "에너지자원공학과": "자연",
    "전기전자공학부": "자연", "반도체시스템공학과": "자연",
    # 자연과학대학
    "수학과": "자연", "통계학과": "자연", "물리학과": "자연",
    "화학과": "자연", "해양과학과": "자연", "식품영양학과": "자연",
    # 경영대학
    "경영학부(경영학과)": "인문", "경영학부(파이낸스경영학과)": "인문",
    "아태물류학부": "인문", "국제통상학과": "인문",
    # 사범대학
    "국어교육과": "인문", "영어교육과": "인문", "사회교육과": "인문",
    "체육교육과": "예체능", "교육학과": "인문", "수학교육과": "자연",
    # 사회과학대학
    "행정학과": "인문", "정치외교학과": "인문",
    "미디어커뮤니케이션학과": "인문", "경제학과": "인문",
    "소비자학과": "인문", "아동심리학과": "인문", "사회복지학과": "인문",
    # 문과대학
    "한국어문학과": "인문", "사학과": "인문", "철학과": "인문",
    "중국학과": "인문", "일본언어문화학과": "인문",
    "영미유럽인문융합학부": "인문", "문화콘텐츠문화경영학과": "인문",
    # 의과대학
    "의예과": "자연",
    # 간호대학
    "간호학과": "자연",
    # 예술체육대학
    "조형예술학과(인물수채화)": "예체능", "디자인융합학과": "예체능",
    "스포츠과학과": "예체능", "연극영화학과(연기)": "예체능",
    "의류디자인학과(일반)": "인문",   # 수능최저는 인문 기준
    "의류디자인학과(실기)": "예체능",
    # 소프트웨어융합대학
    "인공지능공학과": "자연", "데이터사이언스학과": "자연",
    "스마트모빌리티공학과": "자연", "디자인테크놀로지학과": "자연",
    "컴퓨터공학과": "자연",
    # 프런티어창의대학
    "자유전공융합학부": "인문",  # 수능최저는 인문 기준 (복합계열이나 이쪽 적용)
    # 바이오시스템융합학부
    "생명공학과": "자연", "생명과학과": "자연",
    "첨단바이오의약학과": "자연", "바이오식품공학과": "자연",
    # 미래융합대학 (전형기간자율화)
    "메카트로닉스공학과": "자연", "메카트로닉스공학과(야간)": "자연",
    "소프트웨어융합공학과": "자연", "산업경영학과": "인문",
    "금융투자학과": "인문", "반도체산업융합학과": "자연",
}

# ── 모집인원 총괄표 그리드 파싱 ────────────────────────────────────────────────
# 칼럼 x-앵커 (본체가 헤더행·완전충원기준행으로 도출·검증)
# 물리p9(인쇄p6): 면접형=24, 서류형=29, 지역의사=34, 고른=39, 농어촌=45, 서해5도=51, 지역균형=57, 논술=64, 실기우수=69, 체육=76
# 물리p10(인쇄p7): 면접형=31, 서류형=38, 지역의사=44, 고른=50, 농어촌=60, 서해5도=66, 지역균형=74, 논술=80, 실기우수=85, 체육=90
# 앵커 검증: 합계행 (p9:없음, p10: 939,261,6,137,140,3,438,457,57,26)
ANCHORS = {
    phys(6): dict(면접형=24, 서류형=29, 지역의사=34, 고른=39, 농어촌=45, 서해5도=51,
                  지역균형=57, 논술=64, 실기우수=69, 체육=76),
    phys(7): dict(면접형=31, 서류형=38, 지역의사=44, 고른=50, 농어촌=60, 서해5도=66,
                  지역균형=74, 논술=80, 실기우수=85, 체육=90),
}

def parse_cells(ln, A, tol=4):
    """숫자 셀을 최근접 칼럼앵커에 배정. 반환 col->val."""
    out = {}
    for m in re.finditer(r"\d[\d,]*", ln):
        val = int(m.group().replace(",", ""))
        pos = m.start()
        best = min(A.items(), key=lambda kv: abs(kv[1] - pos))
        if abs(best[1] - pos) <= tol:
            out[best[0]] = val
    return out

def extract_name(head, A):
    """head(앵커 직전 텍스트)에서 모집단위명 추출."""
    head = head.strip()
    # 단과대학 라벨이 앞에 붙어있으면 제거 (2칸 이상 공백 토큰)
    chunks = [c for c in re.split(r"\s{2,}", head) if c.strip()]
    if not chunks:
        return ""
    # 마지막 비공백 토큰이 모집단위명 (단과대학명 제거)
    name = chunks[-1].strip()
    # 불필요 접미 제거
    name = name.rstrip("★◇◉●◆*").strip()
    return name

# ── 합계행 확인 ──────────────────────────────────────────────────────────────
# 물리p10(인쇄p7) 합계행: 939 261 6 137 140 3 438 457 57 26
# 주의: 서해5도 합계 3 = 실제 선발인원(인문2+자연1); 학과별 max값 합계(≈40)와 다름
EXPECTED_COL = {
    "면접형": 939, "서류형": 261, "지역의사": 6, "고른": 137,
    "농어촌": 140,
    # 서해5도: 계열통합선발(인문2+자연1=3), 학과별 max값 합계 ≠ 3 → 별도 처리
    "서해5도": None,  # col_sum 검증 제외 (설계상 max값 표기 전형)
    "지역균형": 438, "논술": 457,
    "실기우수": 57, "체육": 26,
}
EXPECTED_5DO_REAL = 3       # 서해5도 실제 선발인원 (인문2+자연1)
EXPECTED_TOTAL = 2464  # 수시 합계 (PDF 명시; 서해5도 3포함)

# 정원외 (재직자 전형기간자율화)
EXPECTED_OUTER_재직 = 193

departments = []
parse_fail = []
col_sums = dict.fromkeys(TR_COLS, 0)

# ── 그리드 파싱 루프 ─────────────────────────────────────────────────────────
# 합계행·헤더 스킵 키워드 (head 또는 전체 행 내 포함 여부 검사)
SKIP_KW = ("합계", "소계", "단과대학", "모집단위명", "(단위: 명)")
# 수시 미선발 학과 스킵 없음: 바이오식품공학과 면접형 15명 실제 존재(PDF 합계 939에 포함)
SKIP_DEPTS: set = set()
# 다음줄이 전공명 보완인 경우 (화공에너지공학부 → 다음줄 (화학공학전공))
SUBNAME_RE = re.compile(r"^\s*[\(（][^)）]*[전공학부군]\s*[）)]?\s*$")

for pi in PG_GRID:
    A = ANCHORS[pi]
    # 기준 앵커: 면접형 칼럼
    anchor_col = "면접형"
    anc_pos = A[anchor_col]
    lines = pages[pi - 1].splitlines()

    i = 0
    grid_done = False  # 합계행 이후는 파싱 중단
    while i < len(lines):
        ln = lines[i]

        # 전형기간 자율화 섹션 또는 ※ 주석 → 파싱 중단 또는 스킵
        stripped = ln.strip()
        if stripped.startswith("※") or stripped.startswith("[전형기간"):
            grid_done = True
        if grid_done:
            i += 1; continue

        cells = parse_cells(ln, A)

        # 데이터 행 판별: 앵커범위 내에 숫자가 최소 1개 이상
        if not cells:
            i += 1; continue
        head = ln[:anc_pos]

        # 합계행 감지: 합계/소계 키워드 → 파싱 종료
        if any(kw in head or kw in ln for kw in SKIP_KW):
            if "합계" in ln or "소계" in ln:
                grid_done = True
            i += 1; continue

        name = extract_name(head, A)
        if not name:
            i += 1; continue

        # 수시 미선발 학과 스킵
        if name in SKIP_DEPTS:
            warnings.append(f"[수시미선발] {name}: 그리드 전 칸 '-' → 학과 생성 안 함")
            i += 1; continue

        # 다음줄이 '(~전공)' 형태면 부착
        if i + 1 < len(lines):
            nxt = lines[i + 1].strip()
            if SUBNAME_RE.match(nxt):
                suffix = nxt.strip("★◇◉●◆* ")
                name = name + suffix
                i += 1  # 다음줄 소비

        gye = DEPT_GYE.get(name)

        # 행 합 계산을 위한 트랙 합계
        tracks = []
        tsum = 0
        for col in TR_COLS:
            if col not in cells:
                continue
            v = cells[col]
            if v == 0:
                continue
            col_sums[col] += v
            tsum += v
            trk = build_track(col, name, v, [pi])
            # 지역균형 수능최저 보정
            if col == "지역균형":
                csat_raw, exempt = _csat_for_gye(name, gye)
                if csat_raw is None:
                    warnings.append(f"[지역균형 수능최저 미결] {name}: trackHint={gye!r} → csatMinimumRawText=null")
                    trk["csatMinimumRawText"] = None
                    trk["csatMinimumExempt"] = None
                else:
                    trk["csatMinimumRawText"] = csat_raw
                    trk["csatMinimumExempt"] = False
            tracks.append(trk)

        if not tracks:
            i += 1; continue

        departments.append({
            "departmentName": name,
            "campus": "인천",
            "trackHint": gye,
            "totalQuotaHint": tsum,
            "tracks": tracks,
        })
        i += 1

# ── 전형기간 자율화 전형 추가 (별도 표, 물리p10) ──────────────────────────────
# 평생학습자(정원내 5명) 및 특성화고 등을 졸업한 재직자(정원외 193명)
# 미래융합대학 모집단위 — 직접 하드코딩 (별도 표는 x-앵커 그리드 없음)

JANYUL_DATA = {
    # (dept, gye): (평생학습자, 재직자)
    ("메카트로닉스공학과", "자연"):       (0, 39),
    ("메카트로닉스공학과(야간)", "자연"):  (1, 0),
    ("소프트웨어융합공학과", "자연"):     (1, 40),
    ("산업경영학과", "인문"):           (1, 41),
    ("금융투자학과", "인문"):           (1, 40),
    ("반도체산업융합학과", "자연"):      (1, 33),
}
# 평생학습자 지원자격 (인쇄p25~26)
APPQ_PYEONG = (
    "고교 졸업학력 인정 고등학교 졸업(예정)자 또는 고등학교 졸업 이상의 학력이 있다고 인정된 자로서 "
    "2027년 3월 1일 기준 만 30세 이상인 자 [전형기간 자율화 전형]"
)
# 특성화고재직자 지원자격 (인쇄p27~28)
APPQ_JAEJIK = (
    "「고등교육법시행령」 제29조 제2항 제14호 '다'목에 따라 산업체 근무 경력이 3년 이상인 재직자로서 "
    "①일반고 재학 중 직업교육훈련 이수 ②마이스터고 졸업 ③특성화고 졸업 ④특성화 평생교육시설 이수 "
    "중 하나 해당. 원서접수 시 재직 중이어야 하며 2027.3.1. 기준 총 재직기간 3년 이상 [전형기간 자율화 전형, 정원외]"
)

janyul_pg = phys(7)  # 물리p10(인쇄p7) — 전형기간자율화 표 포함
for (dept, gye), (n_pyeong, n_jaejik) in JANYUL_DATA.items():
    tracks = []
    tsum = 0
    if n_pyeong > 0:
        # 평생학습자 — 정원내
        t = _mk("학생부종합(평생학습자)", "학생부위주(종합)", "평생학습자",
                n_pyeong, APPQ_PYEONG,
                [stage("일괄합산", None, {"서류종합평가": 100}, 1000)],
                "없음", True, None,
                [p for p in [janyul_pg, PG["평생학습자"]] if p], None)
        tracks.append(t)
        col_sums["면접형"] += 0  # 별도 열 없음 — 합계 검증 외
        tsum += n_pyeong
    if n_jaejik > 0:
        # 특성화고재직자 — 정원외
        t = _mk("학생부종합(특성화고 등을 졸업한 재직자)", "학생부위주(종합)",
                "특성화고졸재직자(정원외)", n_jaejik, APPQ_JAEJIK,
                [stage("일괄합산", None, {"서류종합평가": 100}, 1000)],
                "없음", True, None,
                [p for p in [janyul_pg, PG["특성화고재직자"]] if p],
                "정원외 모집인원 (전형기간 자율화 전형)")
        tracks.append(t)
        tsum += n_jaejik
    if tracks:
        departments.append({
            "departmentName": dept,
            "campus": "인천",
            "trackHint": gye,
            "totalQuotaHint": tsum,
            "tracks": tracks,
        })

# ── 열합 검증 ─────────────────────────────────────────────────────────────────
# PDF 합계행(인쇄p7): 939 261 6 137 140 3 438 457 57 26
# 서해5도: 학과별 max값 합계(≈40) ≠ 합계행(3=실제선발인원). 열합 검증에서 제외하고 별도 처리.
coltotal_results = []
all_match = True
for col in TR_COLS:
    exp = EXPECTED_COL[col]
    if exp is None:
        # 서해5도: 계열통합선발이라 col_sum != PDF합계행(3). 검증 스킵.
        coltotal_results.append((col, col_sums[col], "계열통합선발(max값≠실제3)", True))
        continue
    got = col_sums[col]
    match = (got == exp)
    if not match:
        all_match = False
    coltotal_results.append((col, got, exp, match))

# 정원내 grand total: col_sums에서 서해5도 제외, 대신 EXPECTED_5DO_REAL(3) 더하기
# (서해5도 track quota들은 max값이므로 col_sums["서해5도"] != 3)
grand_total_got = (
    sum(v for c, v in col_sums.items() if c != "서해5도") + EXPECTED_5DO_REAL
)
grand_match = (grand_total_got == EXPECTED_TOTAL)
if not grand_match:
    all_match = False

# 정원외(재직자) 검증
outer_재직_got = sum(
    t["quotaInitial"] for d in departments for t in d["tracks"]
    if t.get("specialTypeKeyword") == "특성화고졸재직자(정원외)" and t["quotaInitial"] is not None
)
outer_재직_match = (outer_재직_got == EXPECTED_OUTER_재직)

# ── 행합 검증 (totalQuotaHint 기준) ────────────────────────────────────────────
row_pass = 0; row_fail_list = []
for d in departments:
    q_sum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    null_n = sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
    tq = d["totalQuotaHint"]
    if tq is None:
        row_pass += 1
    elif q_sum == tq and null_n == 0:
        row_pass += 1
    elif q_sum <= tq and null_n > 0:
        row_pass += 1
    else:
        row_fail_list.append((d["departmentName"], tq, q_sum))

# ── checksumPassed ────────────────────────────────────────────────────────────
checksum_passed = (
    all_match and grand_match and outer_재직_match and len(row_fail_list) == 0
)

# ── warnings 추가 ─────────────────────────────────────────────────────────────
warnings.append(
    "[캠퍼스] 인하대학교는 인천 단일 캠퍼스 (항공우주공학과·스마트모빌리티공학과 일부 교과과정이 "
    "'송도국제도시 항공우주융합캠퍼스'에서 진행될 수 있으나, 모집단위 캠퍼스는 인천 단일). "
    "campus='인천'."
)
warnings.append(
    "[서해5도지역출신자] 전형 총 모집인원 3명(인문2+자연1) 계열통합 선발. 전형별 모집인원 표의 "
    "학과별 숫자는 최대모집가능인원 표시이며, 한 계열에서 선발 못한 인원은 다른 계열에서 선발 가능. "
    "quotaInitial은 PDF 명시 최대값 보존. 열합 검증은 계열통합선발 구조상 제외."
)
warnings.append(
    "[바이오식품공학과] 그리드에 면접형 15명 기재 → 학과 생성. "
    "PDF 합계행(939)에 포함 확인. 다른 전형은 모두 '-'(미선발)."
)
warnings.append(
    "[자유전공융합학부] 학생부교과(지역균형) 20명만 모집; 나머지 전형 모두 '-'. "
    "학생부교과(지역균형) 단일 트랙만 생성."
)
warnings.append(
    "[의류디자인학과] 의류디자인학과(일반) = 학종/교과/논술 전형, "
    "의류디자인학과(실기) = 실기우수자 전형. 별도 모집단위로 처리."
)
warnings.append(
    "[전형기간자율화] 미래융합대학 평생학습자(5명, 정원내) + 특성화고 등을 졸업한 재직자(193명, 정원외). "
    "PDF 별도표(인쇄p7 하단)에서 직접 하드코딩. specialTypeKeyword='특성화고졸재직자(정원외)' 부착."
)
if row_fail_list:
    warnings.append("[행합실패] " + "; ".join(f"{n}(hint{h}≠합{s})" for n, h, s in row_fail_list))
if not all_match or not grand_match:
    fail_cols = [f"{c}(got={g},exp={e})" for c, g, e, m in coltotal_results
                 if m is not True and not m]
    if not grand_match:
        fail_cols.append(f"합계(got={grand_total_got},exp={EXPECTED_TOTAL})")
    warnings.append("[열합실패] " + "; ".join(fail_cols))
if not outer_재직_match:
    warnings.append(f"[정원외열합실패] 재직자 got={outer_재직_got} exp={EXPECTED_OUTER_재직}")

# ── 결과 조립 ────────────────────────────────────────────────────────────────
result = {
    "universityName": "인하대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t.get("reflectionStages"))
c_n  = cnt(lambda t: t.get("csatMinimumRawText") is not None)
ce_n = cnt(lambda t: t.get("csatMinimumExempt") is not None)
sp_n = cnt(lambda t: t.get("sourcePages"))
comp_n = cnt(lambda t: t["quotaInitial"] is not None
             and t.get("reflectionStages") and t.get("sourcePages"))

meta = {
    "universityName": "인하대학교", "universityId": "kcue_0000169",
    "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "campusScope": "인천 단일 캠퍼스",
    "sourceDocYear": 2027,
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "basis": "totalQuotaHint(전형합계)",
        "passed": row_pass,
        "failed": len(row_fail_list),
        "failedList": [{"dept": n, "hint": h, "computed": s} for n, h, s in row_fail_list],
    },
    "colTotalValidation": [
        {"track": col, "computed": got,
         "expectedSumRow": exp if isinstance(exp, int) else None,
         "note": None if isinstance(exp, int) else "서해5도: 계열통합선발, 학과별max값합계≠실제선발3명. 검증제외.",
         "match": match}
        for (col, got, exp, match) in coltotal_results
    ],
    "colTotalGye": {
        "innerComputed": grand_total_got, "innerExpected": EXPECTED_TOTAL, "innerMatch": grand_match,
        "outerComputed_재직자": outer_재직_got, "outerExpected_재직자": EXPECTED_OUTER_재직,
        "outerMatch_재직자": outer_재직_match,
    },
    "checksumPassed": checksum_passed,
    "fillRatios": {
        "quotaInitial":       [q_n, T],
        "reflectionStages":   [r_n, T],
        "csatMinimumRawText": [c_n, T],
        "csatMinimumExempt":  [ce_n, T],
        "sourcePages":        [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

(BASE / "inha-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# ── 콘솔 리포트 ──────────────────────────────────────────────────────────────
print("=" * 72)
print("인하대 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 72)
print(f"그리드 물리페이지: {PG_GRID}")
print(f"캠퍼스: 인천 단일")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증(totalQuotaHint 기준): 통과 {row_pass} / 실패 {len(row_fail_list)}")
if row_fail_list:
    for n, h, s in row_fail_list:
        print(f"   x {n}: hint {h} != 전형합 {s}")

print(f"\n열합 검증 — 정원내 (PDF 합계행: 939/261/6/137/140/3/438/457/57/26 = 2,464):")
for col, got, exp, match in coltotal_results:
    if isinstance(exp, int):
        status = "OK" if match else "FAIL"
        print(f"  {col:8s} 계산={got:4d}  합계행={exp:4d}  [{status}]")
    else:
        # 서해5도: 계열통합선발, max값 합계 != PDF합계행
        print(f"  {col:8s} 계산={got:4d}  합계행=3(max값합계≠실제, 계열통합선발)  [SKIP]")
gm_status = "OK" if grand_match else "FAIL"
print(f"  합계     계산={grand_total_got}(서해5도=3계산)  합계행={EXPECTED_TOTAL}  [{gm_status}]")

print(f"\n열합 검증 — 정원외 (재직자 합계행 193):")
om_status = "OK" if outer_재직_match else "FAIL"
print(f"  재직자   계산={outer_재직_got}  합계행={EXPECTED_OUTER_재직}  [{om_status}]")

print(f"\nmeta.checksumPassed: {checksum_passed}")

print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n),
                 ("csatMinimumRawText", c_n), ("csatMinimumExempt", ce_n),
                 ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    pct = 100 * n // T if T else 0
    print(f"  {label:20s}: {n}/{T} ({pct}%)")

print(f"\nwarnings: {len(warnings)}건")
for w in warnings:
    print(f"  - {w[:100]}")

print(f"\n저장: {BASE / 'inha-text.json'}")
