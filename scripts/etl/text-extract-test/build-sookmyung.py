#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
숙명여자대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 kcue_0000141.txt 를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 결정론적으로 인코딩한 모집인원 총괄표 데이터
(인쇄 p4 = 물리 p8·p9)와 결합한다.

캠퍼스: 숙명여자대학교 서울캠퍼스(용산) 단독본. 모든 학과 campus="서울". 여자대학.

정직성 / 체크섬:
  - 모집인원 총괄표(인쇄 p4, 물리 p8·p9)의 모든 수시 데이터를 Claude Code 본체가 정독 후
    행별로 직접 인코딩. 숫자 날조 없음.
  - 표 구조: 좌측에 '입학정원'(track 아님) + 10개 전형 컬럼.
      [입학정원, 숙명인재(면접형), 소프트웨어인재, 기회균형, 지역균형선발,
       논술우수자, 예능창의인재, 농어촌학생(정원외), 특성화고교출신자(정원외),
       특성화고졸재직자(정원외), 특수교육대상자(정원외)]
    pdftotext 가 마지막 컬럼(특수교육대상자)의 trailing '-' 을 자주 누락 → 10토큰 행은
    특수교육=0 으로 복원. (11토큰 행은 전 컬럼 존재.) 이 가설은 열합으로 독립 검증됨.
  - 행합(row): 학과별 전형 quota 합 == totalQuotaHint (= 입학정원 아님! 수시 전형 합).
  - 열합(col): 전형별 합산 == 원문 합계행(L536): 361/35/71/287/214/127/63/24/118/10.
    그리고 입학정원 합 == 2,150.
  - checksumPassed: 행합 실패 0 AND 열합 전부 match AND 입학정원합 2150.

특이 구조:
  - 입학정원 컬럼은 '정원 내 총정원' 으로 track 이 아님 → totalQuotaHint 에 사용하지 않고
    별도 열합 검증(2150)에만 사용. totalQuotaHint = 해당 학과 수시 전형 quota 합.
  - 특수교육대상자전형(정원 외, 총 10명): "모집단위에 관계없이 전계열 총점 순"(원문 p41) →
    학과별 배정 없음. 합계행에만 10 표기. → 단일 가상 모집단위 "전계열(특수교육대상자전형)"
    로 quota=10 인코딩(정직: 학과별 quota 날조 금지). 열합 10 충족.
  - 정부위탁학생전형(공무원·군 위탁, 정원 외): 모집단위 4개(문헌정보학과·소비자경제학과·
    경영학부·앙트러프러너십전공)만 명시, 모집인원 미공시(표/숫자 없음) → quota=null.
    메인 그리드에 미포함이므로 열합에 영향 없음.
  - 피아노과·성악과: 수시 0(정시 실기만) → 학과 미생성(정직).
  - 약학부: 지역균형선발·논술우수자에서 별도 수능최저 적용(타 학과는 지역균형 최저 없음).
  - 무용과(한국무용/발레/현대무용)·회화과(한국화/서양화): 그리드에 전공별 quota 분리 →
    전공별 모집단위로 분리. 미술대학(시각영상디자인·산업디자인·환경디자인·공예)·회화과는
    2단계(1단계 학생부교과→2단계 실기). 무용·관현악·작곡은 일괄합산.

sourceDocYear = 2027 (표지 "2027학년도 숙명여자대학교 신입생 수시 모집요강" 독립 확인).
"""
import json
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
SRC = Path("univ/susi-2027/kcue_0000141.txt")
RAW = SRC.read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

warnings = []

UNIV = "숙명여자대학교"
SLUG = "kcue_0000141"

# ── 물리 페이지 상수 ──────────────────────────────────────────────────────────
PG_GRID = [8, 9]   # 모집단위 및 모집인원 총괄표 (인쇄 p4)
PG = {
    "숙명인재":   [14],   # 학생부종합 숙명인재(면접형)전형
    "소프트웨어": [16],   # 학생부종합 소프트웨어인재전형
    "기회균형":   [18, 19, 20],  # 학생부종합 기회균형전형
    "지역균형":   [22, 23],      # 학생부교과 지역균형선발전형
    "논술":       [24, 25],      # 논술 논술우수자전형
    "예능창의":   [26, 27, 28, 29, 30, 31, 32],  # 실기/실적 예능창의인재전형
    "농어촌":     [34],          # 학생부종합 농어촌학생전형(정원외)
    "특성화고교": [36, 37, 38],  # 학생부종합 특성화고교출신자전형(정원외)
    "특성화고졸재직": [39, 40],   # 학생부종합 특성화고졸재직자전형(정원외)
    "특수교육":   [41, 42],      # 학생부종합 특수교육대상자전형(정원외)
    "정부위탁":   [43],          # 정부위탁학생전형(정원외)
}

# ── 수능최저 원문 (PDF 각 전형 절 직접 인용) ───────────────────────────────────
# 학생부종합(숙명인재면접/소프트웨어/기회균형/농어촌/특성화고교/특성화고졸재직/특수교육/정부위탁): 모두 없음
CSAT_NONE = "없음"

# 지역균형선발: 인문/자연(약학부 제외)·자유전공 = 없음 / 약학부만 적용
CSAT_JIYEOK_PHARM = ("[약학부] 국어, 수학, 영어, 탐구(직탐 제외) 4개 영역 중 3개 영역 등급 합 5 이내 "
                     "(수학 반드시 포함, 탐구 선택 시 1과목 반영). 한국사 필수 응시")

# 논술우수자: 인문/자연(약학부 제외) = 4개 중 2개 합 5 / 약학부 = 4개 중 3개 합 4(수학 포함)
CSAT_NONSL_GEN = ("국어, 수학, 영어, 탐구(직탐 제외) 4개 영역 중 2개 영역 등급 합 5 이내 "
                  "(탐구 선택 시 1과목 반영). 한국사 필수 응시")
CSAT_NONSL_PHARM = ("[약학부] 국어, 수학, 영어, 탐구(직탐 제외) 4개 영역 중 3개 영역 등급 합 4 이내 "
                    "(수학 반드시 포함, 탐구 선택 시 1과목 반영). 한국사 필수 응시")


def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}


# ── 공통 지원자격 문구 ────────────────────────────────────────────────────────
APPQ_BASE = "고교 졸업(예정)자 또는 법령에 의해 고등학교 졸업과 동등 이상의 학력이 있다고 인정되는 자. (여자대학)"
APPQ_JIYEOK = ("국내 정규 고교 졸업(예정)자로서 국내 고교에서 5학기 이상 재학하고 5학기 이상 학생부 성적이 "
               "기재된 자로서 출신 고등학교장의 추천을 받은 자(고교별 추천 인원 제한 없음). "
               "특성화고·방송통신고·대안학교·평생교육시설·마이스터고·예술(체육)고 출신 제외. (여자대학)")
APPQ_GIHOE = ("고교 졸업(예정)자 또는 동등 학력 인정자 중 다음 어느 하나: ① 국가보훈대상자(교육지원 대상자) "
              "② 기초생활수급(권)자·차상위계층·한부모가족 지원대상자 ③ 농어촌학생(읍·면·도서벽지 중·고 6년 또는 "
              "초·중·고 12년 이수·거주) ④ 자립지원 대상 아동. (여자대학)")
APPQ_NONGEOCHON = ("국내 정규 고교 졸업(예정)자로서 읍·면·도서벽지 소재 학교에서 중·고 6년(유형1) 또는 "
                   "초·중·고 12년(유형2) 전 교육과정 이수 및 해당 기간 거주 요건 충족자. 정원 외. (여자대학)")
APPQ_TEUKGO = ("「초·중등교육법 시행령」 제91조 제1항 특성화고등학교 졸업(예정)자로 모집단위별 동일계열 기준학과 "
               "해당 또는 동일계열 전문교과 30단위 이상 이수자. 마이스터고·보통과 이수자 제외. 정원 외. (여자대학)")
APPQ_JAEJIK = ("특성화고 등 졸업자로서 산업체에 원서접수 마감일 현재 재직 중이며 본교 입학일(2027.3.1.) 기준 "
               "총 재직 3년 이상인 자. 야간/주말 수업 원칙, 타 학과 전과 불가. 정원 외. (여자대학)")
APPQ_TEUKSU = ("고교 졸업(예정)자 또는 동등 학력 인정자 중 ① 장애인복지법상 장애인(특수교육법 제15조 장애) "
               "② 국가보훈 관계 법령상 상이·장애 등급자. 전계열 선발(총 10명, 모집단위별 최대 2명, "
               "교육학부·체육교육과 최대 1명). 정원 외. (여자대학)")
APPQ_WITAK = ("고교 졸업(예정)자 또는 동등 학력 인정자 중 ①「공무원 인재개발법」 등에 따라 위탁교육훈련 선발 공무원 "
              "②「군위탁생규정」 제4조 임명 군인 중 교육부장관 추천자. 관련 기관 추천 인원에 한함. "
              "야간/주말 수업 원칙, 타 학과 전과 불가. 정원 외. (여자대학)")
APPQ_YECHE_SILGI = ("국내 정규 고교 졸업(예정)자로서 국내 고교 5학기 이상 재학·성적 기재자(체육교육과·미술대학). (여자대학)")
APPQ_YECHE_MUYONG = ("고교 졸업(예정)자 또는 동등 학력 인정자(무용과·관현악과·작곡과). (여자대학)")


# ── 전형 템플릿 빌더: track_col → track dict (dept·quota·계열 의존 일부) ───────
def build_track(track_col, dept, quota, *, gye=None):
    sp = sorted(set(PG.get(track_col, [])))

    if track_col == "숙명인재":
        stages = [stage("1단계(모집단위별 4배수)", 4, {"서류": 100}, 1000),
                  stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 1000)]
        return _mk("학생부종합(숙명인재(면접형)전형)", "학생부위주(종합)", None, quota,
                   APPQ_BASE, stages, CSAT_NONE, True, None, sp)

    if track_col == "소프트웨어":
        stages = [stage("1단계(모집단위별 4배수)", 4, {"서류": 100}, 1000),
                  stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 1000)]
        return _mk("학생부종합(소프트웨어인재전형)", "학생부위주(종합)", None, quota,
                   APPQ_BASE, stages, CSAT_NONE, True, None, sp)

    if track_col == "기회균형":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        return _mk("학생부종합(기회균형전형)", "학생부위주(종합)", "기회균형", quota,
                   APPQ_GIHOE, stages, CSAT_NONE, True, None, sp)

    if track_col == "지역균형":
        stages = [stage("일괄합산", None, {"서류평가(교과위주)": 30, "학생부교과": 70}, 1000)]
        if dept == "약학부":
            cr = CSAT_JIYEOK_PHARM; exempt = False
        else:
            cr = CSAT_NONE; exempt = True
        return _mk("학생부교과(지역균형선발전형)", "학생부위주(교과)", None, quota,
                   APPQ_JIYEOK, stages, cr, exempt, None, sp)

    if track_col == "논술":
        stages = [stage("일괄합산", None, {"논술": 90, "학생부교과": 10}, 1000)]
        if dept == "약학부":
            cr = CSAT_NONSL_PHARM
        else:
            cr = CSAT_NONSL_GEN
        return _mk("논술(논술우수자전형)", "논술위주", None, quota,
                   APPQ_BASE, stages, cr, False, None, sp)

    if track_col == "농어촌":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        return _mk("학생부종합(농어촌학생전형)", "학생부위주(종합)", "농어촌", quota,
                   APPQ_NONGEOCHON, stages, CSAT_NONE, True, None, sp)

    if track_col == "특성화고교":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        return _mk("학생부종합(특성화고교출신자전형)", "학생부위주(종합)", "특성화고", quota,
                   APPQ_TEUKGO, stages, CSAT_NONE, True, None, sp)

    if track_col == "특성화고졸재직":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        return _mk("학생부종합(특성화고졸재직자전형)", "학생부위주(종합)", "특성화고졸재직자", quota,
                   APPQ_JAEJIK, stages, CSAT_NONE, True, None, sp)

    if track_col == "특수교육":
        stages = [stage("1단계(전계열 4배수)", 4, {"서류": 100}, 1000),
                  stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 1000)]
        return _mk("학생부종합(특수교육대상자전형)", "학생부위주(종합)", "특수교육대상자", quota,
                   APPQ_TEUKSU, stages, CSAT_NONE, True, None, sp)

    if track_col == "정부위탁":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        return _mk("기타(정부위탁학생전형)", "기타", "정부위탁(공무원·군 위탁)", quota,
                   APPQ_WITAK, stages, CSAT_NONE, True, None, sp)

    if track_col == "예능창의":
        return _build_yeneung(dept, quota, sp)

    raise ValueError(f"unknown track_col '{track_col}'")


def _mk(name, ttype, special, quota, appq, stages, raw, exempt, areas, src):
    return {
        "trackName": name,
        "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special,
        "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": src,
    }


def _build_yeneung(dept, quota, sp):
    """예능창의인재전형 — 모집단위 그룹별 반영비율 상이. 수능최저 없음(실기전형)."""
    # 체육교육과: 실기60+학생부교과40 일괄
    if dept == "체육교육과":
        stages = [stage("일괄합산", None, {"실기": 60, "학생부교과": 40}, 1000)]
        appq = APPQ_YECHE_SILGI
    # 무용과(한국무용/발레/현대무용): 실기90+학생부교과10 일괄
    elif dept.startswith("무용과"):
        stages = [stage("일괄합산", None, {"실기": 90, "학생부교과": 10}, 1000)]
        appq = APPQ_YECHE_MUYONG
    # 관현악과·작곡과: 실기80+학생부교과20 일괄
    elif dept in ("관현악과", "작곡과"):
        stages = [stage("일괄합산", None, {"실기": 80, "학생부교과": 20}, 1000)]
        appq = APPQ_YECHE_MUYONG
    # 미술대학(시각영상디자인/산업디자인/환경디자인/공예): 1단계 학생부교과100(10배수)→2단계 실기100
    elif dept in ("시각·영상디자인과", "산업디자인과", "환경디자인과", "공예과"):
        stages = [stage("1단계(모집단위별 10배수)", 10, {"학생부교과": 100}, 1000),
                  stage("2단계", None, {"실기": 100}, 1000)]
        appq = APPQ_YECHE_SILGI
    # 회화과(한국화/서양화): 1단계 학생부교과100(20배수)→2단계 실기100
    elif dept.startswith("회화과"):
        stages = [stage("1단계(모집단위별 20배수)", 20, {"학생부교과": 100}, 1000),
                  stage("2단계", None, {"실기": 100}, 1000)]
        appq = APPQ_YECHE_SILGI
    else:
        warnings.append(f"[예능창의] 미분류 모집단위 '{dept}' — 반영비율 미상, reflectionStages 비움")
        stages = []
        appq = APPQ_BASE
    return _mk("실기/실적(예능창의인재전형)", "실기/실적위주", None, quota,
               appq, stages, CSAT_NONE, True, None, sp)


# ── 전형 컬럼 순서 (그리드 컬럼과 동일, 입학정원 제외) ─────────────────────────
TR = ["숙명인재", "소프트웨어", "기회균형", "지역균형", "논술", "예능창의",
      "농어촌", "특성화고교", "특성화고졸재직", "특수교육"]
col_sum = dict.fromkeys(TR, 0)
admission_quota_sum = 0  # 입학정원 합 (열합 검증용, 2150 기대)

# ── 모집인원 데이터 (Claude Code 본체가 물리 p8·p9 원문 그리드에서 직접 읽은 값) ──
# 형식: (dept_name, gye, 입학정원, {track_col: quota})
#   gye: "인문"|"자연"|"예체능"|None(통합)
#   입학정원: 정원내 총정원(track 아님) — 열합 2150 검증용
#   quota dict: 0/생략 = 미선발. 수시 전형 quota 만.

DATA = [
    # ===== 인문계 (물리 p8) =====
    # 문과대학
    ("한국어문학부", "인문", 51, {"숙명인재": 12, "기회균형": 2, "지역균형": 8, "논술": 12, "농어촌": 2}),
    ("역사문화학과", "인문", 26, {"숙명인재": 6, "기회균형": 1, "지역균형": 5, "논술": 5, "농어촌": 2}),
    ("프랑스언어·문화학과", "인문", 23, {"숙명인재": 10, "기회균형": 1, "지역균형": 3, "논술": 4, "농어촌": 2}),
    ("중어중문학부", "인문", 59, {"숙명인재": 15, "기회균형": 3, "지역균형": 9, "논술": 12, "농어촌": 3}),
    ("독일언어·문화학과", "인문", 20, {"숙명인재": 9, "기회균형": 1, "지역균형": 2, "논술": 3, "농어촌": 2}),
    ("일본학과", "인문", 28, {"숙명인재": 16, "기회균형": 1, "지역균형": 4, "논술": 3, "농어촌": 2}),
    ("문헌정보학과", "인문", 21,
     {"숙명인재": 5, "기회균형": 1, "지역균형": 3, "논술": 4, "농어촌": 2, "특성화고졸재직": 30}),
    ("문화관광학전공", "인문", 28,
     {"숙명인재": 9, "기회균형": 1, "지역균형": 5, "논술": 4, "농어촌": 2, "특성화고교": 2}),
    ("르꼬르동블루외식경영전공", "인문", 28,
     {"숙명인재": 8, "기회균형": 1, "지역균형": 5, "논술": 5}),
    ("교육학부", "인문", 48, {"숙명인재": 9, "기회균형": 2, "지역균형": 6, "논술": 8, "농어촌": 2}),
    # 생활과학대학 (인문)
    ("가족자원경영학과", "인문", 20,
     {"숙명인재": 4, "기회균형": 1, "지역균형": 3, "논술": 3, "농어촌": 2, "특성화고교": 2}),
    ("아동복지학부", "인문", 40,
     {"숙명인재": 7, "기회균형": 2, "지역균형": 7, "논술": 9, "농어촌": 2, "특성화고교": 2}),
    # 사회과학대학
    ("정치외교학과", "인문", 26, {"숙명인재": 6, "기회균형": 1, "지역균형": 5, "논술": 3, "농어촌": 2}),
    ("행정학과", "인문", 24, {"숙명인재": 5, "기회균형": 1, "지역균형": 5, "논술": 5, "농어촌": 2}),
    ("홍보광고학과", "인문", 36,
     {"숙명인재": 11, "기회균형": 2, "지역균형": 5, "논술": 7, "농어촌": 3, "특성화고교": 2}),
    ("소비자경제학과", "인문", 20,
     {"숙명인재": 6, "기회균형": 1, "지역균형": 3, "논술": 3, "농어촌": 2, "특성화고교": 2,
      "특성화고졸재직": 20}),
    ("사회심리학과", "인문", 20, {"숙명인재": 5, "기회균형": 1, "지역균형": 2, "논술": 3, "농어촌": 2}),
    # 법과대학
    ("법학부", "인문", 81, {"숙명인재": 15, "기회균형": 6, "지역균형": 15, "논술": 13, "농어촌": 3}),
    # 경상대학
    ("경제학부", "인문", 55,
     {"숙명인재": 6, "기회균형": 3, "지역균형": 16, "논술": 4, "농어촌": 2, "특성화고교": 2}),
    ("경영학부", "인문", 106,
     {"숙명인재": 24, "기회균형": 7, "지역균형": 30, "논술": 10, "농어촌": 3, "특성화고교": 2,
      "특성화고졸재직": 38}),
    # 글로벌서비스학부
    ("글로벌협력전공", "인문", 17, {"숙명인재": 12, "기회균형": 1}),
    ("앙트러프러너십전공", "인문", 15, {"숙명인재": 9, "기회균형": 1, "특성화고졸재직": 30}),
    # 영어영문학부
    ("영어영문학전공", "인문", 60, {"숙명인재": 20, "기회균형": 3, "지역균형": 9, "논술": 11, "농어촌": 3}),
    ("테슬(TESL)전공", "인문", 17, {"숙명인재": 10, "기회균형": 1, "지역균형": 3}),
    # 미디어학부
    ("미디어학부", "인문", 42, {"숙명인재": 8, "기회균형": 2, "지역균형": 6, "논술": 11, "특성화고교": 2}),

    # ===== 자연계 (물리 p8) =====
    # 이과대학
    ("화학과", "자연", 32, {"숙명인재": 10, "기회균형": 2, "지역균형": 5, "논술": 5, "농어촌": 2}),
    ("생명시스템학부", "자연", 39, {"숙명인재": 10, "기회균형": 2, "지역균형": 7, "논술": 5, "농어촌": 3}),
    ("수학과", "자연", 28, {"숙명인재": 6, "기회균형": 1, "지역균형": 4, "논술": 5, "농어촌": 2}),
    ("통계학과", "자연", 33, {"숙명인재": 12, "기회균형": 2, "지역균형": 5, "논술": 4, "농어촌": 3}),
    # 공과대학
    ("화공생명공학부", "자연", 51, {"숙명인재": 12, "기회균형": 3, "지역균형": 8, "논술": 8}),
    ("인공지능공학부", "자연", 49,
     {"소프트웨어": 14, "기회균형": 3, "지역균형": 10, "논술": 7, "농어촌": 2, "특성화고교": 2}),
    ("지능형전자시스템학부", "자연", 35, {"숙명인재": 10, "기회균형": 2, "지역균형": 7, "논술": 6}),
    ("신소재물리학부", "자연", 28, {"숙명인재": 13, "기회균형": 1, "지역균형": 5, "논술": 3}),
    ("컴퓨터과학전공", "자연", 42,
     {"소프트웨어": 12, "기회균형": 2, "지역균형": 9, "논술": 6, "농어촌": 2, "특성화고교": 2}),
    ("데이터사이언스전공", "자연", 28, {"소프트웨어": 9, "기회균형": 2, "지역균형": 5, "논술": 4}),
    ("기계시스템학부", "자연", 40, {"숙명인재": 14, "기회균형": 2, "지역균형": 6, "논술": 6}),
    ("첨단공학부", "자연", 78, {"지역균형": 10}),
    # 생활과학대학 (자연)
    ("의류학과", "자연", 25,
     {"숙명인재": 6, "기회균형": 1, "지역균형": 6, "논술": 3, "농어촌": 2, "특성화고교": 2}),
    ("식품영양학과", "자연", 32,
     {"숙명인재": 6, "기회균형": 1, "지역균형": 7, "논술": 6, "농어촌": 2, "특성화고교": 2}),
    # 약학대학
    ("약학부", "자연", 80, {"숙명인재": 15, "지역균형": 5, "논술": 4}),

    # ===== 순헌칼리지 (물리 p9) =====
    ("자유전공학부", None, 293, {"지역균형": 29}),

    # ===== 예·체능계 (물리 p9) =====
    ("체육교육과", "예체능", 26, {"예능창의": 6}),
    # 무용과 — 전공별 분리(한국무용/발레/현대무용)
    ("무용과(한국무용)", "예체능", 15, {"예능창의": 15}),
    ("무용과(발레)", "예체능", 8, {"예능창의": 8}),
    ("무용과(현대무용)", "예체능", 10, {"예능창의": 10}),
    # 피아노과(32)·성악과(26): 수시 0 → 미생성 (DATA 에서 제외)
    ("관현악과", "예체능", 36, {"예능창의": 20}),
    ("작곡과", "예체능", 25, {"예능창의": 15}),
    ("시각·영상디자인과", "예체능", 34, {"예능창의": 6}),
    ("산업디자인과", "예체능", 27, {"예능창의": 11}),
    ("환경디자인과", "예체능", 26, {"예능창의": 11}),
    ("공예과", "예체능", 34, {"예능창의": 11}),
    # 회화과 — 전공별 분리(한국화/서양화)
    ("회화과(한국화)", "예체능", 13, {"예능창의": 7}),
    ("회화과(서양화)", "예체능", 14, {"예능창의": 7}),
]

# 입학정원만 있고 수시 0 인 학과(피아노과·성악과) — 정원합 검증을 위해 별도 가산
ADMISSION_ONLY = [
    ("피아노과", 32),
    ("성악과", 26),
]

# ── 학과 조립 ─────────────────────────────────────────────────────────────────
departments = []
parse_fail = []

for dept_name, gye, ipjeong, cells in DATA:
    admission_quota_sum += ipjeong
    tracks = []
    tsum = 0
    for tcol in TR:
        v = cells.get(tcol, 0)
        if not v:
            continue
        tsum += v
        col_sum[tcol] += v
        tracks.append(build_track(tcol, dept_name, v, gye=gye))
    if not tracks:
        warnings.append(f"[수시 미선발] {dept_name}(입학정원 {ipjeong}) — 수시 모집 0, 학과 미생성")
        continue
    departments.append({
        "departmentName": dept_name,
        "campus": "서울",
        "trackHint": gye,
        "totalQuotaHint": tsum,   # 수시 전형 합 (입학정원 아님)
        "tracks": tracks,
    })

for dept_name, ipjeong in ADMISSION_ONLY:
    admission_quota_sum += ipjeong
    warnings.append(f"[수시 미선발] {dept_name}(입학정원 {ipjeong}) — 수시 모집 0(정시 실기만), 학과 미생성")

# ── 특수교육대상자전형(정원 외, 총 10명, 학과 무관) — 단일 가상 모집단위 ─────────
# 메인 그리드 합계행에만 10 표기, 학과별 배정 없음(원문 p41 "모집단위에 관계없이 전계열 총점 순")
teuksu_q = 10
col_sum["특수교육"] += teuksu_q
departments.append({
    "departmentName": "전계열(특수교육대상자전형)",
    "campus": "서울",
    "trackHint": None,
    "totalQuotaHint": teuksu_q,
    "tracks": [build_track("특수교육", "전계열", teuksu_q)],
})
warnings.append("[특수교육대상자] 정원 외 총 10명, 학과별 배정 없음(전계열 총점 순) → "
                "단일 가상 모집단위 '전계열(특수교육대상자전형)' quota=10. (학과별 quota 날조 금지)")

# ── 정부위탁학생전형(정원 외, 모집인원 미공시) — 4개 모집단위, quota=null ─────────
WITAK_DEPTS = ["문헌정보학과", "소비자경제학과", "경영학부", "앙트러프러너십전공"]
witak_added = 0
for d in departments:
    if d["departmentName"] in WITAK_DEPTS:
        d["tracks"].append(build_track("정부위탁", d["departmentName"], None))
        witak_added += 1
warnings.append(f"[정부위탁학생전형] 정원 외, 모집인원 미공시(표/숫자 없음) → quota=null. "
                f"모집단위 {witak_added}개({', '.join(WITAK_DEPTS)})에 부착. 메인 그리드 미포함(열합 무영향).")

# ── 열합 검증 (전형별 합 vs PDF 합계행 L536) ──────────────────────────────────
EXPECTED_COL = {
    "숙명인재": 361, "소프트웨어": 35, "기회균형": 71, "지역균형": 287, "논술": 214,
    "예능창의": 127, "농어촌": 63, "특성화고교": 24, "특성화고졸재직": 118, "특수교육": 10,
}
EXPECTED_ADMISSION_TOTAL = 2150   # 입학정원 합계행
EXPECTED_SUSI_TOTAL = 1310        # 수시모집 계(정원 내외)

coltotal = [(t, col_sum[t], EXPECTED_COL[t], col_sum[t] == EXPECTED_COL[t]) for t in TR]
susi_computed = sum(col_sum.values())

# ── 행합 검증 ─────────────────────────────────────────────────────────────────
# totalQuotaHint = 수시 전형 합. quotaInitial null(정부위탁) 트랙은 제외하고 합 비교.
row_ok = row_fail = 0
for d in departments:
    tq = d["totalQuotaHint"]
    qsum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    nnull = sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
    if tq is None:
        continue
    if qsum == tq:           # null 트랙(정부위탁)은 합에 영향 없음 → 그대로 일치 기대
        row_ok += 1
    elif qsum <= tq and nnull > 0:
        row_ok += 1
    else:
        row_fail += 1
        parse_fail.append((d["departmentName"], tq, qsum, nnull))

checksumPassed = (
    row_fail == 0
    and all(m for _, _, _, m in coltotal)
    and susi_computed == EXPECTED_SUSI_TOTAL
    and admission_quota_sum == EXPECTED_ADMISSION_TOTAL
)

# ── warnings (구조·정직성) ────────────────────────────────────────────────────
warnings.insert(0, "[캠퍼스] 숙명여자대학교 서울캠퍼스(용산) 단독 → 전 학과 campus='서울'. 여자대학.")
warnings.append("[그리드 컬럼] 좌측 '입학정원'은 정원내 총정원으로 track 아님 → totalQuotaHint 에서 제외, "
                "별도 입학정원 열합(2150)으로만 검증. totalQuotaHint = 학과 수시 전형 quota 합.")
warnings.append("[컬럼 복원] pdftotext 가 마지막 컬럼(특수교육대상자)의 trailing '-' 누락 → 10토큰 행은 "
                "특수교육=0 복원. 가설은 10개 전형 열합 전부 일치로 독립 검증됨.")
warnings.append("[약학부] 지역균형선발·논술우수자에서만 수능최저 적용(타 학과는 지역균형 최저 없음). "
                "지역균형: 4개 중 3개 합 5(수학 포함). 논술: 4개 중 3개 합 4(수학 포함).")
warnings.append("[논술 일반] 인문/자연(약학부 제외): 4개 영역 중 2개 등급 합 5 이내. 학생부교과 10% 비교내신 가능.")
warnings.append("[예능창의 반영비율] 체육교육과 실기60+교과40 / 무용과 실기90+교과10 / 관현악·작곡 실기80+교과20 "
                "(이상 일괄합산) / 미술대학(시각영상·산업·환경디자인·공예) 1단계 교과100(10배수)→2단계 실기100 / "
                "회화과 1단계 교과100(20배수)→2단계 실기100. 실기전형이므로 수능최저 없음.")
warnings.append("[무용과·회화과] 그리드에 전공별 quota 분리 표기 → 전공별 모집단위로 분리"
                "(무용과 한국무용15/발레8/현대무용10, 회화과 한국화7/서양화7).")
if parse_fail:
    warnings.append(f"[행합실패] {len(parse_fail)}건: " + "; ".join(str(x) for x in parse_fail))
if not checksumPassed:
    reasons = []
    if row_fail:
        reasons.append(f"행합실패 {row_fail}건")
    col_fails = [(t, g, e) for t, g, e, m in coltotal if not m]
    if col_fails:
        reasons.append("열합불일치: " + ", ".join(f"{t}(계산{g}≠기대{e})" for t, g, e in col_fails))
    if susi_computed != EXPECTED_SUSI_TOTAL:
        reasons.append(f"수시합불일치(계산{susi_computed}≠기대{EXPECTED_SUSI_TOTAL})")
    if admission_quota_sum != EXPECTED_ADMISSION_TOTAL:
        reasons.append(f"입학정원합불일치(계산{admission_quota_sum}≠기대{EXPECTED_ADMISSION_TOTAL})")
    warnings.append("[체크섬실패] " + "; ".join(reasons))

# ── 결과 조립 ─────────────────────────────────────────────────────────────────
result = {
    "universityName": UNIV,
    "year": 2027,
    "recruitmentSeason": "susi",
    "departments": departments,
    "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)


def cnt(cond):
    return sum(1 for t in all_tracks if cond(t))


q_n = cnt(lambda t: t["quotaInitial"] is not None)
r_n = cnt(lambda t: t["reflectionStages"])
c_n = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

meta = {
    "universityName": UNIV,
    "universityId": SLUG,
    "year": 2027,
    "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0,
    "campusScope": "서울캠퍼스(용산) 단독 (단일 캠퍼스, 여자대학)",
    "sourceDocYear": 2027,
    "departments": len(departments),
    "totalTracks": T,
    "rowSumValidation": {
        "basis": "totalQuotaHint(학과 수시 전형 quota 합) 대조 — 입학정원 컬럼은 제외",
        "passed": row_ok,
        "failed": len(parse_fail),
        "failedList": [x[0] for x in parse_fail],
    },
    "colTotalValidation": [
        {"track": n, "computed": g, "stated": e, "match": m}
        for n, g, e, m in coltotal
    ],
    "admissionQuotaCheck": {
        "computed": admission_quota_sum,
        "stated": EXPECTED_ADMISSION_TOTAL,
        "match": admission_quota_sum == EXPECTED_ADMISSION_TOTAL,
    },
    "susiTotalCheck": {
        "computed": susi_computed,
        "stated": EXPECTED_SUSI_TOTAL,
        "match": susi_computed == EXPECTED_SUSI_TOTAL,
    },
    "checksumPassed": checksumPassed,
    "fillRatios": {
        "quotaInitial": [q_n, T],
        "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T],
        "csatMinimumExempt": [ce_n, T],
        "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

(BASE / "sookmyung-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# ── 콘솔 리포트 ───────────────────────────────────────────────────────────────
print("=" * 72)
print("숙명여자대학교 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 72)
print(f"그리드 물리페이지: {PG_GRID}  |  캠퍼스: 서울(용산) 단독, 여자대학")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증: 통과 {row_ok} / 실패 {len(parse_fail)}")
for x in parse_fail:
    print(f"   FAIL {x}")

print(f"\n열합 검증 (전형별 합 vs PDF 합계행):")
for n, g, e, m in coltotal:
    print(f"  {n:14s} 계산={g:4d}  합계행={e:4d}  {'OK' if m else 'FAIL'}")
print(f"  {'수시 총합':14s} 계산={susi_computed:4d}  합계행={EXPECTED_SUSI_TOTAL:4d}  "
      f"{'OK' if susi_computed == EXPECTED_SUSI_TOTAL else 'FAIL'}")
print(f"  {'입학정원 총합':12s} 계산={admission_quota_sum:4d}  합계행={EXPECTED_ADMISSION_TOTAL:4d}  "
      f"{'OK' if admission_quota_sum == EXPECTED_ADMISSION_TOTAL else 'FAIL'}")
print(f"\nchecksumPassed: {checksumPassed}")

print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n),
                 ("csatMinimumRawText", c_n), ("csatMinimumExempt", ce_n),
                 ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    print(f"  {label:22s}: {n}/{T} ({100 * n // T if T else 0}%)")

print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {BASE / 'sookmyung-text.json'}")
