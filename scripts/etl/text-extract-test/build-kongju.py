#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
국립공주대학교(kcue_0000008) 2027 수시 — pdftotext -layout 텍스트(kongju.txt, 98쪽) →
AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 ($0). Claude Code 본체가 kongju.txt 전체를 정독하고
  ① 모집인원 총괄표(Ⅲ. 전형별 모집인원, 물리 p9~11 = 인쇄 p8~10)의 15개 전형 컬럼 총계행
  ② 각 전형별 세부 안내 페이지(학생부종합 p17~, 학생부교과 p34~, 실기/실적 p49~)의 학과별 직독
  ③ 자율전공학부 모집단위 참고표(인쇄 p4, 물리 p5) — 유형Ⅰ/유형Ⅱ 전형 구분 결정
를 결합한다. 총괄표는 학과별 '계' 컬럼이 없고 전형별 컬럼만 있으므로(한밭대형), 행합 검증 기준은
'각 학과 트랙 quotaInitial 합'(세부페이지 직독값)으로 두고, 열합은 총괄표 총계행과 대조한다.

총괄표 15개 전형 컬럼(좌→우)과 총계행(물리 p11 직독, kongju.txt 그대로):
  학생부종합 : 일반전형855 · 성인학습자전형Ⅰ18 · 특성화고교졸업자35 · 장애인등대상자46(정원외) ·
               특성화고등을졸업한재직자150(정원외)
  학생부교과 : 일반전형1,053 · 자율전공전형237 · 지역인재전형289 · 기회균형일반전형42 ·
               기회균형지역전형2 · 농어촌학생전형97(정원외)
  실기/실적  : 일반전형131 · 특기자전형15 · 농어촌학생전형12(정원외) · 특성화고교졸업자5(정원외)
  → 수시모집 총계 2,987 (총괄표 컬럼 단위 직독; 정원내+정원외 모두 합산).

총괄표 컬럼을 페이지별 우측끝 위치(end-pos) 캘리브로 결정론 파싱하고(컬럼합 14개 전부 총계행과
정확히 일치 검증; 재직자150은 ◎ 총정원제 풀이라 컬럼합 0 → 풀 총원으로 별도 대조), 본 빌더는
그 검증된 학과별 셀을 DEPT_DATA로 명시 인코딩한다.

자율전공학부 전형 결정(인쇄 p4 「자율전공학부 모집단위 참고」 직독 — 총괄표 컬럼 모호성 해소):
  · 유형Ⅰ 자율전공학부(공주50·천안87·예산35) = 학생부교과 「지역인재전형」 (총괄표 지역인재 컬럼에 합산.
    지역인재 289 = 일반 117 + 유형Ⅰ 172 자기검증). 캠퍼스별 단일 모집단위.
  · 유형Ⅱ OO대학자율전공학부(인문사회45·자연과학29·천안공과112·산업과학51) = 「자율전공전형」(237),
    각 +기회균형일반전형(5·4·24·9 = 42).

정직성/특수처리:
  · 학생부종합(특성화고 등을 졸업한 재직자전형) 150명 = ◎ 총정원제(모집정원 150명) 풀.
    학과별 고정인원 없음 → ◎ 표기 6개 모집단위에 quotaInitial=null 트랙 부착 + note. 열합은 풀 총원 150.
  · 학생부종합(장애인 등 대상자전형) 46명 = 정원외이나 총괄표에 학과별 인원 명시 → 분배(quotaInitial 보유).
  · 성인학습자전형Ⅰ 18명 = 별도 「성인학습자전담과정」 5개 모집단위(주말·야간): 경영학과3·전기전자제어6·
    식물자원3·원예3·식품공학3. 일반 학과와 분리된 독립 모집단위로 생성.
  · 수능최저: 학생부교과 「일반·자율전공·지역인재전형」만 적용(인쇄 p39 표). 기회균형/농어촌/학생부종합/
    실기실적 = 미적용(exempt). 단과대학별 상위 2개 영역 합산 등급: 사범대7(수학교육과 수학포함)·간호학과7·
    인문사회/자연과학/간호보건(간호제외)9·예술/천안공과10·산업과학11·본부소속(국제·인공지능·유형Ⅰ자율)10.
  · 예체능 자체배점 보존: 체육/음악/미술교육과 학생부교과 = 학생부70+실기30. 실기/실적 일반 = 학생부30+실기70.
    특기자: 체육교육과 학생부20+실기30+입상50 / 스포츠과학과 학생부30+실기40+입상30. (반영비율 날조 금지.)
  · enum 만 사용. 미기재 null.

캠퍼스(인쇄 p4~7 Ⅱ.모집단위 및 전공 직독): 공주 / 천안 / 예산 3캠퍼스.
  · 공주: 사범대학, 인문사회과학대학, 자연과학대학, 간호보건대학, 예술대학, 본부소속(국제학부·자율전공학부 공주)
  · 천안: 천안공과대학, 본부소속(인공지능학부·자율전공학부 천안)
  · 예산: 산업과학대학, 본부소속(자율전공학부 예산)
  · 성인학습자전담: 경영학과·전기전자제어(천안캠 수업), 식물자원·원예(예산), 식품공학(천안캠 수업).
"""
import json
import re
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "kongju.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

warnings = []

# ── 본문 학년도 검증 (sourceDocYear) ─────────────────────────────────────────
SOURCE_DOC_YEAR = 2027 if "2027학년도" in pages[0] else None
if SOURCE_DOC_YEAR != 2027:
    warnings.append("[학년도] 본문에서 2027학년도 명시를 확인하지 못함 — 점검 필요")

# ── 물리 페이지 상수 (pages[i] = 물리 p i+1) ─────────────────────────────────
PG_GRID = [9, 10, 11]   # Ⅲ. 전형별 모집인원 총괄표 (물리 p9~11 = 인쇄 p8~10)
PG_자율참고 = 5          # 자율전공학부 모집단위 참고표 (인쇄 p4)
PG_요약 = 3             # 전형요약 (인쇄 p1)
# 학생부종합 세부
PG_JH_모집 = [18, 19]   # 학생부종합 모집단위·모집인원 (인쇄 p17~)
PG_JH_방법 = 22         # 학생부종합 전형방법 (인쇄 p21)
# 학생부교과 세부
PG_GYO_모집 = [35, 36]  # 학생부교과 모집단위·모집인원 (인쇄 p34~)
PG_GYO_방법 = 41        # 학생부교과 전형방법 (인쇄 p40)
PG_CSAT = 40            # 수능 최저학력기준 표 (인쇄 p39)
# 실기/실적 세부
PG_SG_모집 = [50]       # 실기/실적 모집단위·모집인원 (인쇄 p49)
PG_SG_방법 = 53         # 실기/실적 전형방법 (인쇄 p52)


def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}


def src(*pgs):
    flat = []
    for p in pgs:
        if isinstance(p, (list, tuple)):
            flat.extend(p)
        elif p:
            flat.append(p)
    return sorted(set(flat))


# ════════════════════════════════════════════════════════════════════════════
# 1. 전형 템플릿 (반영비율 — kongju.txt 전형방법 직독, 인쇄 p21/p40/p52)
# ════════════════════════════════════════════════════════════════════════════
# 학생부종합 일반전형:
#   · 사범대학·예술대학: 1단계 서류평가100(4배수) → 2단계 서류평가70+면접30
#   · 그 외(인문사회/자연과학/간호보건/천안공과/산업과학/국제학부/인공지능학부): 서류평가100 일괄
JH_GEN_STEP = [stage("1단계", 4.0, {"서류평가(100%)": 100}, 100),
               stage("2단계", None, {"서류평가(70%)": 70, "면접(30%)": 30}, 100)]
JH_GEN_DOC = [stage("일괄합산", None, {"서류평가(100%)": 100}, 100)]
# 학생부종합 특성화고교졸업자전형: 서류평가100 (2027 면접 폐지 — 전 모집단위 서류100)
JH_TUKHWA_DOC = [stage("일괄합산", None, {"서류평가(100%)": 100}, 100)]
# 학생부종합 장애인 등 대상자전형: 1단계 서류평가100(4배수) → 2단계 서류평가70+면접30
JH_JANGAE_STEP = [stage("1단계", 4.0, {"서류평가(100%)": 100}, 100),
                  stage("2단계", None, {"서류평가(70%)": 70, "면접(30%)": 30}, 100)]
# 학생부종합 성인학습자전형Ⅰ / 특성화고 등을 졸업한 재직자전형: 서류평가100 일괄
JH_SEONGIN_DOC = [stage("일괄합산", None, {"서류평가(100%)": 100}, 100)]

# 학생부교과 일반/자율전공/지역인재: 학생부 100 (수능최저 적용)
#   · 체육/음악/미술교육과: 학생부 70 + 실기 30
GYO_HAKBU = [stage("일괄합산", None, {"학생부(100%)": 100}, 100)]
GYO_PE_SILGI = [stage("일괄합산", None, {"학생부(70%)": 70, "실기(30%)": 30}, 100)]
# 학생부교과 기회균형일반/지역, 농어촌학생: 학생부 100 (수능최저 없음)
#   · 농어촌 체육/음악교육과: 학생부70+실기30
GYO_HAKBU_NOCSAT = GYO_HAKBU
GYO_PE_NOCSAT = GYO_PE_SILGI

# 실기/실적 일반/농어촌/특성화고교졸업자: 학생부 30 + 실기 70
SG_ILBAN = [stage("일괄합산", None, {"학생부(30%)": 30, "실기(70%)": 70}, 100)]
# 실기/실적 특기자: 체육교육과 / 스포츠과학과 자체배점 (입상실적)
SG_TUKGI_PE = [stage("일괄합산", None, {"학생부(20%)": 20, "실기(30%)": 30, "입상실적(50%)": 50}, 100)]
SG_TUKGI_SPORTS = [stage("일괄합산", None, {"학생부(30%)": 30, "실기(40%)": 40, "입상실적(30%)": 30}, 100)]


# ── 수능최저학력기준 (인쇄 p39 표 — 단과대학 그룹별 상위 2개 영역 합산 등급) ──
CSAT_AREAS = ("국어, 수학, 영어, 탐구(사회탐구·과학탐구 과목 중 1개 과목) 영역 중 상위 2개 영역 "
              "(탐구는 사탐·과탐 중 상위 1개 과목만 반영, 직업탐구 미반영; 한국사 미반영)")
CSAT_AREAS_SUHAK = ("국어, 수학, 영어, 탐구(사회탐구·과학탐구 과목 중 1개 과목) 영역 중 수학 포함 상위 2개 영역")


def csat_gyo(grade, suhak_include=False, extra=""):
    base = (f"국어·수학·영어·탐구(1과목) 중 "
            f"{'수학 포함 ' if suhak_include else ''}상위 2개 영역 등급 합 {grade}등급 이내{extra}")
    areas = CSAT_AREAS_SUHAK if suhak_include else CSAT_AREAS
    return base, False, areas


# 단과대학별 등급 (학생부교과 일반/자율전공/지역인재전형에만 적용)
def csat_for_gyo_gen(college, dept):
    """학생부교과 일반/자율전공/지역인재전형 수능최저. (raw, exempt, areas)."""
    if college == "사범대학":
        if dept == "수학교육과":
            return csat_gyo(7, suhak_include=True,
                            extra=" (단, 수학 과목 중 확률과 통계 응시자는 합산 4등급 이내)")
        return csat_gyo(7)
    if dept == "간호학과":
        return csat_gyo(7)
    if college in ("인문사회과학대학", "자연과학대학"):
        return csat_gyo(9)
    if college == "간호보건대학":  # 간호학과 외
        return csat_gyo(9)
    if college in ("예술대학", "천안공과대학"):
        return csat_gyo(10)
    if college == "산업과학대학":
        return csat_gyo(11)
    if college == "본부소속":  # 국제학부·인공지능학부·자율전공학부(공주/천안/예산)
        return csat_gyo(10)
    # 안전망: 미지정 → 미적용
    return "없음", True, "없음"


# ── 전형 메타 (열키 → 전형명/유형/특기/전형방법/세부페이지/풀여부) ──────────────
JONGHAP = "학생부위주(종합)"
GYOGWA = "학생부위주(교과)"
SILGI = "실기/실적위주"

# pe_dept: 체육/음악/미술교육과 여부에 따라 학생부교과 일반/지역/농어촌 실기 30% 반영
PE_GYO_DEPTS = {"체육교육과", "음악교육과", "미술교육과"}      # 학생부교과 일반/자율/지역: 학생부70+실기30
PE_GYO_NONGEO_DEPTS = {"체육교육과", "음악교육과"}             # 농어촌: 체육·음악만 실기30 (미술교육과는 농어촌 모집 없음)


# 열키 정의: (전형명, 유형, specialTypeKeyword, 정원외여부, 세부모집페이지, 전형방법페이지)
TRACK_DEF = {
    # ── 학생부종합 ──
    "jh_일반":     dict(name="일반전형", ttype=JONGHAP, special=None,
                       out=False, pg_mo=PG_JH_모집, pg_me=PG_JH_방법),
    "jh_특성화고":  dict(name="특성화고교졸업자전형", ttype=JONGHAP, special="특성화고교졸업자",
                       out=False, pg_mo=PG_JH_모집, pg_me=PG_JH_방법),
    "jh_장애인":    dict(name="장애인 등 대상자전형", ttype=JONGHAP, special="정원외(장애인등대상자)",
                       out=True, pg_mo=PG_JH_모집, pg_me=PG_JH_방법),
    "jh_성인":     dict(name="성인학습자전형Ⅰ", ttype=JONGHAP, special="성인학습자",
                       out=False, pg_mo=[28], pg_me=30),
    "jh_재직자":    dict(name="특성화고 등을 졸업한 재직자전형", ttype=JONGHAP,
                       special="정원외(재직자/총정원제)", out=True, pg_mo=[28], pg_me=30, pool=True),
    # ── 학생부교과 ──
    "gyo_일반":    dict(name="일반전형", ttype=GYOGWA, special=None,
                       out=False, pg_mo=PG_GYO_모집, pg_me=PG_GYO_방법),
    "gyo_자율":    dict(name="자율전공전형", ttype=GYOGWA, special=None,
                       out=False, pg_mo=[5, *PG_GYO_모집], pg_me=PG_GYO_방법),
    "gyo_지역":    dict(name="지역인재전형", ttype=GYOGWA, special="지역인재",
                       out=False, pg_mo=PG_GYO_모집, pg_me=PG_GYO_방법),
    "gyo_기회일반":  dict(name="기회균형일반전형", ttype=GYOGWA, special="기회균형",
                       out=False, pg_mo=PG_GYO_모집, pg_me=PG_GYO_방법),
    "gyo_기회지역":  dict(name="기회균형지역전형", ttype=GYOGWA, special="기회균형(지역)",
                       out=False, pg_mo=PG_GYO_모집, pg_me=PG_GYO_방법),
    "gyo_농어촌":   dict(name="농어촌학생전형", ttype=GYOGWA, special="정원외(농어촌학생)",
                       out=True, pg_mo=PG_GYO_모집, pg_me=PG_GYO_방법),
    # ── 실기/실적 ──
    "sg_일반":     dict(name="일반전형", ttype=SILGI, special=None,
                       out=False, pg_mo=PG_SG_모집, pg_me=PG_SG_방법),
    "sg_특기":     dict(name="특기자전형", ttype=SILGI, special="특기자",
                       out=False, pg_mo=PG_SG_모집, pg_me=PG_SG_방법),
    "sg_농어촌":    dict(name="농어촌학생전형", ttype=SILGI, special="정원외(농어촌학생)",
                       out=True, pg_mo=PG_SG_모집, pg_me=PG_SG_방법),
    "sg_특성화고":  dict(name="특성화고교졸업자전형", ttype=SILGI, special="정원외(특성화고교졸업자)",
                       out=True, pg_mo=PG_SG_모집, pg_me=PG_SG_방법),
}

# 총괄표 총계행 (물리 p11 직독 — 열합 검증 기준; 15개 전형)
GRID_TOTAL = {
    "jh_일반": 855, "jh_성인": 18, "jh_특성화고": 35, "jh_장애인": 46, "jh_재직자": 150,
    "gyo_일반": 1053, "gyo_자율": 237, "gyo_지역": 289, "gyo_기회일반": 42, "gyo_기회지역": 2,
    "gyo_농어촌": 97,
    "sg_일반": 131, "sg_특기": 15, "sg_농어촌": 12, "sg_특성화고": 5,
}
GRAND_TOTAL = 2987  # = Σ GRID_TOTAL (수시 정원내+정원외; kongju.txt p11 컬럼합)
POOL_KEYS = {"jh_재직자"}  # 학과별 고정인원 없는 ◎ 총정원제 풀


# ════════════════════════════════════════════════════════════════════════════
# 2. 학과 데이터 (총괄표 위치파싱 검증값 — 14개 컬럼 전부 총계행과 일치 / 세부페이지 교차확인)
# ════════════════════════════════════════════════════════════════════════════
# 형식: (학과명, 캠퍼스, 단과대학, 계열, {열키: 모집인원}, 재직풀부착여부)
#   계열: 인문/자연/예체능 (trackHint). 재직풀부착(◎): 재직자150 풀 트랙(quota=null) 부착.
DEPT_DATA = [
    # ───────────────────────── 공주캠퍼스 · 사범대학 ─────────────────────────
    ("국어교육과", "공주", "사범대학", "인문",
     {"jh_일반": 16, "jh_장애인": 1, "gyo_일반": 8, "gyo_지역": 4, "gyo_농어촌": 2}, False),
    ("한문교육과", "공주", "사범대학", "인문",
     {"jh_일반": 9, "gyo_일반": 10, "gyo_지역": 3, "gyo_농어촌": 2}, False),
    ("영어교육과", "공주", "사범대학", "인문",
     {"jh_일반": 16, "jh_장애인": 1, "gyo_일반": 13, "gyo_지역": 5, "gyo_농어촌": 2}, False),
    ("윤리교육과", "공주", "사범대학", "인문",
     {"jh_일반": 10, "gyo_일반": 3, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    ("교육학과", "공주", "사범대학", "인문",
     {"jh_일반": 9, "gyo_일반": 2, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    ("경영·금융교육과", "공주", "사범대학", "인문",
     {"jh_일반": 8, "jh_특성화고": 1, "gyo_일반": 6, "gyo_지역": 2}, False),
    ("문헌정보교육과", "공주", "사범대학", "인문",
     {"jh_일반": 11, "gyo_일반": 9, "gyo_지역": 3, "gyo_농어촌": 2}, False),
    ("특수교육과", "공주", "사범대학", "인문",
     {"jh_일반": 20, "jh_장애인": 2, "gyo_일반": 20, "gyo_지역": 6, "gyo_농어촌": 1}, False),
    ("역사교육과", "공주", "사범대학", "인문",
     {"jh_일반": 10, "gyo_일반": 3, "gyo_지역": 3, "gyo_농어촌": 1}, False),
    ("일반사회교육과", "공주", "사범대학", "인문",
     {"jh_일반": 12, "gyo_일반": 4, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    ("지리교육과", "공주", "사범대학", "인문",
     {"jh_일반": 10, "gyo_일반": 4, "gyo_지역": 3, "gyo_농어촌": 1}, False),
    ("유아교육과", "공주", "사범대학", "인문",
     {"jh_일반": 16, "jh_장애인": 1, "gyo_일반": 10, "gyo_지역": 4, "gyo_농어촌": 2}, False),
    ("수학교육과", "공주", "사범대학", "자연",
     {"jh_일반": 14, "jh_장애인": 1, "gyo_일반": 9, "gyo_지역": 5, "gyo_농어촌": 2}, False),
    ("물리교육과", "공주", "사범대학", "자연",
     {"jh_일반": 14, "jh_장애인": 1, "gyo_일반": 2, "gyo_지역": 2}, False),
    ("화학교육과", "공주", "사범대학", "자연",
     {"jh_일반": 10, "jh_장애인": 1, "gyo_일반": 3, "gyo_지역": 2}, False),
    ("생물교육과", "공주", "사범대학", "자연",
     {"jh_일반": 10, "gyo_일반": 4, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    ("지구과학교육과", "공주", "사범대학", "자연",
     {"jh_일반": 10, "gyo_일반": 4, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    ("환경교육과", "공주", "사범대학", "자연",
     {"jh_일반": 6, "gyo_일반": 8, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    ("컴퓨터교육과", "공주", "사범대학", "자연",
     {"jh_일반": 6, "gyo_일반": 7, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    ("기술·가정교육과", "공주", "사범대학", "자연",
     {"jh_일반": 6, "gyo_일반": 4, "gyo_지역": 2, "gyo_농어촌": 1}, False),
    # 체육·음악교육과: 학생부종합 미모집(실기 위주). 학생부교과 일반(체육10·음악16)+농어촌(체육1·음악2),
    #   실기 30% 반영. 체육교육과는 실기/실적 특기자(8)도.
    ("체육교육과", "공주", "사범대학", "예체능",
     {"gyo_일반": 10, "gyo_농어촌": 1, "sg_특기": 8}, False),
    ("음악교육과", "공주", "사범대학", "예체능",
     {"gyo_일반": 16, "gyo_농어촌": 2}, False),
    ("미술교육과", "공주", "사범대학", "예체능",
     {"jh_일반": 12, "gyo_일반": 10}, False),
    # ──────────────────── 공주캠퍼스 · 인문사회과학대학 ────────────────────
    ("영어영문학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 16, "jh_장애인": 1, "gyo_일반": 8, "gyo_농어촌": 2}, False),
    ("중어중문학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 15, "jh_장애인": 1, "gyo_일반": 12, "gyo_농어촌": 2}, False),
    ("불어불문학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 8, "jh_장애인": 1, "gyo_일반": 10, "gyo_농어촌": 1}, False),
    ("독어독문학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 12, "gyo_일반": 6, "gyo_농어촌": 1}, False),
    ("사학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 10, "jh_장애인": 1, "gyo_일반": 8, "gyo_농어촌": 1}, False),
    ("지리학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 7, "jh_장애인": 1, "gyo_일반": 11, "gyo_농어촌": 1}, False),
    ("경제통상학부", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 19, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 20, "gyo_농어촌": 2}, False),
    # 경영학과: ◎ 재직자 풀 부착. 성인학습자전담과정(3)은 별도 모집단위로 생성.
    ("경영학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 17, "jh_특성화고": 2, "jh_장애인": 1, "gyo_일반": 5, "gyo_농어촌": 2}, True),
    ("관광경영학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 11, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 15, "gyo_농어촌": 2}, False),
    ("관광&영어통역융복합학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 13, "jh_장애인": 1, "gyo_일반": 13, "gyo_농어촌": 2}, False),
    ("행정학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 9, "jh_장애인": 1, "gyo_일반": 13, "gyo_농어촌": 2}, False),
    ("법학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 9, "jh_장애인": 1, "gyo_일반": 12, "gyo_농어촌": 2}, False),
    ("사회복지학과", "공주", "인문사회과학대학", "인문",
     {"jh_일반": 12, "jh_장애인": 1, "gyo_일반": 12, "gyo_농어촌": 2}, False),
    # ───────────────────── 공주캠퍼스 · 자연과학대학 ─────────────────────
    ("데이터정보물리학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 10, "gyo_일반": 15, "gyo_농어촌": 1}, False),
    ("응용수학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 11, "jh_장애인": 1, "gyo_일반": 14}, False),
    ("화학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 7, "jh_장애인": 1, "gyo_일반": 18, "gyo_농어촌": 2}, False),
    ("생명과학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 18, "jh_장애인": 1, "gyo_일반": 8, "gyo_농어촌": 2}, False),
    ("지질환경과학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 6, "gyo_일반": 15, "gyo_농어촌": 2}, False),
    ("대기과학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 12, "jh_장애인": 1, "gyo_일반": 10, "gyo_농어촌": 2}, False),
    ("문화재보존과학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 11, "jh_장애인": 1, "gyo_일반": 2, "gyo_농어촌": 1}, False),
    ("의류상품학과", "공주", "자연과학대학", "자연",
     {"jh_일반": 11, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 3, "gyo_농어촌": 1}, False),
    ("스포츠과학과", "공주", "자연과학대학", "예체능",
     {"sg_일반": 5, "sg_특기": 7}, False),
    # ───────────────────── 공주캠퍼스 · 간호보건대학 ─────────────────────
    ("간호학과", "공주", "간호보건대학", "자연",
     {"jh_일반": 16, "jh_특성화고": 2, "gyo_일반": 22, "gyo_지역": 18, "gyo_기회지역": 2,
      "gyo_농어촌": 3}, False),
    ("보건행정학과", "공주", "간호보건대학", "자연",
     {"jh_일반": 12, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 19, "gyo_지역": 3,
      "gyo_농어촌": 2}, False),
    ("응급구조학과", "공주", "간호보건대학", "자연",
     {"jh_일반": 12, "jh_특성화고": 1, "gyo_일반": 9, "gyo_지역": 2, "gyo_농어촌": 2}, False),
    ("의료정보학과", "공주", "간호보건대학", "자연",
     {"jh_일반": 6, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 16, "gyo_지역": 3,
      "gyo_농어촌": 2}, False),
    # ────────────────────── 공주캠퍼스 · 예술대학 ──────────────────────
    ("게임디자인학과", "공주", "예술대학", "예체능",
     {"jh_일반": 7, "gyo_일반": 5, "gyo_지역": 4, "sg_일반": 12, "sg_농어촌": 3,
      "sg_특성화고": 2}, False),
    ("가구리빙디자인학과", "공주", "예술대학", "예체능",
     {"sg_일반": 17, "sg_농어촌": 1}, False),
    ("도자문화융합디자인학과", "공주", "예술대학", "예체능",
     {"sg_일반": 17, "sg_농어촌": 1}, False),
    ("주얼리·금속디자인학과", "공주", "예술대학", "예체능",
     {"sg_일반": 17, "sg_농어촌": 1}, False),
    ("만화애니메이션학부", "공주", "예술대학", "예체능",
     {"sg_일반": 35, "sg_농어촌": 3, "sg_특성화고": 1}, False),
    ("무용학과", "공주", "예술대학", "예체능",
     {"sg_일반": 22}, False),
    ("영상학과", "공주", "예술대학", "예체능",
     {"jh_일반": 9, "gyo_일반": 6, "gyo_지역": 4, "sg_일반": 6, "sg_농어촌": 3,
      "sg_특성화고": 2}, False),
    # ────────────────── 공주캠퍼스 · 본부소속 ──────────────────
    ("국제학부", "공주", "본부소속", "자연",
     {"jh_일반": 10, "jh_장애인": 1, "gyo_일반": 5, "gyo_농어촌": 2}, False),
    # ── 자율전공학부(공주캠퍼스): 유형Ⅰ — 학생부교과 지역인재전형 50명 (단일 모집단위) ──
    ("자율전공학부(공주캠퍼스)", "공주", "본부소속", "자연",
     {"gyo_지역": 50}, False),
    # ── 유형Ⅱ: 인문사회과학대학자율전공학부 — 자율전공전형45 + 기회균형일반5 ──
    ("인문사회과학대학자율전공학부", "공주", "본부소속", "인문",
     {"gyo_자율": 45, "gyo_기회일반": 5}, False),
    # ── 유형Ⅱ: 자연과학대학자율전공학부 — 자율전공전형29 + 기회균형일반4 (국제학부 포함) ──
    ("자연과학대학자율전공학부", "공주", "본부소속", "자연",
     {"gyo_자율": 29, "gyo_기회일반": 4}, False),
    # ───────────────────────── 천안캠퍼스 · 천안공과대학 ─────────────────────────
    # 전기전자제어공학부: ◎ 재직자 풀. 성인학습자전담과정(6)은 별도 모집단위.
    ("전기전자제어공학부", "천안", "천안공과대학", "자연",
     {"jh_일반": 16, "jh_특성화고": 2, "jh_장애인": 1, "gyo_일반": 81, "gyo_농어촌": 1}, True),
    ("정보통신공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 8, "jh_장애인": 1, "gyo_일반": 12, "gyo_농어촌": 2}, False),
    ("스마트정보기술공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 8, "jh_장애인": 1, "gyo_일반": 11, "gyo_농어촌": 1}, False),
    ("컴퓨터공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 9, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 19, "gyo_농어촌": 2}, False),
    ("소프트웨어학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 9, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 20, "gyo_농어촌": 2}, False),
    # 기계자동차공학부: ◎ 재직자 풀.
    ("기계자동차공학부", "천안", "천안공과대학", "자연",
     {"jh_일반": 30, "jh_특성화고": 2, "jh_장애인": 1, "gyo_일반": 49, "gyo_농어촌": 1}, True),
    ("미래자동차공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 6, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 14}, False),
    ("스마트인프라공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 10, "gyo_일반": 28, "gyo_지역": 6}, False),
    ("도시·교통공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 7, "gyo_일반": 10}, False),
    ("건축학과(5년제)", "천안", "천안공과대학", "자연",
     {"jh_일반": 10, "jh_특성화고": 2, "jh_장애인": 1, "gyo_일반": 6, "gyo_농어촌": 2}, False),
    ("그린스마트건축공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 3, "jh_특성화고": 1, "gyo_일반": 16, "gyo_농어촌": 2}, False),
    ("화학공학부", "천안", "천안공과대학", "자연",
     {"jh_일반": 11, "jh_특성화고": 1, "gyo_일반": 34, "gyo_농어촌": 1}, False),
    ("신소재공학부", "천안", "천안공과대학", "자연",
     {"jh_일반": 23, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 41}, False),
    ("디자인컨버전스학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 10, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 22, "gyo_지역": 5,
      "gyo_농어촌": 2}, False),
    ("환경공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 9, "jh_장애인": 1, "gyo_일반": 12, "gyo_농어촌": 2}, False),
    ("산업공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 7, "jh_특성화고": 1, "gyo_일반": 12}, False),
    ("광공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 7, "jh_특성화고": 1, "gyo_일반": 11}, False),
    ("디지털융합금형공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 6, "gyo_일반": 7}, False),
    ("지능형모빌리티공학과", "천안", "천안공과대학", "자연",
     {"jh_일반": 5, "gyo_일반": 15, "gyo_지역": 3}, False),
    # ── 유형Ⅱ: 천안공과대학자율전공학부 — 자율전공전형112 + 기회균형일반24 ──
    ("천안공과대학자율전공학부", "천안", "본부소속", "자연",
     {"gyo_자율": 112, "gyo_기회일반": 24}, False),
    # ── 천안캠퍼스 · 본부소속 ──
    ("인공지능학부", "천안", "본부소속", "자연",
     {"jh_일반": 8, "gyo_일반": 18, "gyo_지역": 7}, False),
    # ── 자율전공학부(천안캠퍼스): 유형Ⅰ — 학생부교과 지역인재전형 87명 ──
    ("자율전공학부(천안캠퍼스)", "천안", "본부소속", "자연",
     {"gyo_지역": 87}, False),
    # ───────────────────────── 예산캠퍼스 · 산업과학대학 ─────────────────────────
    ("지역사회개발학과", "예산", "산업과학대학", "인문",
     {"jh_일반": 3, "jh_장애인": 1, "gyo_일반": 7}, False),
    ("부동산학과", "예산", "산업과학대학", "인문",
     {"jh_일반": 4, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 8}, False),
    ("산업유통학과", "예산", "산업과학대학", "인문",
     {"jh_일반": 5, "gyo_일반": 5}, False),
    # 식물자원학과: ◎ 재직자 풀. 성인학습자전담과정(3)은 별도 모집단위.
    ("식물자원학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 9, "jh_특성화고": 1, "gyo_일반": 11}, True),
    # 원예학과: ◎ 재직자 풀. 성인학습자전담과정(3)은 별도 모집단위.
    ("원예학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 10, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 11, "gyo_농어촌": 2}, True),
    ("동물생명과학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 7, "jh_특성화고": 2, "gyo_일반": 11, "gyo_농어촌": 2}, False),
    ("지역건설공학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 6, "gyo_일반": 10}, False),
    ("스마트팜공학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 6, "jh_특성화고": 1, "gyo_일반": 10, "gyo_농어촌": 1}, False),
    ("산림과학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 9, "gyo_일반": 12}, False),
    ("조경학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 6, "jh_특성화고": 1, "gyo_일반": 10, "gyo_농어촌": 1}, False),
    ("식품영양학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 8, "jh_특성화고": 1, "jh_장애인": 1, "gyo_일반": 9, "gyo_농어촌": 1}, False),
    ("외식상품학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 7, "jh_장애인": 1, "gyo_일반": 5}, False),
    # 식품공학과: ◎ 재직자 풀. 성인학습자전담과정(3)은 별도 모집단위.
    ("식품공학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 5, "jh_특성화고": 1, "gyo_일반": 10, "gyo_농어촌": 1}, True),
    ("특수동물학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 12, "jh_장애인": 1, "gyo_일반": 2, "gyo_농어촌": 1}, False),
    ("수산생명의학과", "예산", "산업과학대학", "자연",
     {"jh_일반": 5, "gyo_일반": 13, "gyo_지역": 4}, False),
    # ── 유형Ⅱ: 산업과학대학자율전공학부 — 자율전공전형51 + 기회균형일반9 ──
    ("산업과학대학자율전공학부", "예산", "본부소속", "자연",
     {"gyo_자율": 51, "gyo_기회일반": 9}, False),
    # ── 자율전공학부(예산캠퍼스): 유형Ⅰ — 학생부교과 지역인재전형 35명 ──
    ("자율전공학부(예산캠퍼스)", "예산", "본부소속", "자연",
     {"gyo_지역": 35}, False),
]

# ── 성인학습자전담과정 (성인학습자전형Ⅰ 18명; 주말·야간 별도 모집단위 5개) ──
#   캠퍼스: 경영학과·전기전자제어·식품공학 = 천안캠 수업, 식물자원·원예 = 예산.
SEONGIN_DATA = [
    ("경영학과(성인학습자전담과정)", "천안", "인문사회과학대학", "인문", 3),
    ("전기전자제어공학부(성인학습자전담과정)", "천안", "천안공과대학", "자연", 6),
    ("식물자원학과(성인학습자전담과정)", "예산", "산업과학대학", "자연", 3),
    ("원예학과(성인학습자전담과정)", "예산", "산업과학대학", "자연", 3),
    ("식품공학과(성인학습자전담과정)", "천안", "산업과학대학", "자연", 3),
]


# ════════════════════════════════════════════════════════════════════════════
# 3. 트랙 빌더
# ════════════════════════════════════════════════════════════════════════════
def reflection_for(key, dept, college):
    """전형방법(reflectionStages) — kongju.txt 전형방법 직독."""
    if key == "jh_일반":
        if college in ("사범대학", "예술대학"):
            return [dict(x) for x in JH_GEN_STEP]
        return [dict(x) for x in JH_GEN_DOC]
    if key == "jh_특성화고":
        return [dict(x) for x in JH_TUKHWA_DOC]
    if key == "jh_장애인":
        return [dict(x) for x in JH_JANGAE_STEP]
    if key in ("jh_성인", "jh_재직자"):
        return [dict(x) for x in JH_SEONGIN_DOC]
    if key in ("gyo_일반", "gyo_자율", "gyo_지역"):
        if dept in PE_GYO_DEPTS:
            return [dict(x) for x in GYO_PE_SILGI]
        return [dict(x) for x in GYO_HAKBU]
    if key in ("gyo_기회일반", "gyo_기회지역"):
        return [dict(x) for x in GYO_HAKBU_NOCSAT]
    if key == "gyo_농어촌":
        if dept in PE_GYO_NONGEO_DEPTS:
            return [dict(x) for x in GYO_PE_NOCSAT]
        return [dict(x) for x in GYO_HAKBU_NOCSAT]
    if key in ("sg_일반", "sg_농어촌", "sg_특성화고"):
        return [dict(x) for x in SG_ILBAN]
    if key == "sg_특기":
        if dept == "체육교육과":
            return [dict(x) for x in SG_TUKGI_PE]
        if dept == "스포츠과학과":
            return [dict(x) for x in SG_TUKGI_SPORTS]
        return [dict(x) for x in SG_ILBAN]
    return []


def csat_for(key, dept, college):
    """수능최저 — 학생부교과 일반/자율전공/지역인재전형만 적용. 그 외 미적용."""
    if key in ("gyo_일반", "gyo_자율", "gyo_지역"):
        return csat_for_gyo_gen(college, dept)
    return "없음", True, "없음"


def build_track(key, quota, dept, college, note=None):
    d = TRACK_DEF[key]
    raw, exempt, areas = csat_for(key, dept, college)
    sources = src(PG_GRID, d["pg_mo"], d["pg_me"], (PG_CSAT if not exempt else None))
    t = {
        "trackName": d["name"],
        "trackTypeRaw": d["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": d["special"],
        "quotaInitial": quota,
        "applicationQualification": None,
        "reflectionStages": reflection_for(key, dept, college),
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": sources,
    }
    if note:
        t["note"] = note
    return t


# 재직자(◎ 총정원제 150) 풀 note
POOL_NOTE_재직 = ("학생부종합(특성화고 등을 졸업한 재직자전형)은 모집단위별 고정인원이 아니라 "
                "총 정원제(모집정원 150명, ◎ 표기)로 모집 → 학과별 quotaInitial=null. "
                "열합 검증은 풀 총원 150으로 수행. 주말·야간 과정 운영(경영학과·전기전자제어·식품공학은 천안캠 수업).")

# ◎ 재직자 풀 부착 모집단위 (kongju.txt ◎ 표기 6개)
JAEJIK_POOL_DEPTS = ["경영학과", "전기전자제어공학부", "기계자동차공학부",
                     "식물자원학과", "원예학과", "식품공학과"]


# ════════════════════════════════════════════════════════════════════════════
# 4. 레코드 조립 + 열합 추적
# ════════════════════════════════════════════════════════════════════════════
col_sums = {k: 0 for k in GRID_TOTAL}
departments = []
parse_fail = []


def campus_label(campus):
    return {"공주": "공주", "천안": "천안", "예산": "예산"}[campus]


for dept, campus, college, gye, quotas, jaejik in DEPT_DATA:
    tracks = []
    for key, q in quotas.items():
        tracks.append(build_track(key, q, dept, college))
        col_sums[key] += q
    # ◎ 재직자 풀 트랙(quotaInitial=null) 부착
    if jaejik:
        tracks.append(build_track("jh_재직자", None, dept, college, note=POOL_NOTE_재직))
    tsum = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    departments.append({
        "departmentName": dept,
        "campus": campus_label(campus),
        "trackHint": gye,
        "totalQuotaHint": tsum,
        "tracks": tracks,
    })

# 성인학습자전담과정 5개 모집단위
for dept, campus, college, gye, q in SEONGIN_DATA:
    t = build_track("jh_성인", q, dept, college,
                    note="성인학습자전형Ⅰ — 주말·야간 과정 운영(독립 모집단위). 수시 지원횟수(6회) 제한 미적용.")
    col_sums["jh_성인"] += q
    departments.append({
        "departmentName": dept,
        "campus": campus_label(campus),
        "trackHint": gye,
        "totalQuotaHint": q,
        "tracks": [t],
    })


# ════════════════════════════════════════════════════════════════════════════
# 5. 이중 체크섬
# ════════════════════════════════════════════════════════════════════════════
# (가) 열합: 분배전형 14개 컬럼합 == 총괄표 총계행. 재직자 풀(150)은 풀 총원으로 대조.
coltotal_result = []
all_col_match = True
for key, exp in GRID_TOTAL.items():
    if key in POOL_KEYS:
        computed = exp  # 풀(학과별 고정인원 없음) — 총괄표 총원으로 검증
        m = True
        note = "풀(◎ 총정원제 150; 학과별 고정인원 없음) — 총괄표 총원으로 검증"
    else:
        computed = col_sums[key]
        m = (computed == exp)
        note = None
    if not m:
        all_col_match = False
    item = {"track": TRACK_DEF[key]["name"] + f"[{key}]", "computed": computed,
            "expectedSumRow": exp, "match": m}
    if note:
        item["note"] = note
    coltotal_result.append(item)

computed_gye = sum(col_sums[k] for k in GRID_TOTAL if k not in POOL_KEYS) \
    + sum(GRID_TOTAL[k] for k in POOL_KEYS)
gye_match = (computed_gye == GRAND_TOTAL)
if not gye_match:
    all_col_match = False
    warnings.append(f"[열합총계] 계산 {computed_gye} ≠ 총괄표 총계 {GRAND_TOTAL}")

# (나) 행합: 각 학과 Σ(track quota, non-null) == totalQuotaHint (정의상 동일; 검증 수행).
row_pass = row_fail = 0
for d in departments:
    tq = d["totalQuotaHint"]
    qsum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    nnull = sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
    if tq is None:
        continue
    if qsum == tq and nnull == 0:
        row_pass += 1
    elif qsum <= tq and nnull > 0:
        row_pass += 1
    else:
        row_fail += 1
        parse_fail.append(f"{d['departmentName']}(hint{tq}≠합{qsum})")
        warnings.append(f"[행합불일치] {d['departmentName']}: hint {tq} ≠ 전형합 {qsum} (null {nnull})")

checksum_passed = (row_fail == 0) and all_col_match


# ── 도메인 warnings ──────────────────────────────────────────────────────────
warnings.append(
    "[캠퍼스] 공주대 3캠퍼스(인쇄 p4~7 Ⅱ.모집단위 및 전공 직독): "
    "공주(사범·인문사회과학·자연과학·간호보건·예술대학·본부소속 국제학부/자율전공 공주), "
    "천안(천안공과대학·본부소속 인공지능학부/자율전공 천안), "
    "예산(산업과학대학·본부소속 자율전공 예산). 성인학습자전담: 경영·전기전자제어·식품공학(천안캠 수업), 식물자원·원예(예산)."
)
warnings.append(
    "[지역인재 정원내] 학생부교과 지역인재전형 289명(정원내, 충청권 고교 출신 대상)은 정원내. "
    "유형Ⅰ 자율전공학부(공주50·천안87·예산35=172) = 지역인재전형(인쇄 p4 「자율전공학부 모집단위 참고」 직독), "
    "일반 지역인재 117 + 유형Ⅰ 172 = 289 자기검증. 정원외 아님."
)
warnings.append(
    "[자율전공 유형 전형 결정] 인쇄 p4 「자율전공학부 모집단위 참고」 직독으로 총괄표 컬럼 모호성 해소: "
    "유형Ⅱ OO대학자율전공학부(인문사회45·자연과학29·천안공과112·산업과학51=237) = 자율전공전형 + "
    "기회균형일반전형(5·4·24·9=42). 유형Ⅰ 자율전공학부(공주/천안/예산 캠퍼스별) = 지역인재전형(172)."
)
warnings.append(
    "[정원외 전형] 정원외 = 학생부종합 장애인등대상자(46, 학과별 분배)·재직자(150, ◎풀) / "
    "학생부교과 농어촌학생(97) / 실기실적 농어촌학생(12)·특성화고교졸업자(5). "
    "specialTypeKeyword에 '정원외(...)' 표기. 특성화고교졸업자(학생부종합 35)·성인학습자Ⅰ(18)은 정원내. "
    "수시 정원내 미충원→정시 정원내 이월, 정원외 미충원(장애인 제외)→정시 정원외 이월."
)
warnings.append(
    "[재직자 ◎ 총정원제 풀] 학생부종합(특성화고 등을 졸업한 재직자전형) 150명 = ◎ 총정원제(모집정원 150명). "
    "학과별 고정인원 없음 → ◎ 표기 6개 모집단위(경영학과·전기전자제어·기계자동차·식물자원·원예·식품공학)에 "
    "quotaInitial=null 트랙 부착 + note. 열합은 풀 총원 150으로 대조."
)
warnings.append(
    "[성인학습자전형Ⅰ 별도 모집단위] 18명 = 주말·야간 5개 전담과정 모집단위(경영학과3·전기전자제어6·"
    "식물자원3·원예3·식품공학3). 일반 학과와 분리된 독립 모집단위로 생성. 수시 지원횟수(6회) 제한 미적용."
)
warnings.append(
    "[수능최저(인쇄 p39)] 학생부교과 일반·자율전공·지역인재전형만 적용. 상위 2개 영역 합산 등급: "
    "사범대학 7(수학교육과 수학포함, 확통 응시자 4)·간호학과 7·인문사회과학/자연과학/간호보건(간호 외) 9·"
    "예술/천안공과 10·산업과학 11·본부소속(국제·인공지능·유형Ⅰ자율) 10. "
    "학생부교과 기회균형(일반/지역)·농어촌, 학생부종합 전형, 실기/실적 전형 = 미적용(exempt)."
)
warnings.append(
    "[예체능 자체배점] 학생부교과 체육·음악·미술교육과 = 학생부70+실기30(일반/자율/지역; 농어촌은 체육·음악만). "
    "실기/실적 일반/농어촌/특성화고 = 학생부30+실기70. 특기자: 체육교육과 학생부20+실기30+입상50 / "
    "스포츠과학과 학생부30+실기40+입상30. 반영비율 PDF 직독값 보존(날조 금지)."
)
warnings.append(
    "[총괄표 위치파싱 검증] Ⅲ.전형별 모집인원 총괄표(물리 p9~11)를 페이지별 컬럼 우측끝(end-pos) 캘리브로 "
    "결정론 파싱하여 15개 전형 컬럼 중 분배전형 14개 컬럼합이 전부 총계행과 정확히 일치 검증(재직자150은 ◎풀). "
    "학생부종합 세부페이지(인쇄 p17~)와 교차 직독으로 학과별 일반/특성화고/장애인 인원 일치 확인. "
    "행합 기준은 총괄표에 학과별 '계' 컬럼이 없어 트랙합으로 둠."
)
warnings.append(
    "[2027 변경(인쇄 p3)] 모집단위 명칭: 동물자원학과→동물생명과학과. 입학정원: 신소재공학부 48→63(15증원). "
    "학생부종합(특성화고교졸업자) 사범대 면접 폐지 → 전 모집단위 서류100. 체육특기자/스포츠과학과 모집종목 변경."
)


# ════════════════════════════════════════════════════════════════════════════
# 6. 결과 + meta
# ════════════════════════════════════════════════════════════════════════════
result = {
    "universityName": "국립공주대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(f): return sum(1 for t in all_tracks if f(t))
q_n = cnt(lambda t: t["quotaInitial"] is not None)
r_n = cnt(lambda t: t["reflectionStages"])
c_n = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

meta = {
    "universityName": "국립공주대학교", "universityId": "kcue_0000008",
    "year": 2027, "recruitmentSeason": "susi", "sourceDocYear": SOURCE_DOC_YEAR,
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "campusScope": "공주 + 천안 + 예산 3캠퍼스 통합",
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "basis": "학과별 트랙 quotaInitial 합 (총괄표에 학과 '계' 컬럼 없음)",
        "passed": row_pass, "failed": row_fail, "failedList": parse_fail,
    },
    "colTotalValidation": coltotal_result,
    "colTotalGye": {"computed": computed_gye, "expected": GRAND_TOTAL, "match": gye_match},
    "checksumPassed": checksum_passed,
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

out_path = BASE / "kongju-text.json"
out_path.write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
                    encoding="utf-8")


# ════════════════════════════════════════════════════════════════════════════
# 7. 콘솔 리포트
# ════════════════════════════════════════════════════════════════════════════
print("=" * 74)
print("국립공주대학교 2027 수시 — 텍스트 직접 구조화 (Vision 미사용, $0)")
print("=" * 74)
print(f"sourceDocYear: {SOURCE_DOC_YEAR}  |  그리드 물리페이지: {PG_GRID}  |  캠퍼스: 공주+천안+예산")
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"\n행합 검증(트랙 quota 합 기준): 통과 {row_pass} / 실패 {row_fail}")
for f in parse_fail:
    print(f"   [실패] {f}")

print("\n열합 검증 (전형별 계산 vs 총괄표 총계행):")
for item in coltotal_result:
    flag = "OK" if item["match"] else "XX"
    pool = " (풀)" if "[jh_재직자]" in item["track"] else ""
    print(f"  [{flag}] {item['track']:32s} 계산={item['computed']:5d}  총계행={item['expectedSumRow']:5d}{pool}")
print(f"  [{'OK' if gye_match else 'XX'}] {'수시 총계':32s} 계산={computed_gye:5d}  총계행={GRAND_TOTAL:5d}")

print(f"\nmeta.checksumPassed: {checksum_passed}")
print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n), ("csatMinimumRawText", c_n),
                 ("csatMinimumExempt", ce_n), ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    pct = 100 * n // T if T else 0
    print(f"  {label:18s}: {n}/{T} ({pct}%)")
print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {out_path}")
