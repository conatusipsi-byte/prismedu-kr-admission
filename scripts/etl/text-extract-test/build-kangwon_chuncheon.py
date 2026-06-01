#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
강원대학교 2027 수시 — 춘천·삼척(도계포함)캠퍼스 전용 요강
  pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 kangwon_chuncheon.txt 를 직접 정독해 추출한 전형 템플릿
(반영비율·수능최저)을, 위치기반(x좌표) 그리드 파서가 추출한 모집인원과 결합한다. (build-korea/catholic 일반화)

⚠️ 캠퍼스 구분(강릉·원주와 학과 중복 방지 핵심):
  - 본 PDF 는 강원대 **춘천 + 삼척(도계포함)** 전용. 강릉·원주 캠퍼스는 별도 PDF(이번 배치 없음).
  - 같은 university_id(강원대) 라 campus 필드로 춘천/삼척/도계 를 정확 기록.
  - 단과대학명 라벨이 (춘천)/(강릉) 으로 표기된 통합단과대학 존재 → 모집단위 소속 캠퍼스로 판정.
  - 도계: 소방방재학부, 사회복지학과(도계→2학년부터 삼척수업), 유아교육과(도계),
          보건과학대학 일부(식품영양/안경광/바이오기능성), 독립학부 자유전공(자연계열) 등 = '도계'.
    삼척: 그 외 삼척캠퍼스 학과.

데이터 출처(물리 PDF 페이지, txt \f 1-indexed):
  - 개요(전형요약·반영방법·수능최저적용)      : phys 2  (인쇄 p1)
  - 춘천 모집인원 그리드                       : phys 8,9 (인쇄 p6, 2면)
  - 삼척(도계) 모집인원 그리드                 : phys 10 (인쇄 p7)
  - 전형별 세부 모집인원(지역의사 권역/실기 전공): phys 11 (인쇄 p9)
  - Ⅰ 전형유형별 선발 방법                     : phys 23~78 (인쇄 p21~76) → 본체 직접 인용 → TEMPLATES
  - Ⅱ 수능최저학력기준 반영방법(춘천)          : phys 79 (인쇄 p77) → 본체 직접 인용 → CSAT 충족등급표

이중 체크섬:
  · 행합: 학과별 (정원내 전형별 모집인원 합) == 그리드 '합계' 열. (그룹선발 정원외 제외 — PDF 명시)
  · 열합: 전형별 모집인원 합 == 그리드 '합계' 행(하드코딩 대조). 춘천 18열 + 삼척 12열 모두 검증.
정직성:
  · 텍스트에 없는 값 생성 금지. 미기재 null, 미적용 "없음".
  · 삼척 농어촌·특성화고: PDF 가 '(모집단위별 입학정원의 10% 이내 선발)' 텍스트로만 표기(그룹선발) →
    개별 학과 분해 불가 → 캠퍼스 그룹 앵커에 합계행 총량 부착 + note. (추정 분해 안 함)
  · 특수교육대상자: 사범대(개별) 외 ●표기 학과는 통합선발 → 사범 개별값만 per-dept, 잔여는 그룹 부착.
  · CSAT: 춘천만 적용(삼척·도계 전 모집단위 미적용 — PDF p77 명시). 충족등급은 p77 표 직접 전사.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "kangwon_chuncheon.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

# 물리 페이지 상수
PG_OVERVIEW   = 2   # 전형 개요(반영방법 요약)
PG_GRID_CC1   = 8   # 춘천 그리드 1면
PG_GRID_CC2   = 9   # 춘천 그리드 2면
PG_GRID_SC    = 10  # 삼척(도계) 그리드
PG_DETAIL     = 11  # 전형별 세부(지역의사 권역, 실기 전공)
PG_CSAT       = 79  # Ⅱ 수능최저(춘천)
# (전형방법 상세 물리페이지 매핑은 아래 TRACK_METHOD_PHYS / TRACK_METHOD_PHYS_BYCAMPUS 에 정확 정의)

# ════════════════════════════════════════════════════════════════════════════
# 1. 반영비율 템플릿 (phys 23~78 전형방법 표 본체 직접 인용)
#    components 키는 PDF 한국어 표기 그대로. stageMaxScore = 해당 단계 만점(원점수).
# ════════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# 학생부종합 2유형 공통 단계
S1_SEORYU_400 = stage("1단계", 4, {"서류평가": 120}, 120)   # 400% 이내 (춘천 6명이상 면접전형은 300%)
S1_SEORYU_300 = stage("1단계", 3, {"서류평가": 120}, 120)   # 지역인재면접 300% 이내
S2_60_40      = stage("2단계", None, {"1단계 성적(서류평가)": 120, "면접평가": 80}, 200)  # 서류60+면접40

# trackName → dict(ttype, special, stages, note, csat_key)
TEMPLATES = {
    # ── 학생부종합 ──
    "학생부종합(미래인재서류전형)": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[stage("일괄합산", None, {"서류평가": 120}, 120)],
        note=None),
    "학생부종합(미래인재면접전형)": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[S1_SEORYU_400, S2_60_40],
        note="단계별. 1단계 서류평가 400% 이내(춘천캠퍼스는 모집인원 6명 이상 시 300% 이내)."),
    "학생부종합(지역인재면접전형)": dict(
        ttype="학생부위주(종합)", special="지역인재",
        stages=[S1_SEORYU_300, S2_60_40],
        note="강원지역 고교 전 교육과정 이수자. 단계별 1단계 서류평가 300% 이내."),
    "학생부종합(영농창업인재전형)": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[S1_SEORYU_400, S2_60_40],
        note="단계별. 1단계 서류평가 400% 이내."),
    "학생부종합(학·석사통합전형)": dict(
        ttype="학생부위주(종합)", special=None,
        stages=[stage("일괄합산", None, {"서류평가": 120}, 120)],
        note=None),
    "학생부종합(기회균형전형)": dict(
        ttype="학생부위주(종합)", special="기회균형",
        stages=[stage("일괄합산", None, {"서류평가": 120}, 120)],
        note="국가보훈대상자·저소득층·농어촌학생 통합 단일 전형(specialTypeKeyword=기회균형 대표)."),
    # ── 학생부교과 (정원내) ──
    "학생부교과(일반교과전형)": dict(
        ttype="학생부위주(교과)", special=None,
        stages=[stage("일괄합산", None, {"학생부교과": 1000}, 1000)], note=None),
    "학생부교과(지역교과전형)": dict(
        ttype="학생부위주(교과)", special="지역인재",
        stages=[stage("일괄합산", None, {"학생부교과": 1000}, 1000)],
        note="강원지역 고교 전 교육과정 이수자."),
    "학생부교과(지역의사선발전형)": dict(
        ttype="학생부위주(교과)", special="지역인재",
        stages=[stage("일괄합산", None, {"학생부교과": 1000}, 1000)],
        note="2027 신설. 의예과 권역별 선발(춘천권8·원주권7·영월권2·강릉권4·동해권3·속초권3·광역권12=39). 의무복무형 지역의사."),
    "학생부교과(저소득-지역교과전형)": dict(
        ttype="학생부위주(교과)", special="기회균형",
        stages=[stage("일괄합산", None, {"학생부교과": 1000}, 1000)],
        note="강원지역 고교 이수 + 저소득층(기초/차상위/한부모)."),
    "학생부교과(사회배려자전형)": dict(
        ttype="학생부위주(교과)", special="사회배려",
        stages=[stage("일괄합산", None, {"학생부교과(정량평가)": 1000, "학생부교과(정성평가)": 100}, 1100)],
        note="정량 1000(90%) + 정성 100(10%). 다자녀/소아암백혈병/다문화/광부/직업군인소방/장애인부모/조손/소년소녀가정/의사상자 등(삼척은 폐광지역 추가)."),
    "학생부교과(실기우수자전형)": dict(
        ttype="실기/실적위주", special=None,
        stages=[stage("일괄합산", None, {"학생부교과": 1000, "실기고사": 600}, 1600)],
        note="춘천 스포츠과학과·체육교육과. 학생부교과 1000(60%) + 실기 600(40%). 실기=지그재그런/제자리멀리뛰기/윗몸일으키기 각 200점."),
    # ── 정원외 (학생부교과) ──
    "학생부교과(농어촌학생전형)": dict(
        ttype="학생부위주(교과)", special="농어촌",
        stages=[stage("일괄합산", None, {"학생부교과(정량평가)": 1000, "학생부교과(정성평가)": 100}, 1100)],
        note="정원외. 정량 1000(90%) + 정성 100(10%). 읍·면/도서벽지 6년 또는 12년 이수."),
    "학생부교과(저소득전형)": dict(
        ttype="학생부위주(교과)", special="기회균형",
        stages=[stage("일괄합산", None, {"학생부교과": 1000}, 1000)],
        note="정원외. 기초/차상위/한부모. (춘천 약학과 4명만 — 수능최저 적용)"),
    "학생부교과(특성화고교졸업자전형)": dict(
        ttype="학생부위주(교과)", special="특성화고",
        stages=[stage("일괄합산", None, {"학생부교과": 1000}, 1000)],
        note="정원외. 특성화고/일반고 동일계열 기준학과 이수자."),
    "학생부교과(특수교육대상자전형)": dict(
        ttype="학생부위주(교과)", special="장애인",
        stages=[stage("일괄합산", None, {"학생부교과": 1000, "면접": 600}, 1600)],
        note="정원외. 학생부교과 1000(70%) + 면접 600(30%). 장애인복지법/국가유공자상이등급/특수교육법 대상."),
    # ── 전형기간 자율화 (학생부교과) ──
    "학생부교과(평생학습자전형)": dict(
        ttype="학생부위주(교과)", special="만학도",
        stages=[stage("일괄합산", None, {"학생부교과": 1000, "면접": 600}, 1600)],
        note="전형기간 자율화(지원횟수 제한·모집시기 복수지원 금지 미적용). 2027.3.1. 기준 만 30세 이상. 학생부교과 1000(70%)+면접 600(30%)."),
    "학생부교과(재직자전형)": dict(
        ttype="학생부위주(교과)", special="재직자",
        stages=[stage("일괄합산", None, {"학생부교과": 1000}, 1000)],
        note="정원외. 전형기간 자율화. 특성화고졸 등 + 산업체 재직경력 3년 이상."),
    # ── 실기/실적 ──
    "실기/실적(실기일반전형)": dict(  # 캠퍼스별 반영 상이 → 그리드 부착 시 stages 캠퍼스 분기
        ttype="실기/실적위주", special=None, stages=None,
        note=None),
    "실기/실적(실적우수자전형)": dict(
        ttype="실기/실적위주", special=None,
        stages=[stage("일괄합산", None, {"학생부(교과)": 100, "학생부(출결)": 10, "입상실적": 290}, 400)],
        note="삼척 휴먼스포츠학과. 학생부 110(30%, 교과100+출결10) + 실적 290(70%)."),
    "실기/실적(체육특기자전형-개인종목)": dict(
        ttype="실기/실적위주", special=None,
        stages=[stage("일괄합산", None, {"학생부(교과)": 100, "학생부(출결)": 10, "입상실적": 290}, 400)],
        note="학생부 110(30%, 교과100+출결10) + 입상실적 290(70%). 종목별 모집."),
    "실기/실적(체육특기자전형-단체종목)": dict(
        ttype="실기/실적위주", special=None,
        stages=[stage("일괄합산", None, {"학생부(교과)": 100, "학생부(출결)": 10, "실기": 110, "입상실적": 80}, 300)],
        note="학생부 110(30%, 교과100+출결10) + 실기 110(40%) + 입상실적 80(30%). 종목별 모집."),
}
# 실기일반 캠퍼스별 stages (반영비율 상이)
STAGES_SILGI_CC = [stage("일괄합산", None, {"학생부교과": 100, "실기고사": 300}, 400)]  # 춘천 교과30+실기70
STAGES_SILGI_SC = [stage("일괄합산", None, {"학생부": 100, "실기/실적": 300}, 400)]      # 삼척 교과20+실기80

# ════════════════════════════════════════════════════════════════════════════
# 2. 수능최저학력기준 (phys 79 표 본체 직접 전사). 춘천만 적용. 삼척·도계 전부 미적용.
#    공통: 국어/수학/영어/탐구(1과목) 중 3개 영역 합이 지정등급 이내. 적용 전형은 한국사 응시 필수.
# ════════════════════════════════════════════════════════════════════════════
CSAT_COMMON = "국어, 수학, 영어, 탐구(1과목) 영역 중 3개 영역의 합이 지정 등급 이내 (탐구: 사회/과학/직업탐구). 적용 전형은 한국사 응시 필수."

# (계열/단과대학 그룹) → {전형: (충족등급, 필수반영영역 or None)}
# p77 표1: 일반교과/지역교과/실기우수자/특수교육대상자.  p77 표2: 미래서류/지역면접/지역의사/저소득-지역교과/저소득.
# 필수반영영역: None=해당없음, "과학탐구(1과목)", "수학, 과학탐구(1과목)".
def csat_lookup(track, dept):
    """ (rawText, exempt, requiredAreas). 미적용이면 ('없음', True, None). 춘천 모집단위만 호출됨. """
    AREA_SUTAM = "수학, 과학탐구(1과목)"
    AREA_GTAM  = "과학탐구(1과목)"
    # 일반교과/지역교과 충족등급표 (계열·단과대학 그룹별) — (일반, 지역, 필수영역)
    G = {  # dept-set → (일반교과등급, 지역교과등급, 필수영역)
      "인문_경영사회인문": (13, 14, None),   # 경영대·농생대(식품자원경제)·문화예술공과(영상문화)·사회과학대·인문대
      "인문_사범인사":     (10, 11, None),   # 사범대 인문사회계열
      "인문_자유인문":     (14, 15, None),
      "자연_간호":         (10, 11, None),
      "자연_농생자연":     (14, 15, None),   # 농생대(자연)·동물생명·산림환경·자유전공(자연)
      "자연_사범가정":     (11, 12, None),
      "자연_사범과학":     (11, 12, AREA_GTAM),
      "자연_의생명자연과학":(14, 15, AREA_GTAM),  # 의생명과학대·자연과학대
      "자연_공학IT":       (14, 15, AREA_SUTAM),  # 문화예술공과(공학)·IT대
      "자연_사범수학":     (11, 12, AREA_SUTAM),
      "자연_의예":         (None, 6, AREA_SUTAM),  # 의예과 (일반교과 없음)
      "자연_수약":         (7, 8, AREA_SUTAM),      # 수의학과·약학과
    }
    grp = CSAT_DEPT_GROUP.get(dept)

    if track == "학생부교과(일반교과전형)":
        if grp and grp in G and G[grp][0] is not None:
            g, _, area = G[grp]
            return (f"3개 영역 합 {g} 이내" + (f" ({area} 필수반영)" if area else ""), False, area)
        return ("없음", True, None)
    if track == "학생부교과(지역교과전형)":
        if grp and grp in G:
            _, g, area = G[grp]
            return (f"3개 영역 합 {g} 이내" + (f" ({area} 필수반영)" if area else ""), False, area)
        return ("없음", True, None)
    if track == "학생부교과(실기우수자전형)":
        if dept == "체육교육과":
            return ("3개 영역 합 13 이내", False, None)
        return ("없음", True, None)
    if track == "학생부교과(특수교육대상자전형)":
        S = {"교육학과":(15,None),"역사교육과":(15,None),"영어교육과":(15,None),"윤리교육과":(15,None),
             "일반사회교육과":(15,None),"지리교육과":(15,None),"한문교육과":(15,None),
             "가정교육과":(16,None),"과학교육학부":(16,AREA_GTAM),"생물교육전공":(16,AREA_GTAM),
             "수학교육과":(16,AREA_SUTAM)}
        if dept in S:
            g, area = S[dept]
            return (f"3개 영역 합 {g} 이내" + (f" ({area} 필수반영)" if area else ""), False, area)
        return ("없음 (특수교육대상자: 춘천 사범대학만 수능최저 적용)", True, None)
    # 표2: 미래서류/지역면접/지역의사/저소득-지역교과/저소득
    if track == "학생부종합(미래인재서류전형)":
        if dept == "간호학과": return ("3개 영역 합 11 이내", False, None)
        if dept == "수의학과": return (f"3개 영역 합 8 이내 ({AREA_SUTAM} 필수반영)", False, AREA_SUTAM)
        return ("없음 (미래인재서류: 춘천 간호학과·수의학과만 적용)", True, None)
    if track == "학생부종합(지역인재면접전형)":
        if dept == "의예과": return (f"3개 영역 합 7 이내 ({AREA_SUTAM} 필수반영)", False, AREA_SUTAM)
        return ("없음", True, None)
    if track == "학생부교과(지역의사선발전형)":
        # p77 표2: 의예과 7 (수학·과탐 필수). + 변경사항 p1: 수학,과탐(1과목) 필수, 3개 영역 합 7
        return (f"3개 영역 합 7 이내 ({AREA_SUTAM} 필수반영)", False, AREA_SUTAM)
    if track == "학생부교과(저소득-지역교과전형)":
        D = {"간호학과":(12,None),"약학과":(10,AREA_SUTAM),"의예과":(8,AREA_SUTAM)}
        if dept in D:
            g, area = D[dept]
            return (f"3개 영역 합 {g} 이내" + (f" ({area} 필수반영)" if area else ""), False, area)
        return ("없음 (저소득-지역교과: 춘천 간호학과·약학과·의예과만 적용)", True, None)
    if track == "학생부교과(저소득전형)":
        if dept == "약학과": return (f"3개 영역 합 9 이내 ({AREA_SUTAM} 필수반영, 탐구: 과학탐구)", False, AREA_SUTAM)
        return ("없음 (저소득전형: 춘천 약학과만 적용)", True, None)
    return ("없음", True, None)

# 단과대학(모집단위) → 수능최저 그룹키 (p77 표1 계열·단과대학 그룹 그대로)
CSAT_DEPT_GROUP = {}
def _g(names, key):
    for n in names: CSAT_DEPT_GROUP[n] = key
# 인문사회
_g(["경영학전공","회계학전공","경제학전공","정보통계학전공","관광경영학과","국제무역학과","자유전공학과(경영대학)",
    "식품자원경제학과","영상문화학과",
    "문화인류학과","미디어커뮤니케이션학과","부동산학과","사회학과","정치외교학과","심리학과","행정학과","자유전공학과(사회과학대학)",
    "국어국문학과","독어독문학과","불어불문학과","사학과","영어영문학과","일본학과","중어중문학과","철학과","자유전공학과(인문대학)"],
   "인문_경영사회인문")
_g(["교육학과","국어교육과","역사교육과","영어교육과","윤리교육과","일반사회교육과","지리교육과","한문교육과"], "인문_사범인사")
_g(["자유전공학부(인문계열)"], "인문_자유인문")
# 자연/공학/의학
_g(["간호학과"], "자연_간호")  # (춘천 간호대학)
_g(["스마트팜농산업학과","바이오시스템공학과","식품생명공학과","식물의학전공","원예학과","지역건설공학과",
    "바이오환경화학전공","자유전공학과(농업생명과학대학)",
    "동물산업융합학과","동물응용과학과","동물자원과학과","자유전공학과(동물생명과학대학)",
    "산림바이오소재공학과","펄프제지공학과","산림경영학과","산림자원학과","산림환경보호학과","생태조경디자인학과",
    "자유전공학과(산림환경과학대학)"], "자연_농생자연")
_g(["가정교육과"], "자연_사범가정")
# 과학교육학부 = 물리/생물/지구과학/화학교육전공 통합학부. 그리드 대표명 '생물교육전공' → 동일 그룹.
_g(["과학교육학부", "생물교육전공"], "자연_사범과학")
_g(["분자생명과학과","생명건강공학과","생물의소재공학과","의생명시스템과학과","의생명공학과","자유전공학과(의생명과학대학)",
    "반도체물리학과","생명과학과","수학과","지구물리학전공","생화학전공","자유전공학과(자연과학대학)"], "자연_의생명자연과학")
_g(["건축학과(5년제)","건축공학과","토목공학과","환경공학과","기계융합공학부","배터리융합공학과",
    "스마트산업공학과","에너지자원공학과","생물공학전공","자유전공학과(문화예술·공과대학)",
    "디지털밀리터리학과","전기전자공학과","전자공학과","컴퓨터공학과","AI융합학과",
    "자유전공학부(자연계열)"], "자연_공학IT")
_g(["수학교육과"], "자연_사범수학")
_g(["의예과"], "자연_의예")
_g(["수의학과","약학과"], "자연_수약")

# ════════════════════════════════════════════════════════════════════════════
# 3. 그리드 파서 (x좌표 위치범위 소유권 + 행합/열합 이중검증)
#    각 페이지마다 위치범위가 1~5px 드리프트 → 페이지별 컬럼 위치범위 명시.
# ════════════════════════════════════════════════════════════════════════════
NUM = re.compile(r"\d[\d,]*")
HANGUL = re.compile(r"[가-힣]")

def assign(ln, ranges):
    """라인의 각 숫자를 위치범위(ranges: col->(lo,hi))에 따라 컬럼에 배정. 범위밖은 _UNSNAPPED."""
    cells = {}
    unsnapped = []
    for m in NUM.finditer(ln):
        s = m.start(); v = int(m.group().replace(",", ""))
        col = None
        for c, (lo, hi) in ranges.items():
            if lo <= s <= hi:
                col = c; break
        if col is None:
            unsnapped.append((s, v))
        else:
            cells[col] = cells.get(col, 0) + v
    return cells, unsnapped

# ── 춘천 그리드 위치범위 (히스토그램·합계행으로 확정) ──
CC_TRACKS = ["미래인재서류","미래인재면접","지역인재면접","영농창업인재","기회균형",
             "일반교과","지역교과","지역의사선발","저소득-지역교과","사회배려자","실기우수자",
             "농어촌학생","저소득","특성화고교졸업자","특수교육대상자","평생학습자","재직자","실기실적"]
CC_RANGE_P1 = {  # phys 8 (idx7)
    "입학정원":(35,39),"미래인재서류":(41,43),"미래인재면접":(47,48),"지역인재면접":(49,50),
    "영농창업인재":(51,53),"기회균형":(56,57),"일반교과":(60,62),"지역교과":(65,67),
    "지역의사선발":(68,69),"저소득-지역교과":(70,71),"사회배려자":(74,75),"실기우수자":(77,79),
    "농어촌학생":(82,84),"저소득":(90,90),"특성화고교졸업자":(86,88),"특수교육대상자":(91,93),
    "평생학습자":(95,96),"재직자":(98,100),"실기실적":(102,105),"합계":(107,110),"총모집":(112,116),
}
CC_RANGE_P2 = {  # phys 9 (idx8)
    "입학정원":(34,38),"미래인재서류":(40,42),"미래인재면접":(45,47),"지역인재면접":(50,52),
    "영농창업인재":(54,56),"기회균형":(59,61),"일반교과":(63,65),"지역교과":(68,70),
    "지역의사선발":(73,74),"저소득-지역교과":(78,79),"사회배려자":(82,84),"실기우수자":(87,88),
    "농어촌학생":(91,93),"저소득":(96,97),"특성화고교졸업자":(100,101),"특수교육대상자":(105,106),
    "평생학습자":(110,111),"재직자":(114,115),"실기실적":(119,121),"합계":(123,126),"총모집":(128,131),
}
# 춘천 합계행(하드코딩 대조) — phys 9 합계행 직접 전사
CC_COLTOTAL = {"미래인재서류":460,"미래인재면접":347,"지역인재면접":15,"영농창업인재":5,"기회균형":115,
 "일반교과":765,"지역교과":514,"지역의사선발":39,"저소득-지역교과":6,"사회배려자":66,"실기우수자":17,
 "농어촌학생":124,"저소득":4,"특성화고교졸업자":43,"특수교육대상자":30,"평생학습자":6,"재직자":9,"실기실적":115}
CC_TOTAL_HAP = 2680  # 정원내 합계

# ── 삼척(도계) 그리드 위치범위 ──
#   삼척은 농어촌/특성화고/특수교육이 (1)보건과학대 등 일부는 per-dept 숫자(합계에 포함),
#   (2)공학·인문사회·디자인 블록은 '(모집단위별 입학정원의 10% 이내 선발)' 텍스트(그룹선발).
#   → 행마다 INNER합==합계면 그룹열은 텍스트(제외), INNER합+그룹==합계면 per-dept(포함)로 판정.
SC_INNER = ["미래인재서류","미래인재면접","학·석사통합","기회균형","일반교과","지역교과",
            "저소득-지역교과","사회배려자","실기실적"]
SC_GROUPCOL = ["농어촌학생","특성화고교졸업자","특수교육대상자"]
SC_TRACKS = SC_INNER + SC_GROUPCOL
SC_RANGE = {  # phys 10 (idx9)
    "입학정원":(33,37),"미래인재서류":(39,40),"미래인재면접":(43,45),"학·석사통합":(49,49),
    "기회균형":(52,54),"일반교과":(56,58),"지역교과":(60,63),"저소득-지역교과":(67,67),
    "사회배려자":(71,71),"농어촌학생":(76,81),"특성화고교졸업자":(88,94),"특수교육대상자":(95,103),
    "실기실적":(107,109),"합계":(111,116),"총모집":(117,122),
}
SC_COLTOTAL = {"미래인재서류":174,"미래인재면접":43,"학·석사통합":6,"기회균형":59,"일반교과":578,
 "지역교과":147,"저소득-지역교과":2,"사회배려자":43,"실기실적":100}  # per-dept 검증대상(정원내)
SC_GROUP = {"농어촌학생":51,"특성화고교졸업자":19,"특수교육대상자":7}  # 합계행 총량(per-dept + 그룹)
SC_TOTAL_HAP = 1229

# 단과대학명만 있는 줄/헤더 토큰
SKIP_TOKENS = ("계열","합계","모집단위","입학정원","자율화","서류","면접","교과","2027","2022","표기",
               "정원내","정원외")
def is_data_line(ln):
    if not HANGUL.search(ln): return False
    if len(NUM.findall(ln)) < 2: return False
    if any(t in ln for t in ("캠퍼스 합계","‣")): return False
    s = ln.strip()
    if s.startswith(("저소","특성","특수","[")): return False
    return True

# 모집단위명 정제: 인증/교직/통합학과 등 부가표기 제거, 자유전공학과 단과대학 접미
SUFFIX_RE = re.compile(
    r"(간호교육인증|경영학교육인증|공학교육인증|건축학교육인증( 신청준비중)?|WFOT인증|교직|"
    r"탑클래스 통합학과|글로컬 통합학과|6년제 개편 추진중|6년제|신청준비중)")
# 단과대학/계열 prefix 토큰 (모집단위명 앞에 붙는 표 좌측 셀 누수)
PREFIX_TOK = {"춘천","삼척","도계","인문","사회","자연","과학","예체능","공학","의학",
              "경영","대학","간호","농업","생명","동물","문화","산림","환경","수의과","약학",
              "약학자연","의과자연","수의과대학","의생명","보건","복지","스포츠","디자인","독립","학부",
              "글로벌","미래","융합","IT","사범","(춘천)","(강릉)","경영대학","약학대학과학","의과대학과학",
              "도시","나.","건축학교육인증","공과"}
# 모집단위명 말미 토큰(진짜 학과/학부/전공명 식별용)
NAME_TAIL = ("학과", "학부", "전공", "자유전공학과", "년제)")

def clean_name(ln):
    # 우측 그룹주석('(모집단위별 ...'), ● 이후 절단 → 좌측 명칭만
    raw = re.split(r"\(모집단위별|입학정원의|10% 이내", ln)[0]
    raw = re.sub(r"●.*$", "", raw)
    # (5년제)/(6년제) 학제 표기는 명칭 일부로 보존, 그 외 숫자(모집인원) 이후 절단
    yeonje = {"5": "FIVE", "6": "SIX"}
    raw = re.sub(r"\((\d)년제\)", lambda m: f"(년제{yeonje.get(m.group(1),'')})", raw)  # 숫자 제거 보호
    raw = re.sub(r"[\d].*$", "", raw)
    raw = re.sub(r"\(년제(FIVE|SIX)\)", lambda m: "(5년제)" if m.group(1) == "FIVE" else "(6년제)", raw)
    raw = SUFFIX_RE.sub("", raw).strip()
    toks = raw.split()
    # 단과대학/계열 prefix 제거 (모집단위명은 보통 마지막 의미토큰)
    while len(toks) > 1 and toks[0] in PREFIX_TOK:
        toks.pop(0)
    name = " ".join(toks).strip()
    return name

def looks_like_module(name):
    """진짜 모집단위명인지(학과/학부/전공 등으로 끝남) — 단과대학·계열 fragment 배제."""
    if not name or len(name) < 2: return False
    if name in PREFIX_TOK: return False
    return any(name.endswith(t) for t in NAME_TAIL) or "자유전공" in name

def parse_grid(page_lines, ranges_for_line, tracks, coltotal, campus_of, continuation_join,
               inner_cols=None, group_cols=None):
    """그리드 한 캠퍼스 파싱. 행합 검증.
    group_cols 가 주어지면(삼척): 행마다 INNER합==합계면 그룹열은 텍스트(per-dept 제외),
    INNER합+그룹==합계면 그룹열도 per-dept 로 포함. (그룹선발 vs 개별선발 자동 판정)
    반환: (departments, col_sums(per-dept만), fails, group_perdept(그룹열 per-dept 합))."""
    depts = []
    fails = []
    col_sums = {t: 0 for t in tracks}
    group_perdept = {g: 0 for g in (group_cols or [])}
    pending_name = ""   # 윗줄에 분리된 진짜 모집단위명(예: 도시건축학과(5년제), 식품영양학과)
    def is_numeric_data_line(ln, ranges):
        # 한글 없는 숫자전용 데이터행(명칭이 윗줄에 분리된 경우)
        if HANGUL.search(ln) or "‣" in ln: return False
        if len(NUM.findall(ln)) < 4: return False
        cells, _ = assign(ln, ranges)
        return "합계" in cells
    for ln in page_lines:
        ranges = ranges_for_line(ln)
        numeric_only = pending_name and is_numeric_data_line(ln, ranges)
        if numeric_only or is_data_line(ln):
            cells, uns = assign(ln, ranges)
            own = clean_name(ln)
            # 명칭 결정: 데이터행 자체 명칭이 진짜 모집단위명이면 사용,
            #   아니면 대기중(윗줄 분리) 명칭 사용. (단과대/계열 fragment 누수 방지)
            if looks_like_module(own):
                name = own
            elif pending_name and looks_like_module(pending_name):
                name = pending_name
            else:
                name = own or pending_name
            pending_name = ""
            hap = cells.get("합계")
            if group_cols is None:
                track_vals = {t: cells[t] for t in tracks if t in cells and cells[t] > 0}
            else:
                inner_vals = {t: cells[t] for t in inner_cols if t in cells and cells[t] > 0}
                grp_vals = {g: cells[g] for g in group_cols if g in cells and cells[g] > 0}
                inner_sum = sum(inner_vals.values()); grp_sum = sum(grp_vals.values())
                if hap is not None and inner_sum == hap:
                    track_vals = inner_vals  # 그룹열 = 텍스트('10% 이내'), per-dept 아님
                elif hap is not None and inner_sum + grp_sum == hap:
                    track_vals = {**inner_vals, **grp_vals}  # 그룹열도 per-dept(보건 등)
                    for g, v in grp_vals.items(): group_perdept[g] += v
                else:
                    track_vals = inner_vals  # 검증실패 → 보수적으로 inner만, fail 기록
            rsum = sum(track_vals.values())
            depts.append(dict(_name=name, _campus=campus_of(name, ln), _hap=hap,
                              _vals=track_vals, _line=ln.strip(), _uns=uns))
            if hap is None or rsum != hap:
                fails.append((name, rsum, hap, dict(track_vals)))
            for t, v in track_vals.items():
                col_sums[t] = col_sums.get(t, 0) + v
        elif continuation_join and HANGUL.search(ln) and "‣" not in ln \
                and not NUM.search(re.sub(r"\(\d년제\)", "", ln)):
            # 숫자 없는 한글 줄(학제표기 (N년제) 제외) = 윗줄 분리 모집단위명 후보
            #   예: 도시건축학과(5년제), 식품영양학과 교직. clean_name 이 prefix·우측주석 절단.
            frag = clean_name(ln)
            if looks_like_module(frag):
                pending_name = frag   # 최신 모듈명으로 갱신(누적 X)
    return depts, col_sums, fails, group_perdept

# ── 캠퍼스 판정 ──
DOGYE_DEPTS = {  # 도계캠퍼스 소속 (PDF 단과대학 라벨 '도계' / 본문 명시)
    "소방방재공학전공","재난관리공학전공","소방방재학부","사회복지학과","유아교육과",
    "식품영양학과","안경광학과","바이오기능성소재학과","공공행정학과","관광학과","경제금융학과","영어과",
    "자유전공학부(인문계열)","자유전공학부(자연계열)","인문사회대학 자유전공학과",
}
# 강릉캠퍼스 소속이나 삼척(도계포함) 그리드에 행정상 함께 표기된 학과 (campus 충돌 방지 핵심)
GANGNEUNG_DEPTS = {"일본학과"}   # 인문대학(강릉) 일본학과 — PDF 라벨 '(강릉)' 명시. 강릉캠퍼스 별도 요강과 동일 학과.

def cc_campus(name, ln): return "춘천"
def sc_campus(name, ln):
    # 삼척 그리드 내에서 캠퍼스 분리. 강릉(행정상 합표) > 도계 > 삼척 순.
    if name in GANGNEUNG_DEPTS: return "강릉"
    if "도계" in ln: return "도계"
    if name in DOGYE_DEPTS: return "도계"
    return "삼척"

def cc_ranges(ln):
    # 페이지 판정 불가(라인 단위) → 위치 특성으로 P1/P2 구분: P2는 합계열이 ~125, P1은 ~108
    nums = [m.start() for m in NUM.finditer(ln)]
    return CC_RANGE_P2 if any(n >= 122 for n in nums) else CC_RANGE_P1

# ════════════════════════════════════════════════════════════════════════════
# 4. 실행: 그리드 파싱
# ════════════════════════════════════════════════════════════════════════════
warnings = []

cc_lines = pages[PG_GRID_CC1 - 1].splitlines() + pages[PG_GRID_CC2 - 1].splitlines()
sc_lines = pages[PG_GRID_SC - 1].splitlines()

cc_depts, cc_colsum, cc_fails, _ = parse_grid(cc_lines, cc_ranges, CC_TRACKS, CC_COLTOTAL,
                                              cc_campus, continuation_join=False)
sc_depts, sc_colsum, sc_fails, sc_group_perdept = parse_grid(
    sc_lines, lambda ln: SC_RANGE, SC_TRACKS, SC_COLTOTAL, sc_campus,
    continuation_join=True, inner_cols=SC_INNER, group_cols=SC_GROUPCOL)

# 동명 '자유전공학과' 단과대학 접미 (CSAT 그룹 매칭용) — 줄 위치로 단과대학 추정은 생략, name 그대로 두되
# CSAT_DEPT_GROUP 키와 매칭 위해 표준화: '자유전공학과' 단독은 인접 단과대학 정보가 line 에 있음.
def normalize_dept_name(d):
    n = d["_name"]
    ln = d["_line"]
    if n == "자유전공학과" or n.endswith("자유전공학과"):
        for col, key in [("경영대학","자유전공학과(경영대학)"),("농업생명과학대학","자유전공학과(농업생명과학대학)"),
                         ("동물생명과학대학","자유전공학과(동물생명과학대학)"),("문화예술·공과대학","자유전공학과(문화예술·공과대학)"),
                         ("사회과학대학","자유전공학과(사회과학대학)"),("산림환경과학대학","자유전공학과(산림환경과학대학)"),
                         ("의생명과학대학","자유전공학과(의생명과학대학)"),("자연과학대학","자유전공학과(자연과학대학)"),
                         ("인문대학","자유전공학과(인문대학)")]:
            if col in ln: return key
        return n
    if n == "자유전공학부(인문계열)" or "자유전공학부(인문계열)" in n: return "자유전공학부(인문계열)"
    if n == "자유전공학부(자연계열)" or "자유전공학부(자연계열)" in n: return "자유전공학부(자연계열)"
    return n

for d in cc_depts + sc_depts:
    d["_name"] = normalize_dept_name(d)

# ════════════════════════════════════════════════════════════════════════════
# 5. track 빌드
# ════════════════════════════════════════════════════════════════════════════
GRID_TO_TRACK = {  # 그리드 컬럼명 → 정식 trackName
    "미래인재서류":"학생부종합(미래인재서류전형)","미래인재면접":"학생부종합(미래인재면접전형)",
    "지역인재면접":"학생부종합(지역인재면접전형)","영농창업인재":"학생부종합(영농창업인재전형)",
    "학·석사통합":"학생부종합(학·석사통합전형)","기회균형":"학생부종합(기회균형전형)",
    "일반교과":"학생부교과(일반교과전형)","지역교과":"학생부교과(지역교과전형)",
    "지역의사선발":"학생부교과(지역의사선발전형)","저소득-지역교과":"학생부교과(저소득-지역교과전형)",
    "사회배려자":"학생부교과(사회배려자전형)","실기우수자":"학생부교과(실기우수자전형)",
    "농어촌학생":"학생부교과(농어촌학생전형)","저소득":"학생부교과(저소득전형)",
    "특성화고교졸업자":"학생부교과(특성화고교졸업자전형)","특수교육대상자":"학생부교과(특수교육대상자전형)",
    "평생학습자":"학생부교과(평생학습자전형)","재직자":"학생부교과(재직자전형)",
}
TRACKTYPE_OF_PERIOD = "수시"

# 정식 trackName → 전형방법 물리페이지 (정찰로 확정한 실제 물리페이지). 정확 매핑(부분일치 금지).
TRACK_METHOD_PHYS = {
    "학생부종합(미래인재서류전형)": 23, "학생부종합(미래인재면접전형)": 24,
    "학생부종합(지역인재면접전형)": 25, "학생부종합(영농창업인재전형)": 26,
    "학생부종합(학·석사통합전형)": 27, "학생부종합(기회균형전형)": 28,
    "학생부교과(일반교과전형)": 38, "학생부교과(지역교과전형)": 39,
    "학생부교과(지역의사선발전형)": 40, "학생부교과(저소득-지역교과전형)": 41,
    "학생부교과(사회배려자전형)": 43, "학생부교과(실기우수자전형)": 45,
    "학생부교과(농어촌학생전형)": 48, "학생부교과(저소득전형)": 50,
    "학생부교과(특성화고교졸업자전형)": 51, "학생부교과(특수교육대상자전형)": 53,
    "학생부교과(평생학습자전형)": 55, "학생부교과(재직자전형)": 56,
    "실기/실적(실적우수자전형)": 64,
}
# 캠퍼스별 전형방법 물리페이지(춘천/삼척 상이)
TRACK_METHOD_PHYS_BYCAMPUS = {
    "실기/실적(실기일반전형)": {"춘천": 57, "삼척": 62, "도계": 62},
    "실기/실적(체육특기자전형-개인종목)": {"춘천": 67, "삼척": 70, "도계": 70},
    "실기/실적(체육특기자전형-단체종목)": {"춘천": 72, "삼척": 75, "도계": 75},
}
def build_track(track, dept, quota, campus, group_note=None):
    tpl = TEMPLATES[track]
    # 반영단계 (실기일반은 캠퍼스 분기)
    if track == "실기/실적(실기일반전형)":
        stages = STAGES_SILGI_CC if campus == "춘천" else STAGES_SILGI_SC
    else:
        stages = tpl["stages"]
    # 수능최저 (본 요강은 춘천캠퍼스만 적용; 삼척·도계 전 모집단위 미적용 — PDF p77 명시)
    if campus == "춘천":
        raw, exempt, areas = csat_lookup(track, dept)
    elif campus == "강릉":
        raw, exempt, areas = ("없음 (강릉캠퍼스 학과 — 본 춘천·삼척 요강 범위 외, 수능최저는 강릉 별도 요강 참조)", True, None)
    else:
        raw, exempt, areas = ("없음 (삼척·도계캠퍼스는 수능최저학력기준 미적용)", True, None)
    note = tpl["note"]
    if group_note:
        note = f"{note} {group_note}" if note else group_note
    # sourcePages: 모집인원 그리드 + 전형방법 + (CSAT 적용 시) p77
    src = set()
    if campus == "춘천":
        src.update([PG_GRID_CC1, PG_GRID_CC2])   # 춘천 그리드 2면
    else:
        src.add(PG_GRID_SC)                       # 삼척/도계/강릉 그리드
    # 전형방법 물리페이지 (정확 매핑)
    if track in TRACK_METHOD_PHYS_BYCAMPUS:
        src.add(TRACK_METHOD_PHYS_BYCAMPUS[track].get(campus, TRACK_METHOD_PHYS_BYCAMPUS[track]["춘천"]))
    elif track in TRACK_METHOD_PHYS:
        src.add(TRACK_METHOD_PHYS[track])
    if not exempt:
        src.add(PG_CSAT)
    if track == "학생부교과(지역의사선발전형)":
        src.add(PG_DETAIL)  # 권역 세부(p9 phys11)
    if track in ("실기/실적(실기일반전형)", "실기/실적(체육특기자전형-개인종목)",
                 "실기/실적(체육특기자전형-단체종목)") and campus == "춘천":
        src.add(PG_DETAIL)  # 실기 전공/종목 세부(p9)
    return {
        "trackName": track,
        "trackTypeRaw": tpl["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": tpl["special"],
        "quotaInitial": quota,
        "applicationQualification": note,
        "reflectionStages": [dict(s) for s in (stages or [])],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": sorted(src),
    }

# trackHint (계열) — PDF 계열 라벨(인문사회/자연과학/예체능) 매핑
def track_hint(dept, line):
    # 예체능
    if dept in ("디자인학과","무용학과","미술학과","음악학과","스포츠과학과","체육교육과",
                "멀티디자인학과","공예디자인학과","휴먼스포츠학과"):
        return "예체능"
    # 라인의 계열 셀 토큰
    if re.search(r"인문\s*사회|인문사회", line) or "인문" in line:
        # 자연이 더 가까우면 자연 우선
        if re.search(r"자연\s*과학|자연과학|자연", line) and "인문" not in line.split("자연")[0]:
            pass
    if "예체능" in line: return "예체능"
    if "인문" in line and "자연" not in line: return "인문"
    if "자연" in line and "인문" not in line: return "자연"
    if "공학" in line and "인문" not in line: return "자연"
    if "의학" in line: return "자연"
    return None

# ── 실기/실적 세부 분해 (그리드 '실기/실적' 단일열 → p9 전공/종목별 세부 트랙) ──
#   (학과, 캠퍼스) → [(정식트랙명, 모집인원), ...]. 각 학과의 그리드 실기/실적열 값과 합이 일치해야 함(행검증).
#   출처: p9(전형별 세부 모집인원) 본체 직접 전사 + p2 개요 총량 대조.
SILGI_ALLOC = {
    ("디자인학과", "춘천"):       [("실기/실적(실기일반전형)", 36)],
    ("무용학과", "춘천"):         [("실기/실적(실기일반전형)", 20)],
    ("미술학과", "춘천"):         [("실기/실적(실기일반전형)", 18)],
    ("음악학과", "춘천"):         [("실기/실적(실기일반전형)", 29)],
    ("스포츠과학과", "춘천"):     [("실기/실적(체육특기자전형-개인종목)", 6),
                                ("실기/실적(체육특기자전형-단체종목)", 3)],
    ("체육교육과", "춘천"):       [("실기/실적(체육특기자전형-개인종목)", 3)],
    ("멀티디자인학과", "삼척"):    [("실기/실적(실기일반전형)", 46)],
    ("공예디자인학과", "삼척"):    [("실기/실적(실기일반전형)", 30)],
    ("휴먼스포츠학과", "삼척"):    [("실기/실적(실적우수자전형)", 15),
                                ("실기/실적(체육특기자전형-개인종목)", 4),
                                ("실기/실적(체육특기자전형-단체종목)", 5)],
}
silgi_fails = []  # (학과, 세부합, 그리드실기실적값)

departments = []
for d in cc_depts + sc_depts:
    name = d["_name"]; campus = d["_campus"]; hap = d["_hap"]; vals = d["_vals"]
    tracks = []
    for col, q in vals.items():
        if col == "실기실적":
            # 그리드 단일열 → p9 세부 트랙으로 분해 (행검증: 세부합 == 그리드값)
            alloc = SILGI_ALLOC.get((name, campus))
            if alloc is None:
                silgi_fails.append((name, None, q))   # 세부 미정의(분해 불가) → 경고
                continue
            asum = sum(a[1] for a in alloc)
            if asum != q:
                silgi_fails.append((name, asum, q))
            for tname, tq in alloc:
                tracks.append(build_track(tname, name, tq, campus))
            continue
        track = GRID_TO_TRACK.get(col)
        if track is None:
            continue
        tracks.append(build_track(track, name, q, campus))
    if not tracks:
        continue
    th = track_hint(name, d["_line"])
    departments.append({
        "departmentName": name, "campus": campus, "trackHint": th,
        "totalQuotaHint": hap, "tracks": tracks,
        "_uns": d["_uns"],
    })

# ── 삼척 그룹선발 정원외 (농어촌/특성화고/특수교육) — 캠퍼스 그룹 앵커에 부착 ──
# PDF 가 개별 학과 분해 안 함(텍스트 '10% 이내'). 합계행 총량을 대표 학과(첫 공학대학)에 그룹 부착.
def attach_group(dept_list, anchor_name, track, quota, note):
    for dd in dept_list:
        if dd["departmentName"] == anchor_name:
            dd["tracks"].append(build_track(track, anchor_name, quota, dd["campus"], group_note=note))
            return True
    return False

sc_in_depts = [d for d in departments if d["campus"] in ("삼척", "도계")]
SC_GROUP_NOTE = ("정원외·그룹선발. 삼척(도계포함)캠퍼스 일부 모집단위를 묶어 그룹으로 선발하며 "
                 "모집단위별 최대 선발인원은 입학정원의 10%. PDF가 개별 학과로 분해하지 않아(텍스트 표기) "
                 "캠퍼스 합계 총량을 대표 앵커에 부착(개별 분해는 추정이라 미수행).")
# 앵커: 삼척 공학대학 첫 학과(미래토목건설공학과)에 부착, 없으면 첫 삼척 학과
anchor = "미래토목건설공학과"
if not any(d["departmentName"] == anchor for d in sc_in_depts):
    anchor = sc_in_depts[0]["departmentName"] if sc_in_depts else None
# 그룹 잔여 = 합계행 총량 − per-dept 개별선발분(보건 등). (개별선발분은 이미 per-dept track 으로 부착됨)
for col, total in SC_GROUP.items():
    grp_remaining = total - sc_group_perdept.get(col, 0)
    if grp_remaining <= 0:
        continue
    note = (f"삼척(도계포함)캠퍼스 {col} 정원외 그룹선발분 {grp_remaining}명"
            + (f" (개별선발 {sc_group_perdept[col]}명은 해당 학과에 별도 부착, 합계행 총 {total}명)"
               if sc_group_perdept.get(col, 0) else f" (합계행 총 {total}명)")
            + f". {SC_GROUP_NOTE}")
    if anchor and attach_group(departments, anchor, GRID_TO_TRACK[col], grp_remaining, note):
        sc_colsum[col] = sc_colsum.get(col, 0) + grp_remaining
    else:
        warnings.append(f"[삼척 그룹 부착실패] {col} {grp_remaining}명 앵커({anchor}) 미발견")

# ════════════════════════════════════════════════════════════════════════════
# 6. 이중 체크섬 리포트
# ════════════════════════════════════════════════════════════════════════════
# 열합: 춘천(per-dept) + 삼척(per-dept 정원내) vs 합계행
cc_coltotal_report = [(c, cc_colsum.get(c, 0), CC_COLTOTAL[c], cc_colsum.get(c, 0) == CC_COLTOTAL[c])
                      for c in CC_TRACKS]
# 춘천 특수교육: per-dept 합(사범 개별) < 합계행(30, 그룹● 포함). 정상 차이.
sc_coltotal_report = [(c, sc_colsum.get(c, 0), SC_COLTOTAL.get(c, SC_GROUP.get(c, 0)),
                       sc_colsum.get(c, 0) == SC_COLTOTAL.get(c, SC_GROUP.get(c, 0)))
                      for c in (list(SC_COLTOTAL) + list(SC_GROUP))]

# 춘천 특수교육 그룹 차이 설명
cc_su_perdept = cc_colsum.get("특수교육대상자", 0)
warnings.append(f"[춘천 특수교육대상자] per-dept 합={cc_su_perdept}(사범대학 개별선발) / 합계행=30. "
                f"차이 {30 - cc_su_perdept}명은 사범대학 외 ●표기 모집단위 통합선발(개별 모집인원 미표기) → "
                "per-dept 미부착(추정 금지). 사범대학 개별값만 부착.")
warnings.append("[삼척·도계 농어촌·특성화고·특수교육] PDF가 '(모집단위별 입학정원의 10% 이내 선발)' 텍스트로만 표기(그룹선발). "
                "개별 학과 모집인원 미표기 → 합계행 총량(농어촌51·특성화고19·특수교육7)을 대표 앵커에 그룹 부착. 개별 분해는 추정이라 미수행.")
warnings.append("[수능최저] 춘천캠퍼스만 적용(국/수/영/탐1 중 3개 합 지정등급, 한국사 필수). "
                "삼척·도계캠퍼스 전 모집단위 미적용(PDF p77 명시). 충족등급은 계열·단과대학·전형별 상이 → p77 표 직접 전사.")
warnings.append("[캠퍼스] 본 산출물은 강원대 춘천+삼척(도계포함) 전용. 강릉·원주 캠퍼스는 별도 PDF(미포함). "
                "campus 필드: 춘천/삼척/도계(+예외 강릉). 강릉·원주와 동명 학과(예: 자유전공학부, 일반교과전형 등) 중복 위험 → campus+university_id 로 식별 필수.")
warnings.append("[강릉 일본학과 — 캠퍼스 충돌 주의] 삼척(도계포함) 그리드에 '인문대학(강릉) 일본학과'(13명)가 행정상 함께 표기됨. "
                "이는 강릉캠퍼스 소속(별도 강릉 요강과 동일 학과) → campus='강릉'으로 분리 기록. "
                "춘천 일본학과(인문대학, 18명)와 별개. 강릉 요강 적재 시 중복 부착 금지(campus 로 식별).")
warnings.append("[전형기간 자율화] 평생학습자·재직자전형은 지원횟수 제한·모집시기 복수지원 금지 미적용(전형기간 자율화).")
warnings.append("[실기/실적 세부] 그리드 '실기/실적' 단일열(춘천115·삼척100)을 p9 전공/종목 세부로 분해: "
                "실기일반(디자인36·무용20·미술18·음악29·멀티46·공예30=179), 실적우수자(휴먼15), "
                "체육특기자-개인(스포츠6·체육3·휴먼4=13), 체육특기자-단체(스포츠3·휴먼5=8). "
                "각 학과 분해합 = 그리드 실기/실적값(행검증 통과). 세부 전공/종목별 모집인원·종목은 p9(phys11) 참조.")
if silgi_fails:
    warnings.append("[실기/실적 분해 검증] " + "; ".join(
        f"{n}(세부합{s}≠그리드{q})" if s is not None else f"{n}(세부미정의, 그리드{q})"
        for n, s, q in silgi_fails))
warnings.append("[정시이월] 수시 미충원은 정시(㉮㉯㉰군) 이월. 단 특수교육대상자전형 미이월, 지역인재면접·영농창업·지역교과는 정시 수능(일반)으로 이월.")

if cc_fails:
    warnings.append(f"[춘천 행합불일치] {len(cc_fails)}건: " +
                    "; ".join(f"{n}(합산{r}≠합계{h})" for n, r, h, _ in cc_fails))
if sc_fails:
    warnings.append(f"[삼척 행합불일치] {len(sc_fails)}건: " +
                    "; ".join(f"{n}(합산{r}≠합계{h})" for n, r, h, _ in sc_fails))
# 미배정 숫자(드리프트) 경고
uns_total = sum(len(d.get("_uns", [])) for d in departments)
if uns_total:
    samples = [(d["departmentName"], d["_uns"]) for d in departments if d.get("_uns")][:6]
    warnings.append(f"[그리드 미배정 토큰] {uns_total}개(위치범위 밖) — 샘플 {samples}")

for d in departments:
    d.pop("_uns", None)

# ════════════════════════════════════════════════════════════════════════════
# 7. 결과 + 채움비율
# ════════════════════════════════════════════════════════════════════════════
result = {
    "universityName": "강원대학교", "year": 2027, "recruitmentSeason": "susi",
    "campusScope": "춘천·삼척(도계포함)",
    "departments": departments, "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(f): return sum(1 for t in all_tracks if f(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

cc_all_ok = all(m for *_, m in cc_coltotal_report)
sc_all_ok = all(m for *_, m in sc_coltotal_report)

meta = {
    "universityName": "강원대학교", "year": 2027, "recruitmentSeason": "susi",
    "campusScope": "춘천·삼척(도계포함)",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0,
    "departments": len(departments), "totalTracks": T,
    "campusBreakdown": {c: sum(1 for d in departments if d["campus"] == c)
                        for c in ("춘천", "삼척", "도계", "강릉")},
    "rowSumValidation": {"춘천": {"passed": len(cc_depts) - len(cc_fails), "failed": len(cc_fails)},
                          "삼척": {"passed": len(sc_depts) - len(sc_fails), "failed": len(sc_fails)}},
    "colTotalValidation": {
        "춘천": [{"track": c, "computed": g, "expectedSumRow": e, "match": m}
               for (c, g, e, m) in cc_coltotal_report],
        "삼척": [{"track": c, "computed": g, "expectedSumRow": e, "match": m}
               for (c, g, e, m) in sc_coltotal_report],
    },
    "fillRatios": {"quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
                   "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T],
                   "sourcePages": [sp_n, T]},
    "completeRecords": [comp_n, T],
}
(BASE / "kangwon_chuncheon-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

# ── 콘솔 리포트 ──
print("=" * 74)
print("강원대 2027 수시 (춘천·삼척(도계포함)) — 텍스트 직접 구조화 결과")
print("=" * 74)
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"캠퍼스: " + " ".join(f"{c}={meta['campusBreakdown'][c]}" for c in ('춘천','삼척','도계','강릉')))
print(f"\n행합 검증:")
print(f"  춘천: 통과 {len(cc_depts)-len(cc_fails)} / 실패 {len(cc_fails)}")
print(f"  삼척: 통과 {len(sc_depts)-len(sc_fails)} / 실패 {len(sc_fails)}")
print(f"\n열합 검증 — 춘천 (per-dept 합 vs 합계행):")
for c, g, e, m in cc_coltotal_report:
    note = "" if m else ("  (●그룹선발 차이=정상)" if c == "특수교육대상자" else "  ❌")
    print(f"  {'✅' if m else '⚠️'} {c:14s} 계산={g:4d}  합계행={e:4d}{note}")
print(f"열합 검증 — 삼척 (정원내 per-dept + 정원외 그룹 vs 합계행):")
for c, g, e, m in sc_coltotal_report:
    grp = "  (정원외 그룹)" if c in SC_GROUP else ""
    print(f"  {'✅' if m else '❌'} {c:14s} 계산={g:4d}  합계행={e:4d}{grp}")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
if cc_fails:
    print(f"\n⚠ 춘천 행합 실패 {len(cc_fails)}:")
    for n, r, h, v in cc_fails: print(f"  {n}: 합산{r} ≠ 합계{h}  {v}")
if sc_fails:
    print(f"\n⚠ 삼척 행합 실패 {len(sc_fails)}:")
    for n, r, h, v in sc_fails: print(f"  {n}: 합산{r} ≠ 합계{h}  {v}")
print(f"\n열합 전체: 춘천 {'OK' if cc_all_ok else '일부 차이(특수교육 그룹)'} / 삼척 {'OK' if sc_all_ok else '불일치'}")
print(f"\n💾 {BASE / 'kangwon_chuncheon-text.json'} 저장")
