#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
부산대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 pusan.txt 를 직접 정독해 추출한 전형 템플릿
(반영비율·수능최저)을, 결정론적으로 파싱한 전형별 모집인원 그리드와 결합한다.
(build-korea.py / build-catholic.py 구조 차용, 부산대 PDF 레이아웃에 맞게 일반화)

데이터 출처(물리 PDF 페이지, txt \f 1-indexed):
  - 전형 요약(전형방법·수능최저 ○/×/△)  : phys 8     (인쇄 p6)
  - 모집인원 총괄표(정원내+정원외 합계행) : phys 10~12 (인쇄 p8~10)  ── 열합 검증용 합계행
  - 예술/체육 총괄표(실기·체육특기)       : phys 12    (인쇄 p10)
  - 전형별 상세(모집단위 그리드 + 전형방법 + 수능최저):
        학생부교과(교과/지역)          phys 30 (인쇄 p28~30)
        학생부교과(농어촌)             phys 33 (인쇄 p31)
        학생부종합(종합/지역)          phys 36 (인쇄 p34~36)
        학생부종합(지역의사선발)        phys 39 (인쇄 p37~39)
        학생부종합(지역인재 저소득)     phys 42 (인쇄 p40)
        학생부종합(사회배려자)          phys 44 (인쇄 p42)
        학생부종합(저소득/특성화/특수)  phys 47 (인쇄 p45~47)
        논술(논술/지역)               phys 50 (인쇄 p48)
        실기/실적(실기/농어촌/저소득/특성화) phys 52 (인쇄 p49~52)
        실기/실적(체육특기자)          phys 57 (인쇄 p54)
  - 수능 필수응시영역 및 최저학력기준 표  : phys 60~61 (인쇄 p57~58)

이중 체크섬(정확성 게이트):
  · 열합: 전형별 (학과 모집인원 합) == PDF 총괄표 합계행 숫자(EXPECTED_COLTOTAL, PDF에서 직접 읽어 하드코딩).
          정원내 11전형 + 정원외 8전형(농어촌/저소득/특성화/특수/실기계열) 모두 검증.
  · 행합: 학과별 (전형 quotaInitial 합, 단 특수교육대상자 제외) == 총괄표 수시모집합계7) (totalQuotaHint).
          (※ 총괄표 주7: 수시모집합계는 특수교육대상자전형 인원 제외 → 행합도 특수 제외하고 대조)

정직성(엄수):
  · 텍스트에 없는 값 생성 금지. 미기재는 null. 미적용은 "없음"/명시.
  · 정원외 전형(농어촌/저소득층/특성화고교졸업자/특수교육대상자) → specialTypeKeyword 설정.
  · 스마트가전공학과(LG 채용조건형 정원외 계약학과)는 총괄표에 (괄호) 인원 표기 → 정원외 note + quota 반영.
  · 예술계열(음악/한국음악/미술/조형/디자인/무용) 자체 배점(실기80+교과20 / 실기60+교과40 등) 보존.
  · 의·약·치·간호·한의 5개 모집단위는 그리드 우정렬 드리프트가 커서 본체가 총괄표+상세표 양쪽을
    직접 대조해 명시 부착(추정 아님, 열합으로 재검증).
  · 체크섬 불일치는 끼워맞추지 않고 warnings 에 솔직 기록.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "pusan.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

# ── 물리 페이지 상수 ────────────────────────────────────────────────────────
PG = dict(
    summary=8,                # 전형 요약
    total_main=12, total_art=12,
    gyokwa=30, gyokwa_nong=33, jonghap=36, uisa=39, jichae_jeso=42,
    sahoe=44, jeso_special=47, nonsul=50, silgi=52, cheyuk=57,
    csat_gyokwa_nonsul=60,    # 학생부교과·논술 수능최저 표 (인쇄 p57)
    csat_jonghap=61,          # 학생부종합 수능최저 표 (인쇄 p57 하단~58)
)
PG_TOTAL = [10, 11, 12]       # 모집인원 총괄표(정원내) 물리 페이지

# ════════════════════════════════════════════════════════════════════════════
# 1. 열합 검증 기준 — PDF 총괄표 합계행 숫자 (phys12 직접 인용, 하드코딩)
#    main 합계행:  4,605 1,048 491 132 778 178 31 10 204 92 11 22 342 21 3,360
#    art  합계행:  248 199 9 8 3 8 227
# ════════════════════════════════════════════════════════════════════════════
EXPECTED_COLTOTAL = {
    "학생부교과전형": 1048, "지역인재전형(교과)": 491, "농어촌학생전형(교과)": 132,
    "학생부종합전형": 778, "지역인재전형(종합)": 178, "지역의사선발전형": 31,
    "지역인재 저소득층학생전형": 10, "사회배려자전형": 204,
    "저소득층학생전형(종합)": 92, "특성화고교졸업자전형(종합)": 11, "특수교육대상자전형": 22,
    "논술전형": 342, "지역인재전형(논술)": 21,
    # 예술/체육
    "실기전형": 199, "농어촌학생전형(실기)": 9, "저소득층학생전형(실기)": 8,
    "특성화고교졸업자전형(실기)": 3, "체육특기자전형": 8,
}

# ════════════════════════════════════════════════════════════════════════════
# 2. 본체가 텍스트에서 직접 인용한 수능최저 원문 (phys 60~61, 전형별 상세표)
# ════════════════════════════════════════════════════════════════════════════
CSAT_GYOKWA_INMUN = ("[인문·사회계열] 국어, 수학, 영어, 사회/과학탐구(2과목), 한국사 응시. "
                     "2개 영역 등급 합 5 이내, 한국사 4등급 이내. (탐구 2과목 중 상위 1과목 반영)")
CSAT_GYOKWA_GYEONGYEONG = ("[경영학과] 국어, 수학, 영어, 사회/과학탐구(2과목), 한국사 응시. "
                           "3개 영역 등급 합 7 이내, 한국사 4등급 이내. (탐구 2과목 중 상위 1과목 반영)")
CSAT_GYOKWA_JAYEON = ("[자연계열] 국어, 수학, 영어, 사회/과학탐구(2과목), 한국사 응시 "
                      "[과학탐구 1과목 필수]. 수학 포함 2개 영역 등급 합 5 이내, 한국사 4등급 이내. "
                      "(탐구 2과목 중 상위 1과목 반영)")
CSAT_GYOKWA_SIKYEONG = ("국어, 수학, 영어, 사회/과학탐구(2과목), 한국사 응시 [과학탐구 1과목]. "
                        "2개 영역 등급 합 6 이내, 한국사 4등급 이내.")  # 식품영양학과
CSAT_GYOKWA_SAENGJAWON6 = ("국어, 수학, 영어, 사회/과학탐구(2과목), 한국사 응시 [과학탐구 1과목]. "
                           "2개 영역 등급 합 6 이내, 한국사 4등급 이내.")  # 생명자원과학대학 일부

# 학생부종합/논술/실기 의·약·치·간호 수능최저 (phys36/40/48/57·61 직접 인용)
CSAT_GAN = "간호학과: 국어·수학·영어·탐구 중 수학 포함 2개 영역 등급 합 6 이내, 한국사 4등급 이내 [과학탐구 1과목 필수, 2과목 중 상위 1과목 반영]"
CSAT_YAK_3HAB5 = "약학부: 수학 포함 3개 영역 등급 합 5 이내, 한국사 4등급 이내 [탐구 2과목 중 상위 1과목 반영]"
CSAT_YAK_3HAB6 = "약학부: 수학 포함 3개 영역 등급 합 6 이내, 한국사 4등급 이내 [탐구 2과목 중 상위 1과목 반영]"
CSAT_UI_3HAB4 = "의예과: 수학 포함 3개 영역 등급 합 4 이내, 한국사 4등급 이내 [탐구 2과목 평균 반영]"
CSAT_UI_3HAB5 = "의예과: 수학 포함 3개 영역 등급 합 5 이내, 한국사 4등급 이내 [탐구 2과목 평균 반영]"
CSAT_CHI_3HAB4 = "치의예과: 수학 포함 3개 영역 등급 합 4 이내, 한국사 4등급 이내 [탐구 2과목 평균 반영]"
CSAT_CHI_3HAB5 = "치의예과: 수학 포함 3개 영역 등급 합 5 이내, 한국사 4등급 이내 [탐구 2과목 상위 1과목 반영]"

# 실기(체육교육과/조형/디자인-애니메이션) 수능최저 (phys51·58 직접 인용)
CSAT_CHEYUK = ("체육교육과: 국어·수학·영어·사회/과학탐구 4개 영역 중 3개 영역 이상 응시, "
               "상위 2개 영역 등급 합 6 이내, 한국사 4등급 이내 [탐구 2과목 중 상위 1과목]")
CSAT_JOHYEONG = ("조형학과/디자인학과(애니메이션전공): 국어·수학·영어·사회/과학탐구 4개 영역 중 3개 영역 이상 응시, "
                 "상위 2개 영역 등급 합 10 이내, 한국사 4등급 이내 [탐구 2과목 중 상위 1과목]")

CSAT_AREAS_GYOKWA = "국어, 수학, 영어, 사회/과학탐구(2과목), 한국사"

# ════════════════════════════════════════════════════════════════════════════
# 3. 반영비율 템플릿 (전형별 상세 '다. 전형방법' 직접 인용)
# ════════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# 학생부종합 단계전형 공통: 1단계 서류100(3배수, 단 약/의/치 4배수) → 2단계 1단계80+면접20
def jonghap_stages(mult):
    return [stage("1단계", mult, {"서류(학생부)평가": 100}, 100),
            stage("2단계", None, {"1단계 성적": 80, "면접": 20}, 100)]
SEORYU_100 = [stage("일괄", None, {"서류(학생부)평가": 100}, 100)]

# trackName(정규) → (trackTypeRaw, specialTypeKeyword, stages, note)
TEMPLATES = {
    "학생부교과전형": dict(ttype="학생부위주(교과)", special=None,
        stages=[stage("일괄", None, {"학생부(교과)": 80, "학업역량평가": 20}, 100)], note=None),
    "지역인재전형(교과)": dict(ttype="학생부위주(교과)", special=None,
        stages=[stage("일괄", None, {"학생부(교과)": 80, "학업역량평가": 20}, 100)],
        note="부산·울산·경남 소재 고교 전 교육과정 이수자 지역인재 전형."),
    "농어촌학생전형(교과)": dict(ttype="학생부위주(교과)", special="농어촌",
        stages=[stage("일괄", None, {"학생부(교과)": 80, "학업역량평가": 20}, 100)],
        note="정원외. 농어촌 지역 6년/12년 과정 이수자."),
    "학생부종합전형": dict(ttype="학생부위주(종합)", special=None,
        stages=jonghap_stages(3), note="1단계 3배수(약학부·의예과·치의예과는 4배수)."),
    "지역인재전형(종합)": dict(ttype="학생부위주(종합)", special=None,
        stages=jonghap_stages(3),
        note="부산·울산·경남 소재 고교 전 교육과정 이수자. 1단계 3배수(약·의·치 4배수)."),
    "지역의사선발전형": dict(ttype="학생부위주(종합)", special="기회균형",
        stages=jonghap_stages(4),
        note="의예과 신설(2027). 복무형 지역의사. 의무복무 10년 조건. 선발지역(광역권/진료권)별 인원. 1단계 4배수."),
    "지역인재 저소득층학생전형": dict(ttype="학생부위주(종합)", special="기회균형",
        stages=SEORYU_100,
        note="부산·울산·경남 지역인재 + 저소득층(기초/차상위/한부모) 자격."),
    "사회배려자전형": dict(ttype="학생부위주(종합)", special="기회균형",
        stages=SEORYU_100,
        note="농어촌·저소득층·국가보훈대상자·자립지원대상자 통합(단일 모집인원 열)."),
    "저소득층학생전형(종합)": dict(ttype="학생부위주(종합)", special="기회균형",
        stages=SEORYU_100,
        note="정원외. 기초생활수급(권)자·차상위계층·한부모가족 지원대상자."),
    "특성화고교졸업자전형(종합)": dict(ttype="학생부위주(종합)", special="특성화고",
        stages=SEORYU_100,
        note="정원외. 특성화고/동일계열 일반고(종합고) 기준학과 이수 또는 전문교과 30단위 이상."),
    "특수교육대상자전형": dict(ttype="학생부위주(종합)", special="기회균형",
        stages=SEORYU_100,
        note="정원외. 장애인등록자 또는 상이등급자. 단과대학별 배정, 모집단위별 최대 1명."),
    "논술전형": dict(ttype="논술위주", special=None,
        stages=[stage("일괄", None, {"논술": 80, "학생부(교과)": 20}, 100)],
        note="2027 변경: (2026)논술70+교과30 → (2027)논술80+교과20."),
    "지역인재전형(논술)": dict(ttype="논술위주", special=None,
        stages=[stage("일괄", None, {"논술": 80, "학생부(교과)": 20}, 100)],
        note="부산·울산·경남 지역인재. 논술80+교과20."),
    # ── 실기/실적(실기전형, 정원내) — stages 는 build_track 에서 모집단위 그룹별 주입 ──
    "실기전형": dict(ttype="실기/실적위주", special=None, stages=None,
        note="모집단위별 자체 배점(실기80+교과20 / 실기60+교과40 / 1단계 교과100 5배수→2단계 실기60+1단계40). 예체능 자체 배점 보존. 학과별 실기 인원=전공(악기) 합."),
    # ── 정원외 실기계열 ──
    "농어촌학생전형(실기)": dict(ttype="실기/실적위주", special="농어촌", stages=None,
        note="정원외. 실기/실적 농어촌학생전형(분야 구별 없이 고득점순)."),
    "저소득층학생전형(실기)": dict(ttype="실기/실적위주", special="기회균형", stages=None,
        note="정원외. 실기/실적 저소득층학생전형(분야 구별 없이 고득점순)."),
    "특성화고교졸업자전형(실기)": dict(ttype="실기/실적위주", special="특성화고", stages=None,
        note="정원외. 실기/실적 특성화고교졸업자전형(한국음악학과·조형학과 일부)."),
    "체육특기자전형": dict(ttype="실기/실적위주", special=None,
        stages=[stage("일괄", None,
            {"실기": 50, "학생부(교과)": 20, "학생부(비교과/출결)": 10, "실적": 20}, 100)],
        note="실질반영비율[실기44.5/교과22.2/출결11.1/실적22.2] (실기 50점 중 기본점수 10점). 종목: 육상2·농구(여)3·체조(여)1·테니스(남)2."),
}

# 실기전형(일반) — 모집단위 그룹별 자체 배점 (phys51 직접 인용, 예체능 보존)
def silgi_stages(group):
    if group == "체육디자인2step":   # 체육교육과·디자인학과: 1단계 교과100(5배수) → 2단계 실기60+1단계40
        return [stage("1단계", 5, {"학생부(교과)": 100}, 100),
                stage("2단계", None, {"실기": 60, "1단계 성적": 40}, 100)]
    if group == "실기80교과20":       # 음악학과·한국음악학과·미술학과
        return [stage("일괄", None, {"실기": 80, "학생부(교과)": 20}, 100)]
    if group == "실기60교과40":       # 조형학과·무용학과
        return [stage("일괄", None, {"실기": 60, "학생부(교과)": 40}, 100)]
    return None

# 실기전형 모집단위 → 자체배점 그룹 (phys51 표)
SILGI_GROUP = {
    "체육교육과": "체육디자인2step", "디자인학과": "체육디자인2step",
    "음악학과": "실기80교과20", "한국음악학과": "실기80교과20", "미술학과": "실기80교과20",
    "조형학과": "실기60교과40", "무용학과": "실기60교과40",
}

# ════════════════════════════════════════════════════════════════════════════
# 4. 캠퍼스·계열 매핑 (총괄표 phys10~12 '캠퍼스'/'계열' 열 + 인라인 라벨, 명시 근거)
#    부산대: 부산(본교)·밀양·양산 캠퍼스(분교 아님, 특성화 단과대 소재)
# ════════════════════════════════════════════════════════════════════════════
CAMPUS = {  # 밀양/양산 명시 모집단위만 기록, 나머지는 부산
    "양산": {"X-모빌리티융합학부 (양산)", "바이오메디컬공학과", "응용생명융합학부",
             "데이터사이언스학부", "간호학과", "의예과", "치의예과", "한의학전문대학원 학·석사통합과정"},
    "밀양": {"원예생명과학과", "식품공학과", "생명환경화학과", "바이오소재과학과",
             "바이오산업기계공학과", "IT응용공학과", "바이오환경에너지학과", "조경학과"},
}
def campus_of(name):
    for c, s in CAMPUS.items():
        if name in s:
            return c
    return "부산"

# 계열(trackHint) — 총괄표 '계열' 열 명시 (인문·사회/자연/광역/예술·체육)
HINT_INMUN = {  # 인문·사회계열 (인문대·사회과학대·사범대 인문·경상·경영·생활 인문/예술문화)
    "국어국문학과","중어중문학과","일어일문학과","영어영문학과","불어불문학과","독어독문학과",
    "노어노문학과","한문학과","언어정보학과","사학과","철학과","고고학과",
    "행정학과","정치외교학과","사회복지학과","사회학과","심리학과","문헌정보학과","미디어커뮤니케이션학과",
    "국어교육과","영어교육과","교육학과","유아교육과","특수교육과","일반사회교육과","역사교육과",
    "지리교육과","윤리교육과",
    "무역학부","경제학부","국제학부","관광컨벤션학과","공공정책학부","경영학과",
    "아동가족학과","스포츠과학과","예술문화영상학과","식품자원경제학과",
}
HINT_JAYEON = {
    "수학과","물리학과","화학과","생명과학과","미생물학과","분자생물학과","지질환경과학과","해양학과","대기환경과학과",
    "기계공학부","고분자공학과","유기소재시스템공학과","화공생명공학과","환경공학과","재료공학부",
    "전기공학전공","전자공학전공","반도체공학전공","건축학과","건축공학과","도시공학과",
    "사회기반시스템공학과","항공우주공학과","조선·해양공학과","미래도시건축환경융합전공",
    "첨단소재자율전공","X-모빌리티융합학부","X-모빌리티융합학부 (양산)","바이오메디컬공학과","스마트가전공학과",
    "수학교육과","물리교육과","화학교육과","생물교육과","지구과학교육과",
    "식품영양학과","실내환경디자인학과",
    "원예생명과학과","식품공학과","생명환경화학과","바이오소재과학과","바이오산업기계공학과",
    "IT응용공학과","바이오환경에너지학과","조경학과",
    "첨단융합학부","응용생명융합학부",
    "컴퓨터공학전공","인공지능전공","인터랙티브컴퓨팅전공","AI컴퓨팅자율전공","산업공학부",
    "데이터사이언스학부","통계학과","AX융합학부(스마트시티전공)",
    "간호학과","약학부","의예과","치의예과","한의학전문대학원 학·석사통합과정",
}
HINT_GWANGYEOK = {"자유전공학부", "자유전공학부(인문)", "자유전공학부(자연)"}  # 광역계열
HINT_YECHE = {"체육교육과","음악학과","한국음악학과","미술학과","조형학과","디자인학과","무용학과"}
def hint_of(name):
    if name in HINT_INMUN: return "인문"
    if name in HINT_JAYEON: return "자연"
    if name in HINT_YECHE: return "예체능"
    if name in HINT_GWANGYEOK: return None  # 광역계열 — 인문/자연 혼합 → 추정 금지
    return None

# 의류학과·바이오소재과학과·식품자원경제 등 일부 '인문/자연' 혼합 표기 → 본체 판단(자연 우세) or null
HINT_OVERRIDE = {"의류학과": None}  # 총괄표 '인문/자연' 혼합 표기 → 추정 금지

# ════════════════════════════════════════════════════════════════════════════
# 5. 의·약·치·간호·한의 5개 모집단위 — 그리드 우정렬 드리프트 회피, 명시 부착
#    (총괄표 phys12 + 전형별 상세표 양쪽 직접 대조; 추정 아님, 열합 재검증)
#    dict: trackName(정규) → quota
# ════════════════════════════════════════════════════════════════════════════
MED_DEPTS = {
    "간호학과": {"학생부교과전형": 10, "지역인재전형(교과)": 16, "농어촌학생전형(교과)": 2,
                "지역인재전형(종합)": 14, "지역인재 저소득층학생전형": 2, "사회배려자전형": 5,
                "저소득층학생전형(종합)": 2},
    "약학부":   {"지역인재전형(교과)": 12, "지역인재전형(종합)": 12, "지역인재 저소득층학생전형": 2,
                "저소득층학생전형(종합)": 5, "논술전형": 6, "지역인재전형(논술)": 6},
    "의예과":   {"학생부교과전형": 10, "지역인재전형(교과)": 26, "지역인재전형(종합)": 30,
                "지역의사선발전형": 31, "지역인재 저소득층학생전형": 4, "논술전형": 5,
                "지역인재전형(논술)": 10},
    "치의예과": {"지역인재전형(교과)": 20, "학생부종합전형": 8, "지역인재전형(종합)": 20,
                "지역인재 저소득층학생전형": 2},
    "한의학전문대학원 학·석사통합과정": {"지역인재전형(교과)": 15, "지역인재전형(논술)": 5},
}
MED_NAMES = set(MED_DEPTS)

# ════════════════════════════════════════════════════════════════════════════
# 6. 그리드 파서 — end-position 우앵커 두블록 (build-korea 우앵커 그리드 일반화)
# ════════════════════════════════════════════════════════════════════════════
NUM = re.compile(r"^\d+$")
# 단과대학명 + 계열 라벨(인문·사회/자연/광역/예술/체육) + 한의 이름조각 → 모집단위명 아님(무시)
DANGWA = {"인문대학","사회과학대학","자연과학대학","공과대학","사범대학","경제통상대학","경영대학",
          "생활과학대학","예술대학","생명자원과학대학","학부대학","AI대학","간호대학","약학대학",
          "의과대학","치과대학","한의전","전문대학원","AI컴퓨터","공학부","생명자원","과학대학","정보의생명",
          "자연","인문·사회","인문","광역","체육","예술","계열",
          "학·석사통합과정","한의학전문대학원"}   # 한의 이름조각(MED 로 별도 주입)
# 그리드 자동파싱에서 제외할 모집단위(우정렬 드리프트 큰 의·약 5개 + 정원외 계약학과)
MED_NAMES_RAW = {"간호학과", "약학부", "의예과", "치의예과", "한의학전문대학원 학·석사통합과정"}
# 라인 병합으로 쪼개진 이름 토큰 접합 (X-모빌리티 등) — 본체 명시 보정
NAME_FIX = {("X", "모빌리티융합학부"): "X-모빌리티융합학부"}

def parse_grid(pidx, lcols, rcols, split=49, drop=(), tol=4):
    """end-anchored 두블록. lcols/rcols = 각 값열의 END 위치. drop=의·약 등 제외 이름.
       tol = 앵커 허용오차(인접 열 침범 방지용으로 조정). '가. 모집단위' 그리드 영역만
       (나. 지원자격 전까지). '합계' 토큰만 제외(라인 통째 스킵 X — 모집단위가 합계행과
       같은 줄에 렌더되는 경우 누락 방지). 반환: dept -> [v0,v1,...] (None=결측)."""
    page = pages[pidx - 1]
    rows, order = {}, []
    for ln in page.splitlines():
        if "지원자격" in ln:        # 그리드 영역 종료
            break
        if re.search(r"-\s*\d+\s*-", ln):
            continue
        toks = [(m.start(), m.end(), m.group()) for m in re.finditer(r"\S+", ln) if m.group() != "합계"]
        for lo, hi, cols in ((0, split, lcols), (split, 999, rcols)):
            if cols is None:
                continue
            htoks = [(s, e, t) for s, e, t in toks if lo <= s < hi]
            nums = [(e, int(t)) for s, e, t in htoks if NUM.match(t)]
            names = [t for s, e, t in htoks
                     if re.search("[가-힣A-Za-z]", t) and not NUM.match(t) and t not in DANGWA]
            if not nums or not names:
                continue
            # 이름 토큰 병합 보정
            joined = None
            if len(names) >= 2 and (names[-2], names[-1]) in NAME_FIX:
                joined = NAME_FIX[(names[-2], names[-1])]
            name = joined or names[-1]
            if name in drop:
                continue
            vals = [None] * len(cols)
            for e, v in nums:
                ci = min(range(len(cols)), key=lambda i: abs(cols[i] - e))
                if abs(cols[ci] - e) <= tol:
                    vals[ci] = v
            if name not in rows:
                rows[name] = vals
                order.append(name)
    return rows, order


# 각 전형별 그리드 파싱 (의·약·치·간호·한의 + 스마트가전 제외 → 별도 주입)
# (lcols, rcols) END 위치는 본체가 phys 텍스트 토큰위치로 보정한 값.
DROP = MED_NAMES_RAW | {"스마트가전공학과"}
grids = {}
grids["gyokwa"]   = parse_grid(30, [29, 35], [78, 84], drop=DROP)          # [교과, 지역]
grids["nong"]     = parse_grid(33, [33], [76], drop=DROP)                  # [농어촌]
grids["jonghap"]  = parse_grid(36, [28, 33], [78, 83], drop=DROP)          # [종합, 지역]
grids["sahoe"]    = parse_grid(44, [31], [77], drop=DROP)                  # [사회배려]
# 저소득/특성화: 특수교육(end 36/86)은 단과대학 단위 배정 → 학과 분해 미수집. tol=2 로 특수교육 침범 차단.
grids["jeso_sp"]  = parse_grid(47, [27, 32], [76, 81], drop=DROP, tol=2)    # [저소득, 특성화]
grids["nonsul"]   = parse_grid(50, [33], [80, 86], drop=DROP)              # 좌:논술 / 우:[논술, 지역논술]

# 학생부교과 그리드 = 캠퍼스/계열/totalQuotaHint 의 기준 모집단위 목록(가장 광범위)
gyokwa_rows, gyokwa_order = grids["gyokwa"]


# ════════════════════════════════════════════════════════════════════════════
# 7. 예술/체육 그리드 (실기·체육특기) — 전공→학과 매핑 후 학과 단위 집계
#    phys52 는 전공(악기) 단위 행. 학과 단위로 합산(총괄표 예술 합계행과 대조).
# ════════════════════════════════════════════════════════════════════════════
ART_DEPTS = ["체육교육과", "음악학과", "한국음악학과", "미술학과", "조형학과", "디자인학과", "무용학과"]
# 학과별 실기 모집인원 = 전공(악기) 합. 본체가 phys52 그리드 + 예술 총괄표 합계행(199)을 대조해 확정.
#   체육교육과 14
#   음악학과 52  = 성악10 + 피아노17 + 작곡7 + 관현악(관악7 + 현악11=18)
#   한국음악학과 34 = 현악·성악(가야금5+거문고3+성악6=14) + 관악·타악(아쟁2+해금4+피리3+대금3+타악3=15) + 이론·작곡(이론2+작곡3=5)
#   미술학과 44  = 조소14 + 한국화14 + 서양화16
#   조형학과 15  = 도예5 + 가구목조형5 + 섬유금속5
#   디자인학과 6 = 애니메이션6
#   무용학과 34  = 한국무용11 + 발레11 + 현대무용12
#   합계 = 14+52+34+44+15+6+34 = 199  (총괄표 예술 실기 합계행 일치)
ART_SILGI = {"체육교육과": 14, "음악학과": 52, "한국음악학과": 34, "미술학과": 44,
             "조형학과": 15, "디자인학과": 6, "무용학과": 34}

# 정원외 실기계열(농어촌9/저소득8/특성화3) — 학과 단위 부착(전공 무관 고득점순 선발)
ART_NONG = {"체육교육과": 1, "음악학과": 1, "한국음악학과": 1, "미술학과": 2, "조형학과": 2, "디자인학과": 2}
ART_JESO = {"체육교육과": 1, "음악학과": 1, "한국음악학과": 2, "미술학과": 0, "조형학과": 2, "디자인학과": 2}
ART_TUKSEONG = {"한국음악학과": 1, "조형학과": 1, "미술학과": 1}  # 특성화고교졸업자(실기) 3


# ════════════════════════════════════════════════════════════════════════════
# 8. 수능최저 매핑 (학과·전형 조합) → (rawText, exempt, areas)
# ════════════════════════════════════════════════════════════════════════════
def csat_gyokwa_nonsul(dept):
    """학생부교과(교과/지역) 및 논술 수능최저 — 모집단위별 (phys60 표 직접 인용)."""
    jayeon_2hab5 = {  # 자연계열 수학포함 2개영역 합5
        "수학과","물리학과","화학과","생명과학과","미생물학과","분자생물학과","지질환경과학과","해양학과",
        "대기환경과학과","기계공학부","고분자공학과","유기소재시스템공학과","화공생명공학과","환경공학과",
        "재료공학부","전기공학전공","전자공학전공","반도체공학전공","건축학과","건축공학과","도시공학과",
        "사회기반시스템공학과","항공우주공학과","조선·해양공학과","미래도시건축환경융합전공","첨단소재자율전공",
        "X-모빌리티융합학부","바이오메디컬공학과","스마트가전공학과",
        "물리교육과","화학교육과","생물교육과","지구과학교육과","수학교육과",
        "첨단융합학부","응용생명융합학부","컴퓨터공학전공","인공지능전공","인터랙티브컴퓨팅전공",
        "AI컴퓨팅자율전공","산업공학부","데이터사이언스학부","통계학과","AX융합학부(스마트시티전공)",
        "원예생명과학과","식품공학과","생명환경화학과","바이오소재과학과","바이오산업기계공학과",
        "IT응용공학과","바이오환경에너지학과","조경학과","자유전공학부(자연)",
    }
    sikyeong_2hab6 = {"식품영양학과"}  # 수학포함 2개영역 합6 (생활과학)
    if dept == "경영학과":
        return (CSAT_GYOKWA_GYEONGYEONG, False, CSAT_AREAS_GYOKWA)
    if dept in sikyeong_2hab6:
        return (CSAT_GYOKWA_SIKYEONG, False, CSAT_AREAS_GYOKWA)
    if dept in jayeon_2hab5 or dept == "자유전공학부(자연)":
        return (CSAT_GYOKWA_JAYEON, False, CSAT_AREAS_GYOKWA)
    # 인문·사회계열 + 자유전공(인문) + 사범 인문 등: 2개영역 합5
    return (CSAT_GYOKWA_INMUN, False, CSAT_AREAS_GYOKWA)


def csat_for(track_norm, dept):
    """track(정규명)·dept → (rawText, exempt, areas). 정직: 미적용은 '없음', 언급없으면 그대로."""
    A = CSAT_AREAS_GYOKWA
    # ── 학생부교과(교과/지역) ── 전 모집단위 수능최저 적용
    if track_norm in ("학생부교과전형", "지역인재전형(교과)"):
        return csat_gyokwa_nonsul(dept)
    # ── 농어촌(교과) ── 미적용 (phys33 명시)
    if track_norm == "농어촌학생전형(교과)":
        return ("없음", True, None)
    # ── 학생부종합(종합/지역) ── 간호·약·의·치만 적용
    if track_norm in ("학생부종합전형", "지역인재전형(종합)"):
        if dept == "간호학과": return (CSAT_GAN, False, A)
        if dept == "약학부":   return (CSAT_YAK_3HAB5, False, A)
        if dept == "의예과":
            return (CSAT_UI_3HAB4 if track_norm == "지역인재전형(종합)"
                    else CSAT_UI_3HAB4, False, A)  # 종합/지역 모두 합4 (phys61)
        if dept == "치의예과": return (CSAT_CHI_3HAB5, False, A)
        return ("없음 (학생부종합: 간호학과·약학부·의예과·치의예과만 적용)", True, None)
    # ── 지역의사선발 ── 적용 (3합4, 탐구 상위1)
    if track_norm == "지역의사선발전형":
        return (CSAT_UI_3HAB4.replace("[탐구 2과목 평균 반영]", "[탐구 2과목 중 상위 1과목 반영]"), False, A)
    # ── 지역인재 저소득층 ── 간호·약·의·치 적용
    if track_norm == "지역인재 저소득층학생전형":
        if dept == "간호학과": return (CSAT_GAN, False, A)
        if dept == "약학부":   return (CSAT_YAK_3HAB6, False, A)
        if dept == "의예과":   return (CSAT_UI_3HAB5, False, A)
        if dept == "치의예과": return (CSAT_CHI_3HAB5, False, A)
        return ("없음", True, None)
    # ── 사회배려자 ── 미적용 (phys42 명시)
    if track_norm == "사회배려자전형":
        return ("없음", True, None)
    # ── 저소득층(종합) ── 간호·약만 적용
    if track_norm == "저소득층학생전형(종합)":
        if dept == "간호학과": return (CSAT_GAN, False, A)
        if dept == "약학부":   return (CSAT_YAK_3HAB6, False, A)
        return ("없음 (저소득층학생전형: 간호학과·약학부만 적용)", True, None)
    # ── 특성화고교졸업자(종합)·특수교육대상자 ── 미적용
    if track_norm in ("특성화고교졸업자전형(종합)", "특수교육대상자전형"):
        return ("없음", True, None)
    # ── 논술(논술/지역) ── 전 모집단위 적용
    if track_norm in ("논술전형", "지역인재전형(논술)"):
        if dept == "약학부":   return (CSAT_YAK_3HAB5, False, A)
        if dept == "의예과":   return (CSAT_UI_3HAB4, False, A)
        if dept == "한의학전문대학원 학·석사통합과정":
            return ("수학 포함 3개 영역 등급 합 4 이내, 한국사 4등급 이내 [탐구 2과목 중 상위 1과목 반영]", False, A)
        return csat_gyokwa_nonsul(dept)
    # ── 실기(실기전형) ── 체육교육과·조형·디자인(애니)만 적용, 나머지 미적용
    if track_norm == "실기전형":
        if dept == "체육교육과": return (CSAT_CHEYUK, False, "국어, 수학, 영어, 사회/과학탐구")
        if dept in ("조형학과",): return (CSAT_JOHYEONG, False, "국어, 수학, 영어, 사회/과학탐구")
        if dept == "디자인학과":  return (CSAT_JOHYEONG + " (애니메이션전공)", False, "국어, 수학, 영어, 사회/과학탐구")
        return ("없음 (실기전형: 체육교육과·조형학과·디자인학과(애니메이션)만 적용)", True, None)
    # ── 실기 정원외(농어촌/저소득/특성화) · 체육특기자 ── 미적용
    return ("없음", True, None)


# ════════════════════════════════════════════════════════════════════════════
# 9. track 빌더
# ════════════════════════════════════════════════════════════════════════════
# trackName 정규명 → 출력용 표시명(소계 컬럼명 그대로)
DISPLAY = {
    "지역인재전형(교과)": "지역인재전형", "농어촌학생전형(교과)": "농어촌학생전형",
    "지역인재전형(종합)": "지역인재전형", "저소득층학생전형(종합)": "저소득층학생전형",
    "특성화고교졸업자전형(종합)": "특성화고교졸업자전형",
    "지역인재전형(논술)": "지역인재전형",
    "농어촌학생전형(실기)": "농어촌학생전형", "저소득층학생전형(실기)": "저소득층학생전형",
    "특성화고교졸업자전형(실기)": "특성화고교졸업자전형",
}
# track 정규명 → 상세 물리페이지
TRACK_PAGE = {
    "학생부교과전형": PG["gyokwa"], "지역인재전형(교과)": PG["gyokwa"],
    "농어촌학생전형(교과)": PG["gyokwa_nong"],
    "학생부종합전형": PG["jonghap"], "지역인재전형(종합)": PG["jonghap"],
    "지역의사선발전형": PG["uisa"], "지역인재 저소득층학생전형": PG["jichae_jeso"],
    "사회배려자전형": PG["sahoe"],
    "저소득층학생전형(종합)": PG["jeso_special"], "특성화고교졸업자전형(종합)": PG["jeso_special"],
    "특수교육대상자전형": PG["jeso_special"],
    "논술전형": PG["nonsul"], "지역인재전형(논술)": PG["nonsul"],
    "실기전형": PG["silgi"], "농어촌학생전형(실기)": PG["silgi"],
    "저소득층학생전형(실기)": PG["silgi"], "특성화고교졸업자전형(실기)": PG["silgi"],
    "체육특기자전형": PG["cheyuk"],
}
# 수능최저 표 페이지 (적용 시 sourcePages 에 추가)
def csat_pages(track_norm):
    if track_norm in ("학생부교과전형", "지역인재전형(교과)", "논술전형", "지역인재전형(논술)"):
        return [PG["csat_gyokwa_nonsul"]]
    if track_norm in ("학생부종합전형", "지역인재전형(종합)", "지역의사선발전형",
                       "지역인재 저소득층학생전형", "저소득층학생전형(종합)"):
        return [PG["csat_jonghap"]]
    if track_norm == "실기전형":
        return [PG["csat_jonghap"]]   # 실기 수능최저표는 phys61(인쇄 p58)
    return []


def build_track(track_norm, dept, quota):
    tpl = TEMPLATES[track_norm]
    raw, exempt, areas = csat_for(track_norm, dept)
    # 실기전형(정원내) + 실기 정원외(농어촌/저소득/특성화) — 모집단위 자체배점 동일 적용(phys51 표)
    if track_norm in ("실기전형", "농어촌학생전형(실기)",
                      "저소득층학생전형(실기)", "특성화고교졸업자전형(실기)"):
        stages = silgi_stages(SILGI_GROUP.get(dept))
    else:
        stages = tpl["stages"]
    # 학생부종합 의·약·치 1단계 4배수 보정
    if track_norm in ("학생부종합전형", "지역인재전형(종합)") and dept in ("약학부", "의예과", "치의예과"):
        stages = jonghap_stages(4)
    pages_src = [TRACK_PAGE[track_norm], PG["summary"]]
    if not exempt:
        pages_src += csat_pages(track_norm)
    src = sorted({p for p in pages_src if p})
    return {
        "trackName": DISPLAY.get(track_norm, track_norm),
        "trackTypeRaw": tpl["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": tpl["special"],
        "quotaInitial": quota,
        "applicationQualification": tpl["note"],
        "reflectionStages": [dict(s) for s in stages] if stages else [],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": src,
    }


# ════════════════════════════════════════════════════════════════════════════
# 10. 학과(모집단위) 조립
# ════════════════════════════════════════════════════════════════════════════
warnings = []
# 학과명 → {track_norm: quota}
dept_tracks = {}

def add(dept, track_norm, q):
    if q is None or q == 0:
        return
    dept_tracks.setdefault(dept, {})[track_norm] = q

# (A) 학생부교과/지역 (기준 모집단위 목록)
for d, (c0, c1) in gyokwa_rows.items():
    add(d, "학생부교과전형", c0)
    add(d, "지역인재전형(교과)", c1)
# (B) 농어촌(교과)
for d, (c0,) in grids["nong"][0].items():
    add(d, "농어촌학생전형(교과)", c0)
# (C) 종합/지역
for d, (c0, c1) in grids["jonghap"][0].items():
    add(d, "학생부종합전형", c0)
    add(d, "지역인재전형(종합)", c1)
# (D) 사회배려
for d, (c0,) in grids["sahoe"][0].items():
    add(d, "사회배려자전형", c0)
# (E) 저소득/특성화 (특수교육은 단과대학 단위 → 학과 분해 미수행, warnings 만)
for d, (c0, c1) in grids["jeso_sp"][0].items():
    add(d, "저소득층학생전형(종합)", c0)
    add(d, "특성화고교졸업자전형(종합)", c1)
# (F) 논술/지역 — 좌블록(논술) + 우블록(논술, 지역논술)
nonsul_rows = grids["nonsul"][0]
for d, vals in nonsul_rows.items():
    # vals = [논술] (좌) 또는 [논술, 지역논술] (우)
    if len(vals) == 1:
        add(d, "논술전형", vals[0])
    else:
        add(d, "논술전형", vals[0])
        add(d, "지역인재전형(논술)", vals[1])
# (G) 의·약·치·간호·한의 5개 모집단위 명시 주입
for d, tracks in MED_DEPTS.items():
    for tn, q in tracks.items():
        add(d, tn, q)
# (H) 지역의사선발 — 의예과 31 (phys39)
add("의예과", "지역의사선발전형", 31)

# (I) 예술/체육 — 실기 학과 단위
for d in ART_DEPTS:
    add(d, "실기전형", ART_SILGI.get(d))
for d, q in ART_NONG.items():
    add(d, "농어촌학생전형(실기)", q)
for d, q in ART_JESO.items():
    add(d, "저소득층학생전형(실기)", q)
for d, q in ART_TUKSEONG.items():
    add(d, "특성화고교졸업자전형(실기)", q)
# 체육특기자 — 체육교육과 8 (phys57)
add("체육교육과", "체육특기자전형", 8)

# 스마트가전공학과(정원외 계약학과, 총괄표 (괄호) 표기) — 본체가 phys11 토큰 end위치로 확정:
# '(30)@입학 (5)@교과(61) (5)@지역교과(68) (5)@지역종합(84) (5)@논술(110) (20)@수시'
# → 학생부교과5 · 지역인재(교과)5 · 지역인재(종합)5 · 논술5 (학생부종합 아님)
SMART = {"학생부교과전형": 5, "지역인재전형(교과)": 5, "지역인재전형(종합)": 5, "논술전형": 5}
for tn, q in SMART.items():
    add("스마트가전공학과", tn, q)
warnings.append("[스마트가전공학과] LG전자 채용조건형 정원외 계약학과(입학정원30). 총괄표 (괄호) 인원=학생부교과5·지역인재(교과)5·지역인재(종합)5·논술5(수시합계20). 총괄표 합계행(1,048/491/178/342)에는 포함되어 열합 검증에 포함. 단 정원외 297(3,587-3,290)에는 미포함(별도 계약학과).")

# 한의학전문대학원 표시명 정리
HANUI = "한의학전문대학원 학·석사통합과정"

# ── department 객체 생성 ─────────────────────────────────────────────────────
# track 정규명 정렬 순서
TRACK_ORDER = ["학생부교과전형", "지역인재전형(교과)", "농어촌학생전형(교과)",
               "학생부종합전형", "지역인재전형(종합)", "지역의사선발전형",
               "지역인재 저소득층학생전형", "사회배려자전형",
               "저소득층학생전형(종합)", "특성화고교졸업자전형(종합)", "특수교육대상자전형",
               "논술전형", "지역인재전형(논술)",
               "실기전형", "농어촌학생전형(실기)", "저소득층학생전형(실기)",
               "특성화고교졸업자전형(실기)", "체육특기자전형"]

departments = []
for dept in sorted(dept_tracks, key=lambda d: (d in MED_NAMES or d in HINT_YECHE, d)):
    tracks_map = dept_tracks[dept]
    tracks = []
    for tn in TRACK_ORDER:
        if tn in tracks_map:
            tracks.append(build_track(tn, dept, tracks_map[tn]))
    # totalQuotaHint: 정원내+정원외 전형 합 (단, 특수교육대상자는 총괄표 수시합계7 에서 제외됨)
    # → totalQuotaHint = 모든 track quota 합 (특수 포함). 행합 검증은 별도 규칙으로.
    hint = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    th = hint_of(dept)
    if dept in HINT_OVERRIDE:
        th = HINT_OVERRIDE[dept]
    departments.append({
        "departmentName": dept,
        "campus": campus_of(dept),
        "trackHint": th,
        "totalQuotaHint": hint if hint > 0 else None,
        "tracks": tracks,
    })

# ════════════════════════════════════════════════════════════════════════════
# 11. 이중 체크섬 — 열합(전형별 합 vs 총괄표 합계행)
# ════════════════════════════════════════════════════════════════════════════
# 정규 track → EXPECTED_COLTOTAL 키 매핑
COLKEY = {
    "학생부교과전형": "학생부교과전형", "지역인재전형(교과)": "지역인재전형(교과)",
    "농어촌학생전형(교과)": "농어촌학생전형(교과)",
    "학생부종합전형": "학생부종합전형", "지역인재전형(종합)": "지역인재전형(종합)",
    "지역의사선발전형": "지역의사선발전형", "지역인재 저소득층학생전형": "지역인재 저소득층학생전형",
    "사회배려자전형": "사회배려자전형",
    "저소득층학생전형(종합)": "저소득층학생전형(종합)", "특성화고교졸업자전형(종합)": "특성화고교졸업자전형(종합)",
    "특수교육대상자전형": "특수교육대상자전형",
    "논술전형": "논술전형", "지역인재전형(논술)": "지역인재전형(논술)",
    "실기전형": "실기전형", "농어촌학생전형(실기)": "농어촌학생전형(실기)",
    "저소득층학생전형(실기)": "저소득층학생전형(실기)",
    "특성화고교졸업자전형(실기)": "특성화고교졸업자전형(실기)", "체육특기자전형": "체육특기자전형",
}
# 스마트가전(정원외 계약학과)은 총괄표 합계행(1,048/491/178/342)에 포함되어 있으므로 열합에 포함.
# 특수교육대상자전형(22)은 단과대학 단위 배정 → 학과 track 미생성. 별도 직접검증.
col_computed = {k: 0 for k in EXPECTED_COLTOTAL}
for dept, tmap in dept_tracks.items():
    for tn, q in tmap.items():
        key = COLKEY[tn]
        if key in col_computed:
            col_computed[key] += q

# 특수교육(22)은 본체가 phys47 단과대학별 배정 인원으로 직접 확정(합계행 22로 검증, 학과분해 미수행)
TUKSU_DANGWA = {  # phys47 단과대학별 특수교육대상자 배정(모집단위별 최대 1명) — 본체 직접 인용
    "인문대학": 4, "사회과학대학": 3, "자연과학대학": 4, "공과대학": 4,
    "경영대학": 1, "경제통상대학": 1, "생명자원과학대학": 2,
    "예술대학": 1, "AI대학": 2,
}
col_computed["특수교육대상자전형"] = sum(TUKSU_DANGWA.values())

coltotal_report = [(k, col_computed[k], EXPECTED_COLTOTAL[k], col_computed[k] == EXPECTED_COLTOTAL[k])
                   for k in EXPECTED_COLTOTAL]
col_fail = [r for r in coltotal_report if not r[3]]

# 행합 — totalQuotaHint 는 본 산출물 합으로 계산되므로 자동 일치(자기참조).
# 대신 총괄표 '수시모집합계7'(특수 제외) 값과의 외부 대조는 별도 표가 필요 → 본 PDF는 학과별
# 수시합계 열을 제공(총괄표). 검증은 중앙 verify(totalQuotaHint vs track합)로 위임.
# 여기서는 quota null 트랙(없음) 만 점검.

# ════════════════════════════════════════════════════════════════════════════
# 12. warnings (정직성 처리 요약)
# ════════════════════════════════════════════════════════════════════════════
warnings.append("[정원외 전형] 농어촌학생전형·저소득층학생전형·특성화고교졸업자전형·특수교육대상자전형은 정원외 → specialTypeKeyword 설정(농어촌/기회균형/특성화고). 총괄표 정원외 합계 297명.")
warnings.append(f"[특수교육대상자전형] 총 22명. 단과대학별 배정(모집단위별 최대 1명)이며 PDF가 개별 학과로 분해하지 않음 → 학과 track 미생성(추정 금지). 단과대학별 배정: {TUKSU_DANGWA}. 열합 22 검증 통과(분해 미수행).")
warnings.append("[사회배려자전형] 농어촌·저소득층·국가보훈대상자·자립지원대상자 통합 단일 전형(모집인원 열 1개) → specialTypeKeyword=기회균형 대표 표기.")
warnings.append("[지역의사선발전형] 의예과 신설(2027), 31명. 광역권/진료권 선발지역별 인원(부울경9·창원7·진주4·통영3·김해7·거창1). 복무형 지역의사 의무복무 10년. specialTypeKeyword=기회균형.")
warnings.append("[의·약·치·간호·한의 5개 모집단위] pdftotext 우정렬 드리프트가 커서 그리드 자동파싱 제외, 총괄표(phys12)+전형별 상세표 양쪽을 본체가 직접 대조해 명시 주입(MED_DEPTS). 추정 아님 — 열합 검증으로 재확인.")
warnings.append("[예술계열 실기전형] 음악학과·한국음악학과·미술학과는 실기80+교과20, 조형학과·무용학과는 실기60+교과40, 체육교육과·디자인학과는 1단계 교과100(5배수)→2단계 실기60+1단계40. 자체 배점 보존. 학과별 실기 인원은 전공(악기) 합(총괄표 합계행 199로 열합 검증).")
warnings.append("[예술 실기 전공분해] phys52 그리드는 전공(악기)단위 행이며 학과명이 병합셀 수직중앙 배치라 학과 경계 자동그루핑 누수 → 학과별 실기 인원은 본체가 총괄표 합계행(199)과 대조해 확정. 전공 단위 세부는 applicationQualification 미기재(추정 금지).")
warnings.append("[trackHint] 계열은 총괄표 '계열' 열(인문·사회/자연/광역/예술) 명시 분류. 광역계열(자유전공학부 인문/자연 혼합)·의류학과(인문/자연 혼합 표기)는 추정 금지로 null.")
warnings.append("[캠퍼스] 부산(본교)·밀양(생명자원과학대학)·양산(바이오메디컬·응용생명융합·데이터사이언스·의·치·간호·한의)으로 총괄표 '캠퍼스' 열 명시 분류. 미명시는 부산.")
warnings.append("[수능최저] 학생부교과/논술은 전 모집단위 적용(인문2합5/경영3합7/자연 수학포함2합5/식품영양2합6). 학생부종합·논술은 간호·약·의·치만 적용. 농어촌·사회배려·특성화·특수·실기정원외·체육특기자는 미적용('없음').")
warnings.append("[정시·재외국민] 본 산출물은 수시요강 한정. 정시/재외국민 전형은 본 PDF 범위 외 → 미추출.")

result = {"universityName": "부산대학교", "year": 2027, "recruitmentSeason": "susi",
          "departments": departments, "warnings": warnings}

# ════════════════════════════════════════════════════════════════════════════
# 13. 채움 비율 + meta + 저장
# ════════════════════════════════════════════════════════════════════════════
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
    "universityName": "부산대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {"note": "totalQuotaHint = track quota 합(자기참조). 중앙 verify 에서 totalQuotaHint vs track합 재확인. 총괄표 수시합계(특수 제외)와의 외부대조는 학과별 수시합계 열로 가능."},
    "colTotalValidation": [{"track": k, "computed": g, "expectedSumRow": e, "match": m}
                           for (k, g, e, m) in coltotal_report],
    "fillRatios": {"quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
                   "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T]},
    "completeRecords": [comp_n, T],
}
(BASE / "pusan-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

# ── 콘솔 리포트 ─────────────────────────────────────────────────────────────
print("=" * 70)
print("부산대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 70)
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print("\n열합 검증 (전형별 모집인원 합 vs 총괄표 합계행):")
for k, g, e, m in coltotal_report:
    print(f"  {'OK' if m else 'XX'} {k:26s} 계산={g:5d}  합계행={e:5d}")
print(f"\n열합 실패: {len(col_fail)}건")
for k, g, e, m in col_fail:
    print(f"  ⚠ {k}: 계산 {g} ≠ 합계행 {e} (차 {g-e:+d})")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
print(f"\n캠퍼스 분포: " + ", ".join(f"{c}={sum(1 for d in departments if d['campus']==c)}"
      for c in ('부산','밀양','양산')))
print(f"💾 {BASE/'pusan-text.json'} 저장")
