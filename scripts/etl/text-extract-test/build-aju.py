#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
아주대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호, 비용 $0). Claude Code 본체가 aju.txt(44페이지)를
정독해 전형 템플릿(반영비율·수능최저)과 모집단위 목록을 직접 구조화한다.

═══ 중요 경고: 이 PDF는 모집요강이 아닌 입학전형안내(브로셔)이다 ═══
  • 문서 제목: "2027학년도 아주대학교 입학전형안내"
  • 원문 명시 (p26, 물리 p26):
    "전형별, 모집단위별 모집인원은 첨단학과 증원 및 신설, 의과대학 정원 변동 등을
     반영하여 변동 예정입니다. 추후 제공하는 모집시기별 모집요강을 반드시 확인바랍니다."
  • 문서 전체에 모집인원 총괄표(학과×전형 숫자 그리드)가 존재하지 않는다.
  • 따라서 quotaInitial = null (전 전형). 숫자를 지어내지 않는 것이 정직성 원칙.
  • 행합/열합 체크섬: 그리드 없음 → 검증 대상 행 0, 열 0 → passed=0 / failed=0.
    meta.checksumPassed = True (실패 0건은 trivially 통과이나 quota 미수록 경고 필수).

캠퍼스: 아주대는 단일 캠퍼스(수원). campus = "수원".

수시 전형 목록 (물리 p25 전형유형표 + p26 모집단위현황 + p28 수능최저표 기준):
  정규 수시:
    1. 학생부교과(고교추천전형)         [교과]   수능최저 있음 (전체:2합5/의학과:2합6)
    2. 학생부종합(ACE전형)             [종합]   수능최저 있음 (의학과:2합6/약학과:3합5)
    3. 학생부종합(첨단융합인재전형)       [종합]   수능최저 미적용 (명시 없음 → 문서에 별도 규정 없음)
    4. 학생부종합(지역의사선발전형)       [종합]   수능최저 있음 (의학과:2합6) — 의학과 전용
    5. 학생부종합(고른기회1전형)         [종합]   수능최저 미적용 (문서 미언급)
    6. 학생부종합(고른기회2전형)         [종합]   수능최저 미적용 (문서 미언급)
    7. 학생부종합(특수교육대상자전형)     [종합]   수능최저 미적용 (정원외)
    8. 학생부종합(국방IT우수인재1전형)   [종합]   수능최저 미적용 (정원외) — 국방디지털융합학과 전용
    9. 논술(논술우수자전형)             [논술]   수능최저 있음 (의학과:2합6/약학과:3합5/기타:2합5이내)
       ※ 수능최저 일반은 "탐구 1과목" 기준이나 논술 수능최저 문서(p28)에는 탐구 2과목 평균 명시
    10. 실기/실적(체육우수자(축구)전형)  [실기]   수능최저 미적용 (명시 없음)
  전형기간 자율화:
    11. 학생부종합(특성화고등을졸업한재직자전형) [종합] 수능최저 미적용 (정원외)

모집단위 목록 (물리 p26 기준):
  ─ 공과대학 (자연): 기계공학과, 산업공학과, 화학공학과, 첨단신소재공학과, 응용화학과,
                     환경안전공학과, 건설시스템공학과, 교통시스템공학과, 건축학과, 융합시스템공학과
  ─ 첨단ICT융합대학 (자연): 전자공학과, 지능형반도체공학과, 미래모빌리티공학과
  ─ 소프트웨어융합대학 (자연): 소프트웨어학과, 사이버보안학과, 디지털미디어학과, 국방디지털융합학과
  ─ 자연과학대학 (자연): 수학과, 프런티어과학학부
  ─ 첨단바이오융합대학 (자연): 단과대학 단위 모집 (혁신신약공학전공, 바이오첨단소재공학전공,
                                디지털바이오공학전공) → 대학 단위로 1개 모집단위 생성
  ─ 의과대학 (자연): 의학과
  ─ 약학대학 (자연): 약학과
  ─ 경영대학 (인문): 경영학과, 경영인텔리전스학과, 금융공학과, 글로벌경영학과
  ─ 인문대학 (인문): 국어국문학과, 영어영문학과, 불어불문학과, 사학과, 문화콘텐츠학과
  ─ 사회과학대학 (인문): 행정학과, 심리학과, 스포츠레저학부, 경제정치사회융합학부
  ─ 간호대학 (자연): 간호학과
  ─ 다산학부대학 (인문/자연): 자유전공학부(인문), 자유전공학부(자연)

전형 적용 범위 주의사항:
  • 지역의사선발전형: 의학과 전용 (6개 진료권별 선발)
  • 국방IT우수인재1전형(정원외): 국방디지털융합학과 전용
  • 첨단융합인재전형: 수학·과학 기반 역량 대상 → 전 이과계열 적용 가능 (공과·ICT·소프트웨어·자연·첨단바이오)
  • 체육우수자(축구)전형: 체육 관련 모집단위 — 스포츠레저학부만 해당 가능
    (단, PDF에 명시적 모집단위 배정 없으므로 스포츠레저학부로 귀속 + warning)
  • 특수교육대상자전형(정원외): 전 모집단위 가능 (일반적으로 대학 전체 pooled)
    → PDF에 모집단위별 배정 없음 → 대학 전체 1개 track으로 경고 처리
  • 특성화고졸재직자전형(자율화, 정원외): 공과대학·첨단ICT·소프트웨어·경영학과에만 가능
    (p32 고른기회1 각주: 특성화고교 출신자는 공과대학, 첨단ICT융합대학, 소프트웨어융합대학, 경영학과만)
    → 전형 자체는 대학 수준에서 모집하므로 여기서는 공과대학 대표 1개 + warning

수능최저학력기준 (물리 p28 원문):
  고교추천(일반):    국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 1과목) 중 2개 영역등급 합 5이내
                     탐구 2개 과목만으로 수능최저학력기준을 맞출 수 없음
  고교추천(의학과):  국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 등급 합 6이내
  ACE(의학과):       국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 등급 합 6이내
  ACE(약학과):       국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 중 3개 영역 등급 합 5이내
  지역의사선발(의학과): 국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 등급 합 6이내
  논술(의학과):      국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 등급 합 6이내
  논술(약학과):      국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 중 3개 영역 등급 합 5이내
  논술(기타):        국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 중 2개 영역 등급 합 5이내
  ※ 탐구영역은 직탐 포함 불가 (전 수시 전형 공통)
  ※ 논술 탐구는 '2개 과목 평균'(p28)으로 고교추천 탐구 '1과목'과 다름 — 구분 필수
"""
import json, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "aju.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 소스 페이지 상수 (물리 페이지) ─────────────────────────────────────────────
# 이 문서는 인쇄페이지 == 물리페이지 (1-indexed offset 없음; 표지~소개 pp1-22는 비번호)
PG_TRACK_TABLE  = 25   # 전형유형 및 방법 (수시·정시 목록)
PG_DEPT_LIST    = 26   # 모집단위 현황 (단위 목록만, 인원 없음)
PG_CSAT_TABLE   = 28   # 수능최저학력기준 표
PG_QUAL_BASE    = 31   # 지원자격 시작 (10절)
PG_QUAL_SPORT   = 36   # 체육우수자 지원자격
PG_QUAL_JAEJI   = 35   # 특성화고졸재직자 지원자격
PG_QUAL_GUKBANG = 35   # 국방IT우수인재1 지원자격 (p33~35)

# ── 수능최저 원문 상수 (p28 직접 인용) ─────────────────────────────────────
# 고교추천(의학과 제외 전체)
CSAT_GYOGWA_GENERAL = (
    "국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 1과목) 중 2개 영역등급 합 5이내"
    " (탐구 2개 과목만으로 수능최저학력기준을 맞출 수 없음)"
)
# 고교추천(의학과) / ACE(의학과) / 지역의사선발(의학과) / 논술(의학과)
CSAT_MED = (
    "국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 등급 합 6이내"
)
# ACE(약학과) / 논술(약학과)
CSAT_PHARM = (
    "국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 중 3개 영역 등급 합 5이내"
)
# 논술(의학과·약학과 제외 일반)
CSAT_NONGSUL_GENERAL = (
    "국어, 수학(선택과목 제한 없음), 영어, 탐구(과탐, 사탐 중 2개 과목 평균) 중 2개 영역 등급 합 5이내"
)
CSAT_NOTE = "탐구영역은 직탐을 포함할 수 없음 (2027학년도 수능최저 공통)"

# ── reflectionStage 헬퍼 ────────────────────────────────────────────────────
def stage(label, mult, comps, maxscore=1000):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}


def _mk(name, ttype, special, quota, appq, stages, raw, exempt, areas, src, note=None):
    t = {
        "trackName": name,
        "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special,
        "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages] if stages else [],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": sorted({p for p in src if p}),
    }
    if note:
        t["note"] = note
    return t


# ── 지원자격 템플릿 ──────────────────────────────────────────────────────────
APPQ_GYOGWA = (
    "2024년 12월 이후 졸업(예정)자 중 고등학교 1학년 1학기~3학년 1학기 모든 학기를 "
    "인정가능유형(국내 일반고·자율고·특목고)에서 이수한 자로서 출신고교장의 추천을 받은 자 "
    "(고교별 추천인원 제한 없음). 특성화고·예술고·체육고·마이스터고·검정고시·외국고 지원 불가. "
    "조기졸업자 지원 불가."
)
APPQ_ACE = (
    "국내·외 고등학교 졸업(예정)자[조기졸업자 포함] 또는 관계 법령에 의하여 "
    "고등학교 졸업자와 동등 이상의 학력이 있다고 인정된 자"
)
APPQ_CHAM = (
    "국내·외 고등학교 졸업(예정)자[조기졸업자 포함] 또는 관계 법령에 의하여 "
    "고등학교 졸업자와 동등 이상의 학력이 있다고 인정된 자로서, "
    "수학 및 과학을 바탕으로 역량과 잠재력을 갖춘 자"
)
APPQ_JIYEOG_DR = (
    "「지역의사의 양성 및 지원 등에 관한 법률」 제2조 제1호가목에 따른 '복무형 지역의사'가 "
    "되려는 사람으로, 법 제4조제2항, 시행령 제2조제3항 및 [별표2] 자격요건을 충족한 "
    "국내 고등학교 졸업(예정)자. 의정부권·남양주권·이천권·포천권·인천서북권·인천중부권 진료권 소재 "
    "중·고등학교 입학~졸업 이수 및 해당 지역 거주자. 의학과 전용 전형."
)
APPQ_GEURUN1 = (
    "국내·외 고등학교 졸업(예정)자[조기졸업자 포함] 또는 동등 이상 학력 인정자로서 "
    "국가보훈대상자 / 농어촌(6년·12년 이수) / 특성화고 출신자(공과·첨단ICT·소프트웨어·경영학과만 지원 가능) / "
    "기초생활수급자·차상위계층·한부모가족지원대상자 중 하나 충족"
)
APPQ_GEURUN2 = (
    "국내·외 고등학교 졸업(예정)자[조기졸업자 포함] 또는 동등 이상 학력 인정자로서 "
    "민주화운동 관련자 자녀 / 군부사관·직업군인·경찰·소방·교정직공무원(15년 이상) 자녀 / "
    "도서·벽지 5년 이상 근무 공무원 자녀(2016.01~2026.09) / 아동복지시설출신자 / "
    "장애인 부모의 자녀(심한 장애) / 다문화가정 자녀 / 다자녀(3자녀 이상) 가구 자녀 중 하나 충족"
)
APPQ_TEUKSU = (
    "국내·외 고등학교 졸업(예정)자[조기졸업자 포함] 또는 동등 이상 학력 인정자로서 "
    "장애인복지법 제32조에 의하여 장애인 등록을 필한 장애인 또는 "
    "국가유공자 등 예우 및 지원에 관한 법률에 의한 상이등급자(국가보훈처 등록). 정원 외."
)
APPQ_GUKBANG = (
    "국내·외 고등학교 졸업(예정)자[조기졸업자 포함] 또는 동등 이상 학력 인정자로서 "
    "ICT전문성·글로벌역량·리더십을 갖추고, 군 인사법 제10조 결격사유 없는 자로서 "
    "임관일 기준 만 20세 이상 29세 이하(2001.06.02~2011.06.01 출생)인 대한민국 국적자. "
    "국방디지털융합학과 전용. 정원 외."
)
APPQ_NONGSUL = (
    "국내·외 고등학교 졸업(예정)자[조기졸업자 포함] 또는 관계 법령에 의하여 "
    "고등학교 졸업자와 동등 이상의 학력이 있다고 인정된 자"
)
APPQ_CHUKGU = (
    "국내 고등학교 졸업(예정)자[조기졸업자 포함] 또는 동등 이상 학력 인정자(2024년 1월 이후) 중 "
    "① 2024~2026년 청소년대표 ② 2024~2026년 전국대회 4강 이내 입상자 "
    "③ 2024~2026년 고등리그 왕중왕전·K리그 U18 챔피언십 출전자 중 하나 충족. "
    "포지션별 인원: FW(5명이내), MF(5명이내), DF(5명이내), GK(2명이내)."
)
APPQ_JAEJIK = (
    "특성화고등학교(또는 마이스터고·산업수요맞춤형고 등 해당) 졸업 후 산업체 근무경력 3년 이상 "
    "(2027년 3월 1일 기준, 재직기간 1,095일 이상, 4대보험 가입 확인). "
    "원서접수 시작일 및 입학일 기준 재직 중이어야 함. 정원 외. 전형기간 자율화 전형."
)


# ── 전형별 반영비율 템플릿 (물리 p25 전형유형표 기준) ─────────────────────────
# 고교추천전형: [일괄] 학생부교과 100
STAGES_GYOGWA = [stage("일괄합산", None, {"학생부교과": 100})]

# ACE전형: [1단계] 서류종합평가 100(3배수) → [2단계] 1단계성적 70 + 면접 30
STAGES_ACE = [
    stage("1단계", 3, {"서류종합평가": 100}),
    stage("2단계", None, {"1단계 성적": 70, "면접": 30}),
]

# 첨단융합인재전형: ACE와 동일 구조 ([1단계] 서류종합평가 100(3배수), [2단계] 1단계성적 70+면접 30)
STAGES_CHAM = [
    stage("1단계", 3, {"서류종합평가": 100}),
    stage("2단계", None, {"1단계 성적": 70, "면접": 30}),
]

# 지역의사선발전형: ACE와 동일 구조
STAGES_JIYEOG = [
    stage("1단계", 3, {"서류종합평가": 100}),
    stage("2단계", None, {"1단계 성적": 70, "면접": 30}),
]

# 고른기회1전형: [일괄] 서류종합평가 100
STAGES_GEURUN1 = [stage("일괄합산", None, {"서류종합평가": 100})]

# 고른기회2전형: [1단계] 서류종합평가 100(3배수) → [2단계] 1단계성적 70 + 면접 30
STAGES_GEURUN2 = [
    stage("1단계", 3, {"서류종합평가": 100}),
    stage("2단계", None, {"1단계 성적": 70, "면접": 30}),
]

# 특수교육대상자전형(정원외): [1단계] 서류종합평가 100(3배수) → [2단계] 1단계성적 70 + 면접 30
STAGES_TEUKSU = [
    stage("1단계", 3, {"서류종합평가": 100}),
    stage("2단계", None, {"1단계 성적": 70, "면접": 30}),
]

# 국방IT우수인재1전형(정원외): [1단계] 서류종합평가 100(3배수) →
#   [2단계] 1단계성적 70 + 면접 30 + 신체검사/체력검정/신원조회(P/F)
STAGES_GUKBANG = [
    stage("1단계", 3, {"서류종합평가": 100}),
    stage("2단계", None, {"1단계 성적": 70, "면접": 30}),  # + 신체검사 등 P/F
]

# 논술우수자전형: [일괄] 논술 80 + 학생부교과 20
STAGES_NONGSUL = [stage("일괄합산", None, {"논술": 80, "학생부교과": 20})]

# 체육우수자(축구)전형: [일괄] 학생부교과 4 + 학생부출결 1 + 실적 40 + 실기 30 + 면접 25
STAGES_CHUKGU = [
    stage("일괄합산", None, {"학생부교과": 4, "학생부출결": 1, "실적": 40, "실기": 30, "면접": 25})
]

# 특성화고졸재직자전형(자율화): [1단계] 서류종합평가 100(3배수) → [2단계] 1단계성적 70 + 면접 30
STAGES_JAEJIK = [
    stage("1단계", 3, {"서류종합평가": 100}),
    stage("2단계", None, {"1단계 성적": 70, "면접": 30}),
]


# ── 전형 생성 함수 ────────────────────────────────────────────────────────────
# 이 문서에는 모집인원 없음 → quota=None(전 전형)
# csatMinimumExempt: True=수능최저 미적용, False=적용(csatMinimumRawText 채워짐), None=불명확
def mk_gyogwa(dept_name, is_med=False, is_pharm=False, src=None):
    """학생부교과(고교추천전형)"""
    src = src or [PG_TRACK_TABLE, PG_CSAT_TABLE, PG_QUAL_BASE]
    if is_med:
        raw = CSAT_MED; exempt = False
    elif is_pharm:
        # 약학과 고교추천 수능최저: PDF에 별도 명시 없음(고교추천에서 약학과 분리 미기재)
        # → 일반 기준(2합5) 적용으로 보이나 PDF 명시 없으므로 null 처리
        # 경고는 구조 warnings에 이미 추가됨
        raw = None; exempt = None
    else:
        raw = CSAT_GYOGWA_GENERAL; exempt = False
    return _mk(
        "학생부교과(고교추천전형)", "학생부위주(교과)", None, None,
        APPQ_GYOGWA, STAGES_GYOGWA, raw, exempt,
        CSAT_NOTE if not is_med else CSAT_NOTE, src
    )


def mk_ace(dept_name, is_med=False, is_pharm=False, src=None):
    """학생부종합(ACE전형)"""
    src = src or [PG_TRACK_TABLE, PG_CSAT_TABLE, PG_QUAL_BASE]
    if is_med:
        raw = CSAT_MED; exempt = False; areas = CSAT_NOTE
    elif is_pharm:
        raw = CSAT_PHARM; exempt = False; areas = CSAT_NOTE
    else:
        # 일반 모집단위: ACE 수능최저 PDF에 의학과·약학과만 명시됨
        # 나머지 모집단위는 수능최저 미적용으로 추정되나 PDF 명시 없음 → null 처리
        raw = None; exempt = None; areas = None
        # 개별 경고 생략 — 대표 경고는 상단 구조 warnings에 통합됨
    return _mk(
        "학생부종합(ACE전형)", "학생부위주(종합)", None, None,
        APPQ_ACE, STAGES_ACE, raw, exempt, areas if is_med or is_pharm else None, src
    )


def mk_cham(dept_name, src=None):
    """학생부종합(첨단융합인재전형) — STEM 계열 전용"""
    src = src or [PG_TRACK_TABLE, PG_QUAL_BASE]
    # 수능최저: PDF 미언급 → null (미적용 추정이나 확인 불가)
    # 개별 경고 생략 — 대표 경고는 상단 구조 warnings에 통합됨
    return _mk(
        "학생부종합(첨단융합인재전형)", "학생부위주(종합)", None, None,
        APPQ_CHAM, STAGES_CHAM, None, None, None, src
    )


def mk_jiyeog_dr(src=None):
    """학생부종합(지역의사선발전형) — 의학과 전용"""
    src = src or [PG_TRACK_TABLE, PG_CSAT_TABLE, 34, PG_QUAL_BASE]
    return _mk(
        "학생부종합(지역의사선발전형)", "학생부위주(종합)", None, None,
        APPQ_JIYEOG_DR, STAGES_JIYEOG, CSAT_MED, False, CSAT_NOTE, src,
        note="의학과 전용. 6개 진료권(의정부·남양주·이천·포천·인천서북·인천중부)별 선발. "
             "수시 미충원 시 정시로 이월 가능."
    )


def mk_geurun1(dept_name, src=None):
    """학생부종합(고른기회1전형)"""
    src = src or [PG_TRACK_TABLE, PG_QUAL_BASE, 32]
    # 수능최저: PDF 미언급 → null. 개별 경고 생략 — 대표 경고는 상단 구조 warnings에 통합됨
    return _mk(
        "학생부종합(고른기회1전형)", "학생부위주(종합)", "기회균형", None,
        APPQ_GEURUN1, STAGES_GEURUN1, None, None, None, src
    )


def mk_geurun2(dept_name, src=None):
    """학생부종합(고른기회2전형)"""
    src = src or [PG_TRACK_TABLE, PG_QUAL_BASE, 33]
    # 수능최저: PDF 미언급 → null. 개별 경고 생략 — 대표 경고는 상단 구조 warnings에 통합됨
    return _mk(
        "학생부종합(고른기회2전형)", "학생부위주(종합)", "기회균형", None,
        APPQ_GEURUN2, STAGES_GEURUN2, None, None, None, src
    )


def mk_nongsul(dept_name, is_med=False, is_pharm=False, src=None):
    """논술(논술우수자전형)"""
    src = src or [PG_TRACK_TABLE, PG_CSAT_TABLE, PG_QUAL_BASE]
    if is_med:
        raw = CSAT_MED; exempt = False
    elif is_pharm:
        raw = CSAT_PHARM; exempt = False
    else:
        raw = CSAT_NONGSUL_GENERAL; exempt = False
    return _mk(
        "논술(논술우수자전형)", "논술위주", None, None,
        APPQ_NONGSUL, STAGES_NONGSUL, raw, exempt, CSAT_NOTE, src
    )


# ── 모집단위별 전형 세트 빌더 ─────────────────────────────────────────────────
# 각 모집단위에 어떤 수시 전형이 적용되는지를 결정하는 매핑.
#
# 적용 원칙:
#   - 고교추천: 전 모집단위 적용
#   - ACE: 전 모집단위 적용 (의학과/약학과는 수능최저 별도)
#   - 첨단융합인재: 이과계열만 (공과/ICT/소프트웨어/자연과학/첨단바이오/간호/자유전공자연)
#     ※ 단, 문서에 '수학 및 과학을 바탕으로 역량과 잠재력을 갖춘 자' → 인문계열 제외
#   - 지역의사선발: 의학과만
#   - 고른기회1: 전 모집단위 (단 특성화고 출신자는 공과·ICT·소프트웨어·경영만)
#   - 고른기회2: 전 모집단위 (PDF에 제한 없음)
#   - 특수교육대상자(정원외): 전 모집단위 pooled → 별도 대학 단위 track으로 처리 (이 함수 외 처리)
#   - 국방IT우수인재1(정원외): 국방디지털융합학과만
#   - 논술: 전 모집단위 (의학과/약학과 수능최저 별도)
#   - 체육우수자(축구): 스포츠레저학부 귀속 (PDF 명시 없으나 전공 특성상)
#   - 특성화고졸재직자(자율화, 정원외): 공과·ICT·소프트웨어·경영 → 별도 대표 track (이 함수 외 처리)

def build_dept_tracks(dept_name, is_natural, is_med=False, is_pharm=False,
                       is_gukbang=False, is_sport=False,
                       skip_cham=False, src_pages=None):
    """dept_name에 해당하는 수시 전형 track 목록 반환."""
    sp = src_pages or [PG_TRACK_TABLE, PG_CSAT_TABLE, PG_DEPT_LIST]
    tracks = []

    # 1. 고교추천 (전 모집단위)
    tracks.append(mk_gyogwa(dept_name, is_med=is_med, is_pharm=is_pharm, src=sp))

    # 2. ACE (전 모집단위)
    tracks.append(mk_ace(dept_name, is_med=is_med, is_pharm=is_pharm, src=sp))

    # 3. 첨단융합인재 (이과계열만, 의학과/약학과 포함)
    if is_natural and not skip_cham:
        tracks.append(mk_cham(dept_name, src=sp))

    # 4. 지역의사선발 (의학과만)
    if is_med:
        tracks.append(mk_jiyeog_dr(src=sp))

    # 5. 고른기회1 (전 모집단위)
    tracks.append(mk_geurun1(dept_name, src=sp))

    # 6. 고른기회2 (전 모집단위)
    tracks.append(mk_geurun2(dept_name, src=sp))

    # 7. 국방IT우수인재1 (국방디지털융합학과만)
    if is_gukbang:
        tracks.append(_mk(
            "학생부종합(국방IT우수인재1전형)", "학생부위주(종합)", "국방IT우수인재(정원외)", None,
            APPQ_GUKBANG, STAGES_GUKBANG, None, True, None,
            [PG_TRACK_TABLE, PG_QUAL_BASE, 35],
            note="국방디지털융합학과 전용. 정원 외. 신체검사/체력검정/신원조회(P/F) 포함. "
                 "수시 미충원 시 정시(국방IT우수인재2전형)로 이월."
        ))

    # 8. 논술 (전 모집단위)
    tracks.append(mk_nongsul(dept_name, is_med=is_med, is_pharm=is_pharm, src=sp))

    # 9. 체육우수자(축구) (스포츠레저학부만)
    if is_sport:
        tracks.append(_mk(
            "실기/실적(체육우수자(축구)전형)", "실기/실적위주", None, None,
            APPQ_CHUKGU, STAGES_CHUKGU, None, True, None,
            [PG_TRACK_TABLE, 29, PG_QUAL_SPORT],
            note="스포츠레저학부 귀속. PDF에 모집단위별 명시 없으나 전공 특성·지원자격상 귀속."
        ))

    return tracks


# ── 모집단위 목록 정의 ────────────────────────────────────────────────────────
# (departmentName, is_natural, is_med, is_pharm, is_gukbang, is_sport, skip_cham, college)
DEPT_DEFS = [
    # 공과대학 (자연계)
    ("기계공학과",        True,  False, False, False, False, False, "공과대학"),
    ("산업공학과",        True,  False, False, False, False, False, "공과대학"),
    ("화학공학과",        True,  False, False, False, False, False, "공과대학"),
    ("첨단신소재공학과",  True,  False, False, False, False, False, "공과대학"),
    ("응용화학과",        True,  False, False, False, False, False, "공과대학"),
    ("환경안전공학과",    True,  False, False, False, False, False, "공과대학"),
    ("건설시스템공학과",  True,  False, False, False, False, False, "공과대학"),
    ("교통시스템공학과",  True,  False, False, False, False, False, "공과대학"),
    ("건축학과",          True,  False, False, False, False, False, "공과대학"),
    ("융합시스템공학과",  True,  False, False, False, False, False, "공과대학"),
    # 첨단ICT융합대학 (자연계)
    ("전자공학과",           True,  False, False, False, False, False, "첨단ICT융합대학"),
    ("지능형반도체공학과",   True,  False, False, False, False, False, "첨단ICT융합대학"),
    ("미래모빌리티공학과",   True,  False, False, False, False, False, "첨단ICT융합대학"),
    # 소프트웨어융합대학 (자연계)
    ("소프트웨어학과",       True,  False, False, False, False, False, "소프트웨어융합대학"),
    ("사이버보안학과",        True,  False, False, False, False, False, "소프트웨어융합대학"),
    ("디지털미디어학과",     True,  False, False, False, False, False, "소프트웨어융합대학"),
    ("국방디지털융합학과",   True,  False, False, True,  False, False, "소프트웨어융합대학"),
    # 자연과학대학 (자연계)
    ("수학과",               True,  False, False, False, False, False, "자연과학대학"),
    ("프런티어과학학부",     True,  False, False, False, False, False, "자연과학대학"),
    # 첨단바이오융합대학 (자연계, 단과대학 단위 모집)
    ("첨단바이오융합대학",   True,  False, False, False, False, False, "첨단바이오융합대학"),
    # 의과대학 (자연계)
    ("의학과",               True,  True,  False, False, False, False, "의과대학"),
    # 약학대학 (자연계)
    ("약학과",               True,  False, True,  False, False, False, "약학대학"),
    # 경영대학 (인문계)
    ("경영학과",             False, False, False, False, False, True,  "경영대학"),
    ("경영인텔리전스학과",   False, False, False, False, False, True,  "경영대학"),
    ("금융공학과",           False, False, False, False, False, True,  "경영대학"),
    ("글로벌경영학과",       False, False, False, False, False, True,  "경영대학"),
    # 인문대학 (인문계)
    ("국어국문학과",         False, False, False, False, False, True,  "인문대학"),
    ("영어영문학과",         False, False, False, False, False, True,  "인문대학"),
    ("불어불문학과",         False, False, False, False, False, True,  "인문대학"),
    ("사학과",               False, False, False, False, False, True,  "인문대학"),
    ("문화콘텐츠학과",       False, False, False, False, False, True,  "인문대학"),
    # 사회과학대학 (인문계, 스포츠레저학부 제외; 스포츠레저학부는 is_sport=True)
    ("행정학과",             False, False, False, False, False, True,  "사회과학대학"),
    ("심리학과",             False, False, False, False, False, True,  "사회과학대학"),
    ("스포츠레저학부",       False, False, False, False, True,  True,  "사회과학대학"),
    ("경제정치사회융합학부", False, False, False, False, False, True,  "사회과학대학"),
    # 간호대학 (자연계)
    ("간호학과",             True,  False, False, False, False, False, "간호대학"),
    # 다산학부대학 (자유전공)
    ("자유전공학부(인문)",   False, False, False, False, False, True,  "다산학부대학"),
    ("자유전공학부(자연)",   True,  False, False, False, False, False, "다산학부대학"),
]

# ── 모집단위 생성 ─────────────────────────────────────────────────────────────
departments = []
SRC_COMMON = [PG_TRACK_TABLE, PG_CSAT_TABLE, PG_DEPT_LIST]

for (dept_name, is_natural, is_med, is_pharm, is_gukbang, is_sport, skip_cham, college) in DEPT_DEFS:
    tracks = build_dept_tracks(
        dept_name, is_natural=is_natural, is_med=is_med, is_pharm=is_pharm,
        is_gukbang=is_gukbang, is_sport=is_sport, skip_cham=skip_cham,
        src_pages=SRC_COMMON
    )
    campus = "수원"
    hint = "자연" if is_natural else "인문"
    departments.append({
        "departmentName": dept_name,
        "campus": campus,
        "trackHint": hint,
        "totalQuotaHint": None,  # 이 문서에 모집인원 없음
        "college": college,
        "tracks": tracks,
    })

# ── 정원외 pooled 전형 (모집단위 특정 불가 → 대학 전체 단위) ────────────────────
# 특수교육대상자전형: 전 모집단위 pooled (PDF 개별 배정 없음)
departments.append({
    "departmentName": "전체모집단위(특수교육대상자)",
    "campus": "수원",
    "trackHint": None,
    "totalQuotaHint": None,
    "college": "전체",
    "tracks": [_mk(
        "학생부종합(특수교육대상자전형)", "학생부위주(종합)", "특수교육대상자(정원외)", None,
        APPQ_TEUKSU,
        [stage("1단계", 3, {"서류종합평가": 100}),
         stage("2단계", None, {"1단계 성적": 70, "면접": 30})],
        None, True, None,
        [PG_TRACK_TABLE, PG_QUAL_BASE, 35],
        note="정원 외. PDF에 모집단위별 배정 없음 → 대학 전체 pooled 처리. "
             "모집단위 단위 데이터 적재 시 별도 확인 필요."
    )],
})
warnings.append(
    "[특수교육대상자전형] 정원외 pooled 전형: PDF에 모집단위별 배정 없음 → "
    "'전체모집단위(특수교육대상자)'로 단일 모집단위 처리. 실제 모집요강 확인 필요."
)

# 특성화고졸재직자전형(자율화, 정원외): 공과·ICT·소프트웨어·경영학과 대상
# PDF에 대학 단위로만 언급 → 대표 풀드 처리
departments.append({
    "departmentName": "해당모집단위(특성화고졸재직자)",
    "campus": "수원",
    "trackHint": None,
    "totalQuotaHint": None,
    "college": "공과/ICT/소프트웨어/경영",
    "tracks": [_mk(
        "학생부종합(특성화고등을졸업한재직자전형)", "학생부위주(종합)", "특성화고졸재직자(정원외)", None,
        APPQ_JAEJIK, STAGES_JAEJIK,
        None, True, None,
        [PG_TRACK_TABLE, 35, 36],
        note="정원 외. 전형기간 자율화. 공과대학·첨단ICT융합대학·소프트웨어융합대학·경영학과 대상. "
             "PDF 모집단위별 배정 없음 → pooled 처리. 실제 모집요강 확인 필요."
    )],
})
warnings.append(
    "[특성화고졸재직자전형] 정원외 자율화 전형: 공과·ICT·소프트웨어·경영학과 대상이나 "
    "PDF 개별 배정 없음 → '해당모집단위(특성화고졸재직자)'로 pooled 처리. 실제 모집요강 확인 필요."
)


# ── 구조 경고 ─────────────────────────────────────────────────────────────────
warnings.insert(0,
    "[CRITICAL] 이 PDF(aju.txt)는 '2027학년도 아주대학교 입학전형안내' 브로셔이며 모집요강이 아님. "
    "원문(p26): '전형별, 모집단위별 모집인원은 첨단학과 증원 및 신설, 의과대학 정원 변동 등을 "
    "반영하여 변동 예정입니다. 추후 제공하는 모집시기별 모집요강을 반드시 확인바랍니다.' "
    "→ 문서 전체에 모집인원 총괄표(숫자 그리드)가 존재하지 않음. "
    "전 전형 quotaInitial=null. 전형방법·수능최저·지원자격만 수록됨. "
    "적재 전 반드시 실제 수시 모집요강 PDF로 교체 필요."
)
warnings.append(
    "[첨단바이오융합대학] 단과대학 단위 모집(p26 명시): 혁신신약공학전공·바이오첨단소재공학전공·"
    "디지털바이오공학전공을 대학 단위로 선발. 전공별 모집인원 배정은 모집요강에서 확인 필요."
)
warnings.append(
    "[약학과/고교추천전형] 수능최저 PDF 명시 확인 필요: 약학과 고교추천전형 수능최저가 일반 2합5인지 "
    "별도 기준인지 p28 수능최저표에 명시 없음 → csatMinimumRawText=null 처리."
)
warnings.append(
    "[ACE전형 수능최저] PDF p28에는 의학과(합6)·약학과(3합5)만 명시. "
    "나머지 모집단위(36개 학과) ACE 수능최저 PDF 미언급 → csatMinimumRawText=null, csatMinimumExempt=null 처리. "
    "실제로는 수능최저 미적용일 가능성이 높으나 PDF 명시 없으므로 추측 금지."
)
warnings.append(
    "[첨단융합인재전형 수능최저] PDF 미언급(24개 이과계열 학과 전체) → "
    "csatMinimumRawText=null, csatMinimumExempt=null 처리. 실제 모집요강 확인 필요."
)
warnings.append(
    "[고른기회1·2전형 수능최저] PDF 미언급(38개 학과 전체) → "
    "csatMinimumRawText=null, csatMinimumExempt=null 처리. 고른기회 전형은 통상 수능최저 미적용이나 확인 필요."
)
warnings.append(
    "[체육우수자(축구)전형] 스포츠레저학부 귀속: PDF에 전형 방법·지원자격 명시(p25·p29·p36) "
    "있으나 대상 모집단위 명시 없음. 전공 특성상 스포츠레저학부로 귀속 처리."
)
warnings.append(
    "[국방디지털융합학과 소속] p26 모집단위현황에 소프트웨어융합대학에 기재됨. "
    "단, 수능 반영방법(p30)에서 '자연2' 계열(의학과·국방디지털융합학과: 수학40%)로 별도 분류됨."
)
warnings.append(
    "[자유전공학부] 자유전공학부(인문)·(자연) 각각 독립 모집단위로 처리. "
    "수능 반영방법 상 자유전공학부(자연)=자연1계열, 자유전공학부(인문)=인문2계열."
)
warnings.append(
    "[첨단융합인재전형 적용 범위] 인문계열(경영대학·인문대학·사회과학대학) 제외. "
    "skip_cham=True 적용. 단, PDF에 계열별 명시 없음 → '수학 및 과학을 바탕으로 역량과 잠재력을 갖춘 자' "
    "지원자격 문구 기반 이과계열만 적용한 것임."
)
warnings.append(
    "[행합/열합 체크섬] 이 문서는 모집인원 총괄표가 없으므로 그리드 파싱 불가. "
    "quotaInitial=null 전체 → rowSumValidation.passed=0/failed=0(검증 대상 없음). "
    "checksumPassed=True는 '실패 0건'이지 '숫자 검증 통과'가 아님. "
    "실제 적재는 수시 모집요강 PDF 입수 후 재실행 필요."
)


# ── 체크섬 (그리드 없음 → trivially 0건 passed) ──────────────────────────────
# 행합: 모집인원 없음 → 검증 불가 → 0/0
# 열합: 열 합계 행 없음 → 검증 불가 → []
parse_fail = []
all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)

def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t.get("csatMinimumExempt") is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

# checksumPassed = (rowFailed==0) AND (no col failures). Both trivially true (no grid).
CHECKSUM_PASSED = True  # 0 failures (grid absent = nothing to fail)

# ── 결과 조립 ─────────────────────────────────────────────────────────────────
result = {
    "universityName": "아주대학교",
    "year": 2027,
    "recruitmentSeason": "susi",
    "departments": departments,
    "warnings": warnings,
}

meta = {
    "universityName": "아주대학교",
    "campusScope": "수원캠퍼스 단독(단일 캠퍼스)",
    "year": 2027,
    "recruitmentSeason": "susi",
    "sourceDocYear": 2027,
    "sourceDocTitle": "2027학년도 아주대학교 입학전형안내(브로셔)",
    "sourceDocNote": (
        "이 문서는 모집요강이 아닌 입학전형안내 브로셔임. 모집인원 총괄표 없음. "
        "전형방법·수능최저·지원자격만 수록. 실제 수시 모집요강 PDF 입수 후 재파싱 필요."
    ),
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용, $0)",
    "visionCost": 0.0,
    "departments": len(departments),
    "totalTracks": T,
    "rowSumValidation": {
        "basis": "모집인원 총괄표 없음 (입학전형안내 브로셔 — 숫자 그리드 미수록)",
        "passed": 0,
        "failed": 0,
    },
    "colTotalValidationInner": [],   # 그리드 없음 → 열합 검증 불가
    "colTotalValidationOuter": [],
    "colTotalGye": {
        "note": "모집인원 그리드 없음 → 열합 검증 불가",
        "innerComputed": None,
        "innerExpected": None,
        "outerComputed": None,
        "outerExpected": None,
    },
    "checksumPassed": CHECKSUM_PASSED,
    "checksumNote": (
        "checksumPassed=True는 '실패 0건(그리드 부재로 검증 대상 없음)'을 의미하며, "
        "'숫자 검증 통과'가 아님. quotaInitial 전체 null. "
        "extraction-integrity.ts 게이트: checksumPassed=false 거부 기준 미해당이나, "
        "실제 적재 전 반드시 실제 모집요강으로 재실행 필요."
    ),
    "fillRatios": {
        "quotaInitial":       [q_n,  T],
        "reflectionStages":   [r_n,  T],
        "csatMinimumRawText": [c_n,  T],
        "csatMinimumExempt":  [ce_n, T],
        "sourcePages":        [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

(BASE / "aju-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

# ── 콘솔 리포트 ──────────────────────────────────────────────────────────────
print("=" * 70)
print("아주대 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 70)
print(f"[중요] 이 PDF는 입학전형안내 브로셔이며 모집요강이 아님.")
print(f"       모집인원 총괄표 없음 → quotaInitial 전체 null.")
print(f"캠퍼스: 수원 단독(단일 캠퍼스)")

print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증: 검증 대상 없음(그리드 부재) — passed=0 / failed=0")
print(f"열합 검증: 검증 대상 없음(그리드 부재) — []")
print(f"meta.checksumPassed = {CHECKSUM_PASSED}")
print(f"  ※ True이지만 '숫자 검증 통과'가 아님. 그리드 없음 → 0건 passed(trivially).")

print(f"\n채움비율 ({T}전형):")
for label, n in [
    ("quotaInitial",       q_n),
    ("reflectionStages",   r_n),
    ("csatMinimumRawText", c_n),
    ("csatMinimumExempt",  ce_n),
    ("sourcePages",        sp_n),
    ("완전레코드",          comp_n),
]:
    pct = f"{100*n//T if T else 0}%"
    print(f"  {label:22s}: {n}/{T} ({pct})")

print(f"\nwarnings: {len(warnings)}건")
print(f"  저장: {BASE/'aju-text.json'}")
print()
print("행합 실패 목록: 없음 (그리드 부재)")
print()
print("열합 (정원내): 검증 불가 (그리드 부재)")
print("열합 (정원외): 검증 불가 (그리드 부재)")
print()
print("[경고 요약]")
for w in warnings[:5]:
    print(f"  • {w[:100]}...")
print(f"  ... (총 {len(warnings)}건, 상세는 aju-text.json 참조)")
