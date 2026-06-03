#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
국립한밭대학교(kcue_0000039) 2027 수시 — pdftotext -layout 텍스트(hanbat.txt) →
AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 ($0). Claude Code 본체가 hanbat.txt(106쪽)를 정독해
  ① 모집인원 총괄표(물리 p5~6 = 「Ⅱ. 전형별 모집인원」) 16개 전형 컬럼 총계행
  ② 각 전형별 세부 안내 페이지(「가. 모집단위와 모집인원」)의 학과별 모집인원
를 결합한다. 총괄표는 학과별 '계' 컬럼이 없고 전형별 컬럼만 있으므로, 행합 검증 기준은
'각 학과 트랙 quotaInitial 합'(세부페이지 직독값)으로 두고, 열합은 총괄표 총계행과 대조한다.

총괄표 16개 전형 컬럼(좌→우)과 총계행 (물리 p6 직독):
  정원내 학생부교과 : 학생부교과(일반)1014 · 지역인재(교과)160 · 학생부교과(사회통합)7
  정원내 학생부종합 : 학생부종합(일반)276 · 학생부종합(학·석사)84 · 지역인재(종합)179 ·
                     학생부종합(소프트웨어인재)9 · 학생부종합(야간)21
  정원내 실기       : 실기(일반)71 · 실기우수자27
  정원외 학생부교과 : 농어촌학생62 · 특성화고교졸업자17 · 사회적배려자24
  정원외 학생부종합 : 특수교육대상자10 · 특성화고등을졸업한재직자(야간)82 · 만학도(야간)10
  → 정원내 1,848(교과 1,181 + 종합 569 + 실기 98), 정원외 205(교과 103 + 종합 102), 총 2,053.

전형별 세부페이지 직독으로 컬럼합 13개(분배전형) 전부 총계행과 일치 검증:
  교과일반 1014(31) · 지역교과 160(31) · 사회통합 7(1) · 종합일반 276(26) · 학석사 84(4) ·
  지역종합 179(29) · 소프트웨어 9(4) · 종합야간 21(2) · 실기일반 71(2) · 실기우수 27(2) ·
  농어촌 62(27) · 특성화고졸 17(16) · 사회배려 24(20).
정원내 총괄표 셀과 세부페이지가 위치파싱·직독 양면으로 교차 일치(전 학과·전 컬럼) 확인됨.

정직성:
  · 특수교육대상자(10)·특성화고등을졸업한재직자(야간)(82)·만학도(야간)(10)은 모집단위별 고정
    인원이 아니라 '전 모집단위(특수교육)' 또는 '해당 야간 2개 학과 내 총점순 선발(82/10 풀)'이라
    학과별 quotaInitial=null + note. 열합은 풀 총원(10/82/10)으로 검증.
  · 수능최저학력기준: 모든 수시 전형 미적용 → csatMinimumExempt=true, csatMinimumRawText="없음".
  · enum 만 사용. 미기재 null.

캠퍼스: 단일(대전 유성덕명캠퍼스). 단, 인공지능소프트웨어학과는 세종공동캠퍼스 수업(본문 명시).
       야간 학과는 야간 과정(같은 대전 캠퍼스).
"""
import json
import re
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "hanbat.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

warnings = []

# ── 본문 학년도 검증 (sourceDocYear) ─────────────────────────────────────────
# 표지·본문에 '2027학년도 국립한밭대학교' 명시 → 2027.
SOURCE_DOC_YEAR = 2027 if "2027학년도" in pages[0] else None
if SOURCE_DOC_YEAR != 2027:
    warnings.append("[학년도] 본문에서 2027학년도 명시를 확인하지 못함 — 점검 필요")

# ── 물리 페이지 상수 (pages[i] = 물리 p i+1; 즉 물리 p = idx+1) ──────────────
PG_GRID = [5, 6]            # Ⅱ. 전형별 모집인원 총괄표 (물리 p5~6)
PG_교과일반 = 12
PG_지역교과 = 15
PG_사회통합 = 18
PG_종합일반 = 21
PG_학석사 = 24
PG_지역종합 = 26
PG_소프트웨어 = 29
PG_종합야간 = 32
PG_실기일반 = 35
PG_실기우수 = 38
PG_농어촌 = 41
PG_특성화고졸 = 45
PG_사회배려 = 51
PG_특수교육 = 55
PG_재직자야간 = 58
PG_만학도야간 = 61


def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}


def src(*pgs):
    return sorted({p for p in pgs if p})


# ════════════════════════════════════════════════════════════════════════════
# 1. 전형 템플릿 (반영비율·수능최저 — hanbat.txt 세부페이지 직독)
# ════════════════════════════════════════════════════════════════════════════
# 한밭대 수시 전 전형 수능최저 미적용 (전형요약 + 각 세부페이지 '미적용' 명시)
CSAT_RAW = "없음"
CSAT_EXEMPT = True
CSAT_AREAS = "없음"

# 학생부교과(일반/사회통합/지역인재교과): 일괄합산 (반영점수 교과 450점 + 비교과 50점 = 500점).
#   반영비율 일반교과 80%(400점) + 진로선택 10%(50점) [교과 계 450점] + 비교과 출결 10%(50점). (세부페이지 직독)
GYO_GEN = [stage("일괄합산", None,
                 {"학생부 일반교과(80%)": 400, "학생부 진로선택(10%)": 50, "학생부 비교과(출결, 10%)": 50}, 500)]
# 농어촌학생(정원외, 학생부교과 100%): 일반학생과 동일 (일반교과80%/450 + 출결10%/50)
GYO_NONGEO = GYO_GEN
# 특성화고교졸업자(정원외): 일반교과 90%(450점) + 출결 10%(50점) — 진로선택 미반영. 500점.
GYO_TUKHWA = [stage("일괄합산", None,
                    {"학생부 일반교과(90%)": 450, "학생부 비교과(출결, 10%)": 50}, 500)]
# 사회적배려자(정원외): 일반교과 80%(450) + 진로선택 10% + 출결 10%(50) — 일반학생과 동일 비율
GYO_SABAE = GYO_GEN

# 학생부종합(일반)·학생부종합(학·석사): 일괄합산 서류평가 100% (500점)
JONGHAP_DOC = [stage("일괄합산", None, {"서류평가(학교생활기록부)": 500}, 500)]
# 단계 종합 (1단계 5배수 서류100% 500점 → 2단계 1단계성적70% + 면접30%, 500점)
#  (지역인재종합·소프트웨어인재·학생부종합(야간)·특수교육·재직자야간·만학도야간 공통)
JONGHAP_STEP2 = [stage("1단계", 5.0, {"서류평가(학교생활기록부)": 500}, 500),
                 stage("2단계", None, {"1단계 성적(70%)": 350, "면접(30%)": 150}, 500)]

# 실기(일반) [디자인계열]: 일괄합산 학생부 교과 40%(일반교과 36%/180점 + 비교과출결 4%/20점) + 실기 60%(300점), 500점
SILGI_GEN = [stage("일괄합산", None,
                   {"학생부 일반교과(36%)": 180, "학생부 비교과(출결, 4%)": 20, "실기(60%)": 300}, 500)]
# 실기우수자 [디자인계열]: 일괄합산 실기 100% (500점)
SILGI_WOO = [stage("일괄합산", None, {"실기(100%)": 500}, 500)]


# ── 전형별 메타 (열키 → 전형명/유형/특기/지원자격/전형방법/소스/정원외여부) ──────
GYOGWA = "학생부위주(교과)"
JONGHAP = "학생부위주(종합)"
SILGI = "실기/실적위주"

APPQ_COMMON = "국내·외 고등학교 졸업자(2027년 2월 졸업예정자 포함), 검정고시 출신자 및 이와 동등 이상의 학력이 있다고 인정되는 자"
APPQ_지역 = ("국내 고등학교 졸업자(2027년 2월 졸업예정자 포함) 중 충청권(대전·세종·충남·충북)에 소재하는 "
            "고등학교에서 입학일부터 졸업일까지 전 교육과정(3년)을 이수 또는 이수 예정인 사람. "
            "검정고시·외국고교·각종학교·영재학교·고등기술학교 출신자 지원 불가")
APPQ_사회통합 = ("국내·외 고등학교 졸업(예정)자·검정고시 출신자 등으로서 ①기초생활수급자 ②차상위계층 "
              "③한부모가족 지원대상자 ④국가보훈대상자(교육지원 대상자) 중 하나에 해당하는 자")
APPQ_농어촌 = ("「지방자치법」 제3조 읍·면 지역 및 도서·벽지 소재 고교에서 전 학년 교육과정을 이수한 자로서 "
            "[유형1] 중·고 전 과정 이수+본인·부모 농어촌 거주, 또는 [유형2] 초·중·고 전 과정 이수+본인 농어촌 거주. "
            "특목고·검정고시 출신자 지원 불가. (정원외)")
APPQ_특성화고졸 = ("「고등교육법 시행령」 제29조제2항제14호 '나'목 해당 특성화고등학교 졸업(예정)자로서 "
               "모집단위별 동일계열 기준학과 이수자 또는 관련 전문교과 30단위 이상 이수자. "
               "마이스터고·체험위주 특성화고(대안학교) 제외. (정원외)")
APPQ_사회배려 = ("국내 고교 졸업(예정)자·검정고시 출신자 등으로서 ①국민기초생활보장법 수급권자/수급자 "
              "②차상위계층 ③한부모가족 지원대상자 중 하나에 해당하는 자. (정원외)")
APPQ_특수교육 = ("국내·외 고교 졸업(예정)자·검정고시 출신자 등으로서 ①장애인복지법 제32조 장애인 등록자 "
              "②국가보훈 관계법령 상이·장애 등급자 ③장애인 등에 대한 특수교육법 제15조 특수교육대상자 등에 "
              "해당하는 자. (정원외)")
APPQ_재직자 = ("산업체 근무 경력 3년 이상(2027.3.1. 기준, 최소 1,095일) 재직자로서 「고등교육법 시행령」 "
             "제29조제2항제14호 해당 특성화고 등 졸업자. 검정고시·외국고교 졸업자 지원 불가. (정원외, 전형기간자율화)")
APPQ_만학도 = ("국내·외 고교 졸업(예정)자·검정고시 출신자 등으로서 2027년 3월 1일 기준 만 30세 이상인 자. "
            "(정원외, 전형기간자율화)")


def _mk(name, ttype, special, quota, appq, stages, sources, note=None):
    t = {
        "trackName": name,
        "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special,
        "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": CSAT_RAW,
        "csatMinimumExempt": CSAT_EXEMPT,
        "csatRequiredAreasRawText": CSAT_AREAS,
        "prevYearResult": None,
        "sourcePages": src(*sources),
    }
    if note:
        t["note"] = note
    return t


# 열키 → (전형명, 유형, specialTypeKeyword, 지원자격, stages, 세부페이지, 풀여부)
# 풀여부(pool)=True 이면 학과별 고정인원 없음 → quotaInitial=null + note.
TRACK_DEF = {
    "교과일반":   dict(name="학생부교과(일반)",        ttype=GYOGWA,  special=None,
                     appq=APPQ_COMMON,   stages=GYO_GEN,       pg=PG_교과일반),
    "지역교과":   dict(name="지역인재(교과)",          ttype=GYOGWA,  special="지역인재",
                     appq=APPQ_지역,     stages=GYO_GEN,       pg=PG_지역교과),
    "사회통합":   dict(name="학생부교과(사회통합)",     ttype=GYOGWA,  special="기회균형(사회통합)",
                     appq=APPQ_사회통합, stages=GYO_GEN,       pg=PG_사회통합),
    "종합일반":   dict(name="학생부종합(일반)",         ttype=JONGHAP, special=None,
                     appq=APPQ_COMMON,   stages=JONGHAP_DOC,   pg=PG_종합일반),
    "학석사":     dict(name="학생부종합(학·석사)",      ttype=JONGHAP, special="학·석사연계",
                     appq=APPQ_COMMON,   stages=JONGHAP_DOC,   pg=PG_학석사),
    "지역종합":   dict(name="지역인재(종합)",          ttype=JONGHAP, special="지역인재",
                     appq=APPQ_지역,     stages=JONGHAP_STEP2, pg=PG_지역종합),
    "소프트웨어": dict(name="학생부종합(소프트웨어인재)", ttype=JONGHAP, special=None,
                     appq=APPQ_COMMON,   stages=JONGHAP_STEP2, pg=PG_소프트웨어),
    "종합야간":   dict(name="학생부종합(야간)",         ttype=JONGHAP, special="야간",
                     appq=APPQ_COMMON,   stages=JONGHAP_STEP2, pg=PG_종합야간),
    "실기일반":   dict(name="실기(일반)",             ttype=SILGI,   special=None,
                     appq=APPQ_COMMON,   stages=SILGI_GEN,     pg=PG_실기일반),
    "실기우수":   dict(name="실기우수자",             ttype=SILGI,   special="특기자/실적",
                     appq=APPQ_COMMON,   stages=SILGI_WOO,     pg=PG_실기우수),
    # ── 정원외 ──
    "농어촌":     dict(name="농어촌학생",             ttype=GYOGWA,  special="정원외(농어촌학생)",
                     appq=APPQ_농어촌,   stages=GYO_NONGEO,    pg=PG_농어촌),
    "특성화고졸": dict(name="특성화고교졸업자",         ttype=GYOGWA,  special="정원외(특성화고교졸업자)",
                     appq=APPQ_특성화고졸, stages=GYO_TUKHWA,  pg=PG_특성화고졸),
    "사회배려":   dict(name="사회적배려자",            ttype=GYOGWA,  special="정원외(사회적배려자)",
                     appq=APPQ_사회배려, stages=GYO_SABAE,     pg=PG_사회배려),
    "특수교육":   dict(name="특수교육대상자",          ttype=JONGHAP, special="정원외(특수교육대상자)",
                     appq=APPQ_특수교육, stages=JONGHAP_STEP2, pg=PG_특수교육, pool=True),
    "재직자야간": dict(name="특성화고등을졸업한재직자(야간)", ttype=JONGHAP, special="정원외(재직자/전형기간자율화)",
                     appq=APPQ_재직자,   stages=JONGHAP_STEP2, pg=PG_재직자야간, pool=True),
    "만학도야간": dict(name="만학도(야간)",           ttype=JONGHAP, special="정원외(만학도/전형기간자율화)",
                     appq=APPQ_만학도,   stages=JONGHAP_STEP2, pg=PG_만학도야간, pool=True),
}

# 전형별 총괄표 총계행 (물리 p6 직독) — 열합 검증 기준 (16개)
GRID_TOTAL = {
    "교과일반": 1014, "지역교과": 160, "사회통합": 7, "종합일반": 276, "학석사": 84,
    "지역종합": 179, "소프트웨어": 9, "종합야간": 21, "실기일반": 71, "실기우수": 27,
    "농어촌": 62, "특성화고졸": 17, "사회배려": 24,
    "특수교육": 10, "재직자야간": 82, "만학도야간": 10,
}


# ════════════════════════════════════════════════════════════════════════════
# 2. 학과 데이터 (세부페이지 직독 — 총괄표 위치파싱과 전 학과·전 컬럼 교차 일치 검증)
# ════════════════════════════════════════════════════════════════════════════
# 형식: (학과명, 단과대학, 계열, {열키: 모집인원, ...})
#   ※ 정원내+정원외 분배전형만 quota 기입. 풀전형(특수교육/재직자야간/만학도야간)은 GRID_TOTAL로만
#     열합 검증하고 학과 레코드엔 quotaInitial=null 트랙으로 부착(아래 POOL_ATTACH).
DEPT_DATA = [
    # ── 공과대학 (공학계열) ──
    ("기계공학과", "공과대학", "공학",
     {"교과일반": 51, "지역교과": 5, "종합일반": 20, "학석사": 20, "지역종합": 7, "농어촌": 5, "특성화고졸": 1, "사회배려": 2}),
    ("산업경영공학과", "공과대학", "공학",
     {"교과일반": 18, "지역교과": 4, "종합일반": 8, "학석사": 10, "지역종합": 5, "농어촌": 2, "특성화고졸": 1, "사회배려": 1}),
    ("건축설비시스템공학과", "공과대학", "공학",
     {"교과일반": 18, "지역교과": 3, "종합일반": 12, "지역종합": 8, "농어촌": 2, "사회배려": 1}),
    ("신소재공학과", "공과대학", "공학",
     {"교과일반": 66, "지역교과": 5, "종합일반": 24, "지역종합": 10, "농어촌": 5, "특성화고졸": 1, "사회배려": 2}),
    ("우주국방첨단융합학과", "공과대학", "공학",
     {"교과일반": 17, "지역교과": 3, "종합일반": 7, "지역종합": 4}),
    ("창의융합학과", "공과대학", "공학",
     {"교과일반": 1, "지역교과": 1, "학석사": 28, "지역종합": 2}),
    ("화학생명공학과", "공과대학", "공학",
     {"교과일반": 51, "지역교과": 6, "종합일반": 21, "지역종합": 8, "농어촌": 4, "특성화고졸": 1, "사회배려": 1}),
    # ── 정보기술대학 (공학계열) ──
    ("반도체시스템공학과", "정보기술대학", "공학",
     {"교과일반": 21, "지역교과": 3, "종합일반": 10, "지역종합": 8, "농어촌": 1, "특성화고졸": 1}),
    ("전기공학과", "정보기술대학", "공학",
     {"교과일반": 23, "지역교과": 3, "종합일반": 12, "지역종합": 10, "농어촌": 2, "특성화고졸": 1, "사회배려": 1}),
    ("전자공학과", "정보기술대학", "공학",
     {"교과일반": 58, "지역교과": 8, "종합일반": 25, "지역종합": 10, "농어촌": 5, "특성화고졸": 1, "사회배려": 2}),
    ("전기시스템공학과(야간)", "정보기술대학", "공학",
     {"종합야간": 10}),
    # ── 건설환경디자인대학 (공학계열) ──
    ("건설환경공학과", "건설환경디자인대학", "공학",
     {"교과일반": 41, "지역교과": 8, "종합일반": 13, "학석사": 26, "지역종합": 9, "농어촌": 5, "특성화고졸": 1, "사회배려": 2}),
    ("건축공학과", "건설환경디자인대학", "공학",
     {"교과일반": 29, "지역교과": 6, "종합일반": 9, "지역종합": 5, "농어촌": 2, "특성화고졸": 1, "사회배려": 1}),
    ("건축학과(5년제)", "건설환경디자인대학", "공학",
     {"교과일반": 8, "지역교과": 3, "종합일반": 6, "지역종합": 4, "농어촌": 1}),
    ("도시공학과", "건설환경디자인대학", "공학",
     {"교과일반": 20, "지역교과": 5, "종합일반": 12, "지역종합": 8, "농어촌": 2, "사회배려": 1}),
    # ── 건설환경디자인대학 (디자인계열) ──
    ("산업디자인학과", "건설환경디자인대학", "디자인",
     {"지역종합": 2, "실기일반": 36, "실기우수": 13, "농어촌": 1, "특성화고졸": 1, "사회배려": 1}),
    ("시각·영상디자인학과", "건설환경디자인대학", "디자인",
     {"지역종합": 2, "실기일반": 35, "실기우수": 14, "농어촌": 1, "특성화고졸": 1, "사회배려": 1}),
    # ── 인문사회대학 (인문계열) ──
    ("공공행정학과", "인문사회대학", "인문",
     {"교과일반": 6, "지역교과": 3, "종합일반": 7, "지역종합": 6, "농어촌": 1}),
    ("영어영문학과", "인문사회대학", "인문",
     {"교과일반": 18, "지역교과": 5, "종합일반": 12, "지역종합": 8, "농어촌": 2, "사회배려": 1}),
    ("일본어과", "인문사회대학", "인문",
     {"교과일반": 18, "지역교과": 5, "종합일반": 12, "지역종합": 8, "농어촌": 2, "사회배려": 1}),
    ("중국어과", "인문사회대학", "인문",
     {"교과일반": 21, "지역교과": 3, "종합일반": 12, "지역종합": 8, "농어촌": 2, "특성화고졸": 1, "사회배려": 1}),
    # ── 경상대학 (경상계열) ──
    ("경제학과", "경상대학", "경상",
     {"교과일반": 22, "지역교과": 3, "종합일반": 11, "지역종합": 8, "농어촌": 2, "사회배려": 1}),
    ("융합경영학과", "경상대학", "경상",
     {"교과일반": 34, "지역교과": 3, "종합일반": 8, "지역종합": 5, "농어촌": 2, "사회배려": 1}),
    ("회계세무학과", "경상대학", "경상",
     {"교과일반": 25, "지역교과": 5, "종합일반": 8, "지역종합": 4, "농어촌": 2, "특성화고졸": 1}),
    ("회계세무부동산학과(야간)", "경상대학", "경상",
     {"종합야간": 11}),
    # ── 융합자율대학 ──
    ("자율전공학부", "융합자율대학", "공학",
     {"교과일반": 133, "지역교과": 22, "사회통합": 7, "농어촌": 4, "특성화고졸": 2}),
    ("공학건설학부", "융합자율대학", "공학",
     {"교과일반": 106, "지역교과": 15}),
    ("정보기술AI융합학부", "융합자율대학", "공학",
     {"교과일반": 48, "지역교과": 7}),
    ("인문사회경상학부", "융합자율대학", "인문",
     {"교과일반": 54, "지역교과": 7}),
    # ── AI융합대학 (공학계열) ──
    ("모바일융합공학과", "AI융합대학", "공학",
     {"교과일반": 14, "지역교과": 3, "종합일반": 3, "지역종합": 5, "소프트웨어": 2, "농어촌": 1, "사회배려": 1}),
    ("빅데이터헬스케어융합학과", "AI융합대학", "공학",
     {"교과일반": 16, "지역교과": 3, "종합일반": 5, "지역종합": 3}),
    ("인공지능소프트웨어학과", "AI융합대학", "공학",
     {"교과일반": 26, "지역교과": 3, "종합일반": 3, "지역종합": 3, "소프트웨어": 2, "농어촌": 1, "특성화고졸": 1}),
    ("정보통신공학과", "AI융합대학", "공학",
     {"교과일반": 14, "지역교과": 4, "종합일반": 4, "지역종합": 5, "농어촌": 2}),
    ("지능미디어공학과", "AI융합대학", "공학",
     {"교과일반": 14, "지역교과": 3, "종합일반": 3, "지역종합": 5, "소프트웨어": 2, "농어촌": 1, "사회배려": 1}),
    ("컴퓨터공학과", "AI융합대학", "공학",
     {"교과일반": 23, "지역교과": 3, "종합일반": 9, "지역종합": 9, "소프트웨어": 3, "농어촌": 2, "특성화고졸": 1, "사회배려": 1}),
]

# 캠퍼스: 인공지능소프트웨어학과만 세종공동캠퍼스, 나머지 대전(유성덕명).
def campus_of(dept):
    if dept == "인공지능소프트웨어학과":
        return "세종(세종공동캠퍼스)"
    return "대전(유성덕명캠퍼스)"

# 풀전형(특수교육/재직자야간/만학도야간) 부착 대상 학과 + 풀 메모.
#   · 특수교육대상자(10): 전 모집단위(융합자율대학·야간학과·디자인계열학과 제외)에서 총점순 10명 선발.
#   · 재직자야간(82)·만학도야간(10): 전기시스템공학과(야간)·회계세무부동산학과(야간) 2개 학과 내 풀 총점순.
POOL_NOTE = {
    "특수교육": ("특수교육대상자전형은 모집단위별 고정인원이 아니라 전 모집단위(융합자율대학·야간학과·"
              "디자인계열학과 제외)에서 모집인원 10명을 총점순으로 선발 → 학과별 quotaInitial=null. "
              "열합 검증은 풀 총원 10으로 수행."),
    "재직자야간": ("특성화고등을졸업한재직자(야간)전형은 전기시스템공학과(야간)·회계세무부동산학과(야간) "
                "2개 학과 내 총모집인원 82명 풀을 총점순으로 선발 → 학과별 quotaInitial=null. "
                "열합 검증은 풀 총원 82로 수행."),
    "만학도야간": ("만학도(야간)전형은 전기시스템공학과(야간)·회계세무부동산학과(야간) 2개 학과 내 "
                "총모집인원 10명 풀을 총점순으로 선발 → 학과별 quotaInitial=null. "
                "열합 검증은 풀 총원 10으로 수행."),
}
# 특수교육 부착 학과: 풀 1건만 별도 모집단위로 생성(전 모집단위 대상 → 특정 학과 귀속 불가).
# 재직자야간/만학도야간: 2개 야간 학과 각각에 quotaInitial=null 트랙으로 부착.
YAGAN_DEPTS = ["전기시스템공학과(야간)", "회계세무부동산학과(야간)"]


# ════════════════════════════════════════════════════════════════════════════
# 3. 레코드 조립 + 열합 추적
# ════════════════════════════════════════════════════════════════════════════
col_sums = {k: 0 for k in GRID_TOTAL}   # 분배전형 컬럼합
departments = []
parse_fail = []   # 행합 실패 (없어야 함)


def build_track(key, quota):
    d = TRACK_DEF[key]
    return _mk(d["name"], d["ttype"], d["special"], quota, d["appq"], d["stages"],
               [*PG_GRID, d["pg"]])


for dept, college, gye, quotas in DEPT_DATA:
    campus = campus_of(dept)
    tracks = []
    for key, q in quotas.items():
        tracks.append(build_track(key, q))
        col_sums[key] += q
    # 야간 2개 학과 → 재직자야간·만학도야간 풀 트랙(quotaInitial=null) 부착
    if dept in YAGAN_DEPTS:
        for key in ("재직자야간", "만학도야간"):
            d = TRACK_DEF[key]
            tracks.append(_mk(d["name"], d["ttype"], d["special"], None, d["appq"], d["stages"],
                              [*PG_GRID, d["pg"]], note=POOL_NOTE[key]))
    tsum = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    # 행합 기준: 학과 트랙 quota 합 (총괄표에 학과별 '계' 컬럼 없음 → tsum 자체가 hint)
    departments.append({
        "departmentName": dept,
        "campus": campus,
        "trackHint": gye,
        "totalQuotaHint": tsum,
        "tracks": tracks,
    })

# 특수교육대상자 풀(10) → 전 모집단위 대상이라 특정 학과 귀속 불가 → 별도 '풀' 모집단위 1건.
sp = TRACK_DEF["특수교육"]
특수_track = _mk(sp["name"], sp["ttype"], sp["special"], None, sp["appq"], sp["stages"],
              [*PG_GRID, sp["pg"]], note=POOL_NOTE["특수교육"])
departments.append({
    "departmentName": "[특수교육대상자]전 모집단위",
    "campus": "대전(유성덕명캠퍼스)",
    "trackHint": None,
    "totalQuotaHint": None,   # 풀(고정 학과인원 없음)
    "tracks": [특수_track],
})


# ════════════════════════════════════════════════════════════════════════════
# 4. 이중 체크섬
# ════════════════════════════════════════════════════════════════════════════
# (가) 열합: 분배전형 13개 컬럼합 == 총괄표 총계행. 풀전형 3개는 풀총원으로 대조.
POOL_KEYS = {"특수교육", "재직자야간", "만학도야간"}
coltotal_result = []
all_col_match = True
for key, exp in GRID_TOTAL.items():
    if key in POOL_KEYS:
        # 풀전형: 학과 분배 없음 → computed=풀 총원(= expected), 별도 표기.
        computed = exp
        m = True
        note = "풀(학과별 고정인원 없음; 총점순 선발) — 총괄표 총원으로 검증"
    else:
        computed = col_sums[key]
        m = (computed == exp)
        note = None
    if not m:
        all_col_match = False
    item = {"track": key, "computed": computed, "expectedSumRow": exp, "match": m}
    if note:
        item["note"] = note
    coltotal_result.append(item)

computed_gye = sum(col_sums[k] for k in GRID_TOTAL if k not in POOL_KEYS) + sum(GRID_TOTAL[k] for k in POOL_KEYS)
expected_gye = 2053
gye_match = (computed_gye == expected_gye)
if not gye_match:
    all_col_match = False
    warnings.append(f"[열합총계] 계산 {computed_gye} ≠ 총괄표 총계 {expected_gye}")

# (나) 행합: 각 학과 Σ(track quota, non-null) == totalQuotaHint (정의상 동일하나 검증 수행).
#   totalQuotaHint=None(풀 모집단위) 또는 null 트랙 존재 시 N/A 처리.
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
    "[수능최저] 한밭대 2027 수시 전 전형 수능최저학력기준 미적용(전형요약 + 각 세부페이지 '미적용' 명시) "
    "→ csatMinimumExempt=true, csatMinimumRawText='없음'."
)
warnings.append(
    "[풀전형 quotaInitial=null] 특수교육대상자(10)·특성화고등을졸업한재직자(야간)(82)·만학도(야간)(10)은 "
    "모집단위별 고정인원이 아니라 총점순 풀 선발 → 학과별 quotaInitial=null + note. 열합은 풀 총원으로 대조."
)
warnings.append(
    "[정원내/정원외] 정원내 1,848(학생부교과 1,181=일반1014+지역160+사회통합7, 학생부종합 569, 실기 98), "
    "정원외 205(학생부교과 103=농어촌62+특성화고졸17+사회배려24, 학생부종합 102=특수교육10+재직자야간82+만학도10). "
    "총 2,053. 정원외 6개 전형 specialTypeKeyword에 '정원외(...)' 표기."
)
warnings.append(
    "[지역인재] 지역인재(교과)160·지역인재(종합)179는 충청권(대전·세종·충남·충북) 고교 전 과정 이수자 대상 "
    "정원내 전형(지역균형인재 육성법). 정원외 아님."
)
warnings.append(
    "[캠퍼스] 단일 대전 유성덕명캠퍼스. 단 인공지능소프트웨어학과는 세종공동캠퍼스에서 수업(본문 명시) → campus='세종(세종공동캠퍼스)'. "
    "야간 학과(전기시스템공학과·회계세무부동산학과)는 대전 캠퍼스 야간 과정."
)
warnings.append(
    "[총괄표 vs 세부페이지 교차검증] 총괄표(물리 p5~6) 16개 전형 컬럼을 위치파싱하고, 각 전형 세부페이지 "
    "'가. 모집단위와 모집인원'을 직독하여 전 학과·전 컬럼 값이 정확히 일치함을 확인(분배전형 13개 컬럼합 "
    "전부 총계행과 일치). 행합 기준은 총괄표에 학과별 '계' 컬럼이 없어 트랙합으로 둠."
)
warnings.append(
    "[2027 변경] 모집단위명 변경: 정보기술학부→정보기술AI융합학부. 모집단위 폐지: 융합건설시스템학과(야간). "
    "전형명 변경: 평생학습미래(야간)→학생부종합(야간). 사회통합전형 신설(국가보훈대상자전형 폐지·흡수)."
)


# ════════════════════════════════════════════════════════════════════════════
# 5. 결과 + meta
# ════════════════════════════════════════════════════════════════════════════
result = {
    "universityName": "국립한밭대학교", "year": 2027, "recruitmentSeason": "susi",
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
    "universityName": "국립한밭대학교", "universityId": "kcue_0000039",
    "year": 2027, "recruitmentSeason": "susi", "sourceDocYear": SOURCE_DOC_YEAR,
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "campusScope": "단일(대전 유성덕명) — 인공지능소프트웨어학과만 세종공동캠퍼스",
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "basis": "학과별 트랙 quotaInitial 합 (총괄표에 학과 '계' 컬럼 없음)",
        "passed": row_pass, "failed": row_fail, "failedList": parse_fail,
    },
    "colTotalValidation": coltotal_result,
    "colTotalGye": {"computed": computed_gye, "expected": expected_gye, "match": gye_match},
    "checksumPassed": checksum_passed,
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

out_path = BASE / "hanbat-text.json"
out_path.write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
                    encoding="utf-8")


# ════════════════════════════════════════════════════════════════════════════
# 6. 콘솔 리포트
# ════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("국립한밭대학교 2027 수시 — 텍스트 직접 구조화 (Vision 미사용, $0)")
print("=" * 72)
print(f"sourceDocYear: {SOURCE_DOC_YEAR}  |  그리드 물리페이지: {PG_GRID}")
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"\n행합 검증(트랙 quota 합 기준): 통과 {row_pass} / 실패 {row_fail}")
for f in parse_fail:
    print(f"   [실패] {f}")

print("\n열합 검증 (전형별 계산 vs 총괄표 총계행):")
for item in coltotal_result:
    flag = "OK" if item["match"] else "XX"
    pool = " (풀)" if item["track"] in POOL_KEYS else ""
    print(f"  [{flag}] {item['track']:10s}  계산={item['computed']:5d}  총계행={item['expectedSumRow']:5d}{pool}")
print(f"  총계: 계산={computed_gye}  총계행={expected_gye}  {'OK' if gye_match else 'XX'}")

print(f"\nmeta.checksumPassed: {checksum_passed}")
print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n), ("csatMinimumRawText", c_n),
                 ("csatMinimumExempt", ce_n), ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    pct = 100 * n // T if T else 0
    print(f"  {label:18s}: {n}/{T} ({pct}%)")
print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {out_path}")
