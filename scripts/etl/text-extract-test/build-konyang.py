# -*- coding: utf-8 -*-
"""
건양대학교 2027 수시 모집요강 → konyang-text.json
source: univ/susi-2027/kcue_0000054.{pdf,txt}  (60p)
universityId: kcue_0000054 / slug: konyang
캠퍼스: 메디컬캠퍼스(대전) + 글로컬캠퍼스(논산)

GROUND TRUTH = "전형별 모집인원 총괄표"
  - 메디컬캠퍼스 Table1(의학과, txt p.286~295) + Table2(나머지 메디컬 학과, p.297~325)
  - 글로컬캠퍼스(txt p.336~393)
모든 학과별 세부 모집인원은 각 전형 세부 페이지(전형별 세부 사항)와 교차검증 완료.
요약표(p.125~187): 정원내 1,518 / 정원외 109 / 계 1,627 — 전 차원 정합.

전형(18개, 모두 수시):
  [학생부위주 교과]
    일반[교과] 982 · 지역[교과] 163 · 일반[최저](의학11) · 지역[최저](의학20) ·
    지역[면접](의학10) · 지역[기초](의학2+간호5=7) · 군사학전형 35
    [정원외] 농어촌학생전형[교과,면접] 62(의학 면접2 + 교과60) ·
            기초/차상위/한부모 16 · 특성화고교졸업자 7 · 특수교육대상자 4 · 채용조건형[계약] 20
  [학생부위주 종합] 학생부종합 241 · 지역의사 6
  [실기/실적위주] 특기자전형 13 · 일반[실기] 30

본 스키마는 (모집단위 × 전형) 단위. totalQuotaHint = 학과의 모든 전형 인원 합 == 총괄표 '총 모집인원' 컬럼.
정원외 특별전형은 총괄표 '총' 컬럼에 이미 포함되므로 totalQuotaHint 에 포함(rowSum이 '총' 컬럼과 정합).
"""
import json
from pathlib import Path
from collections import OrderedDict, defaultdict

UNIV = "건양대학교"; SLUG = "kcue_0000054"; YEAR = 2027
BASE = Path("scripts/etl/text-extract-test")
MED = "대전"   # 메디컬캠퍼스(대전)
GLO = "논산"   # 글로컬캠퍼스(논산)

# ─────────────────────────────────────────────────────────────────────────────
# 전형 메타: trackTypeRaw / reflectionStages / 수능최저 / specialType / sourcePages
# ─────────────────────────────────────────────────────────────────────────────
EDU = "학생부위주(교과)"; JONG = "학생부위주(종합)"; SILGI = "실기/실적위주"

ST_GYO100   = [{"stageLabel":"일괄합산","multiplier":None,"components":{"학생부(교과)":100},"stageMaxScore":1000}]
# 의학과 면접형(지역[면접]·지역[기초]): 1단계 교과100(배수) / 2단계 1단계80+면접20 (만점 1000)
def st_2dan_8020(mult):
    return [{"stageLabel":"1단계","multiplier":mult,"components":{"학생부(교과)":100},"stageMaxScore":800},
            {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":80,"면접":20},"stageMaxScore":1000}]
# 지역의사: 1단계 서류100(5배수) / 2단계 1단계70+면접30 (만점 1000)
ST_JIYEOK_UISA = [{"stageLabel":"1단계","multiplier":5,"components":{"서류":100},"stageMaxScore":700},
                  {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":70,"면접":30},"stageMaxScore":1000}]
# 학생부종합: 서류 100%
ST_JONGHAP = [{"stageLabel":"일괄합산","multiplier":None,"components":{"서류":100},"stageMaxScore":1000}]
# 군사학전형: 1단계 교과100(5배수) / 2단계 1단계70+체력검정10+면접20
ST_GUNSA = [{"stageLabel":"1단계","multiplier":5,"components":{"학생부(교과)":100},"stageMaxScore":700},
            {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":70,"체력검정":10,"면접":20},"stageMaxScore":1000}]
# 채용조건형[계약]: 교과80 + 면접20 (일괄)
ST_CHAEYONG = [{"stageLabel":"일괄합산","multiplier":None,"components":{"학생부(교과)":80,"면접":20},"stageMaxScore":1000}]
# 특기자전형: 교과20 + 특기실적80
ST_TEUKGI = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":20,"특기실적":80},"stageMaxScore":1000}]
# 일반[실기]: 교과20 + 전공실기80
ST_SILGI = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":20,"실기":80},"stageMaxScore":1000}]

# 수능최저 원문(의약 정확)
CSAT_ILBAN_CHOEJEO = "국어, 수학, 영어, 과탐(2과목 평균) 중 3과목 선택 합 4등급 (※ 과탐 2과목 평균 산출시 소수점 이하 절사)"
CSAT_JIYEOK_CHOEJEO = "국어, 수학, 영어, 과탐(2과목 평균) 중 3과목 선택 합 6등급 (※ 과탐 2과목 평균 산출시 소수점 이하 절사)"
CSAT_JIYEOK_GICHO_UI = "국어, 수학, 영어, 과탐(2과목 평균) 중 3과목 선택 합 7등급 (※ 과탐 2과목 평균 산출시 소수점 이하 절사)"
CSAT_JIYEOK_UISA = "국어, 수학, 영어, 과탐(2과목 평균) 중 3과목 선택 합 6등급 (※ 과탐 2과목 평균 산출시 소수점 이하 절사)"
CSAT_NONG_MYEONJEOP_UI = "국어, 수학, 영어, 과탐(2과목 평균) 중 3개 영역 합 6등급 (※ 과탐 2과목 평균 산출시 소수점 이하 절사)"
CSAT_AREAS_UI = "국어, 수학, 영어, 과탐(2과목 평균) 중 3과목 선택"

# 전형 정의 테이블 (trackName 기준)
#   key → dict(trackTypeRaw, reflectionStages, csatRaw, csatExempt, csatAreas, special, qual, sourcePages)
TRACKS = {
 "일반[교과]": dict(t=EDU, st=ST_GYO100, csat=None, exempt=True, areas=None, special=None,
        qual="고교졸업(예정)자 또는 동등이상의 학력소지자", pages=[15]),
 "지역[교과]": dict(t=EDU, st=ST_GYO100, csat=None, exempt=True, areas=None, special="지역인재",
        qual="충청권(대전·충남·충북·세종) 소재 고교에서 입학~졸업(예정)한 자 (각종/영재/고등기술학교·동등학력 불가)", pages=[16]),
 "일반[최저]": dict(t=EDU, st=ST_GYO100, csat=CSAT_ILBAN_CHOEJEO, exempt=False, areas=CSAT_AREAS_UI, special=None,
        qual="고교졸업(예정)자 또는 동등이상의 학력소지자 [의학과]", pages=[17]),
 "지역[최저]": dict(t=EDU, st=ST_GYO100, csat=CSAT_JIYEOK_CHOEJEO, exempt=False, areas=CSAT_AREAS_UI, special="지역인재",
        qual="충청권(대전·충남·충북·세종) 소재 고교에서 입학~졸업(예정)한 자 [의학과]", pages=[17]),
 "지역[면접]": dict(t=EDU, st=st_2dan_8020(3), csat=None, exempt=True, areas=None, special="지역인재",
        qual="충청권(대전·충남·충북·세종) 소재 고교에서 입학~졸업(예정)한 자 [의학과] (실질반영 1단계 61.5%+면접 38.5%)", pages=[18]),
 # 지역[기초]: 의학과(수능최저 7등급, 2단계 면접형) / 간호학과(수능최저 없음, 교과100) → 학과별로 분기
 "지역[기초]_의학": dict(t=EDU, st=st_2dan_8020(5), csat=CSAT_JIYEOK_GICHO_UI, exempt=False, areas=CSAT_AREAS_UI, special="지역+기회균형",
        qual="충청권 소재 고교 졸업(예정)자 중 기초생활수급(권)자/차상위계층/한부모가족 지원대상자 [의학과] (실질반영 1단계 61.5%+면접 38.5%)", pages=[19]),
 "지역[기초]_간호": dict(t=EDU, st=ST_GYO100, csat=None, exempt=True, areas=None, special="지역+기회균형",
        qual="충청권 소재 고교 졸업(예정)자 중 기초생활수급(권)자/차상위계층/한부모가족 지원대상자 [간호학과]", pages=[19]),
 "군사학전형": dict(t=EDU, st=ST_GUNSA, csat=None, exempt=True, areas=None, special="군사학",
        qual="국내 고교졸업(예정)자 등 군 인사법 제10조 결격사유 없고 임관일 기준 만20~29세(군복무 합산 가능). 친권자 동의·재정보증보험 가입 가능자", pages=[20]),
 "농어촌학생전형[면접]": dict(t=EDU, st=st_2dan_8020(5), csat=CSAT_NONG_MYEONJEOP_UI, exempt=False, areas=CSAT_AREAS_UI, special="농어촌+정원외",
        qual="농어촌(읍·면/도서·벽지) 중·고 6년 또는 초·중·고 12년 이수 및 본인(부모) 거주 [의학과] (실질반영 1단계 61.5%+면접 38.5%)", pages=[25,26]),
 "농어촌학생전형[교과]": dict(t=EDU, st=ST_GYO100, csat=None, exempt=True, areas=None, special="농어촌+정원외",
        qual="농어촌(읍·면/도서·벽지) 중·고 6년 또는 초·중·고 12년 이수 및 본인(부모) 거주 (의학과 제외)", pages=[25,26]),
 "기초생활수급자,차상위계층,한부모가족 지원대상자전형": dict(t=EDU, st=ST_GYO100, csat=None, exempt=True, areas=None, special="기회균형+정원외",
        qual="국내 고교졸업(예정)자 등 기초생활수급(권)자/차상위계층/한부모가족 지원대상자", pages=[27]),
 "특성화고교졸업자전형": dict(t=EDU, st=ST_GYO100, csat=None, exempt=True, areas=None, special="특성화고+정원외",
        qual="특성화고 졸업(예정)자(동일계 인정학과 이수 또는 전문교과 30단위 이상). 마이스터고·대안교육형 제외", pages=[28]),
 "특수교육대상자전형": dict(t=EDU, st=ST_GYO100, csat=None, exempt=True, areas=None, special="특수교육대상자+정원외",
        qual="장애인등록자/특수교육법 제15조 대상자/국가유공자 상이등급자", pages=[29]),
 "채용조건형[계약]": dict(t=EDU, st=ST_CHAEYONG, csat=None, exempt=True, areas=None, special="계약학과(채용조건형)+정원외",
        qual="고교졸업(예정)자 또는 동등이상 학력소지자 (기업별 모집·채용조건형 계약학과) (실질반영 교과 61.5%+면접 38.5%)", pages=[30]),
 "학생부종합": dict(t=JONG, st=ST_JONGHAP, csat=None, exempt=True, areas=None, special=None,
        qual="고교졸업(예정)자 또는 동등이상의 학력소지자", pages=[32]),
 "지역의사": dict(t=JONG, st=ST_JIYEOK_UISA, csat=CSAT_JIYEOK_UISA, exempt=False, areas=CSAT_AREAS_UI, special="지역의사",
        qual="복무형 지역의사 희망자로 충청권 중학교 및 각 권역 고교 이수·거주(의무복무 10년 조건) [의학과] (실질반영 1단계 82.71%+면접 17.29%)", pages=[33]),
 "특기자전형": dict(t=SILGI, st=ST_TEUKGI, csat=None, exempt=True, areas=None, special="특기자",
        qual="미용기능경기대회·미용관련 경진대회 입상자 또는 미용관련 국가/민간자격증 취득자 (분야: 미용/의상) [글로벌의료뷰티학전공] (실질반영 교과 10.6%+특기실적 89.4%)", pages=[34]),
 "일반[실기]": dict(t=SILGI, st=ST_SILGI, csat=None, exempt=True, areas=None, special="실기",
        qual="고교졸업(예정)자 또는 동등이상의 학력소지자 [재활퍼스널트레이닝학과] (실질반영 교과 6.25%+전공실기 93.75%)", pages=[35]),
}

# ─────────────────────────────────────────────────────────────────────────────
# 학과별 (전형 → 인원) — 총괄표 GROUND TRUTH (세부페이지로 교차검증 완료)
#   각 항목: dept → (campus, trackHint, {trackKey: quota})
#   trackHint: 인문/자연 (대표) — 의약·이공 계열은 자연, 인문사회는 인문
# ─────────────────────────────────────────────────────────────────────────────
DEPTS = OrderedDict()

def add(name, campus, hint, tracks):
    DEPTS[name] = dict(campus=campus, hint=hint, tracks=tracks)

# ===== 메디컬캠퍼스(대전) =====
# 의학과 (총51 = 일반최저11 지역최저20 지역면접10 지역기초2 지역의사6 [정원내49] + 농어촌면접2 정원외)
add("의학과", MED, "자연", {
    "일반[최저]":11, "지역[최저]":20, "지역[면접]":10,
    "지역[기초]_의학":2, "지역의사":6, "농어촌학생전형[면접]":2,
})
# 데이터의학과 (총20 = 일반교과15 종합5)
add("데이터의학과", MED, "자연", {"일반[교과]":15, "학생부종합":5})
# 간호학과 (총187): 일반교과65 지역교과63 지역기초5 종합50 [정원내183] 농어촌교과4
add("간호학과", MED, "자연", {"일반[교과]":65, "지역[교과]":63, "지역[기초]_간호":5, "학생부종합":50, "농어촌학생전형[교과]":4})
# 작업치료학과 (총60): 일반30 종합25 [55] 농어촌5
add("작업치료학과", MED, "자연", {"일반[교과]":30, "학생부종합":25, "농어촌학생전형[교과]":5})
# 병원경영학과 (총63): 일반52 종합5 [57] 농어촌4 기초2
add("병원경영학과", MED, "인문", {"일반[교과]":52, "학생부종합":5, "농어촌학생전형[교과]":4, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":2})
# 안경광학과 (총49): 일반38 종합7 [45] 농어촌4
add("안경광학과", MED, "자연", {"일반[교과]":38, "학생부종합":7, "농어촌학생전형[교과]":4})
# 임상병리학과 (총54): 일반32 지역교과9 종합6 [47] 농어촌5 기초2
add("임상병리학과", MED, "자연", {"일반[교과]":32, "지역[교과]":9, "학생부종합":6, "농어촌학생전형[교과]":5, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":2})
# 방사선학과 (총42): 일반26 종합12 [38] 농어촌4
add("방사선학과", MED, "자연", {"일반[교과]":26, "학생부종합":12, "농어촌학생전형[교과]":4})
# 치위생학과 (총53): 일반35 종합12 [47] 농어촌4 기초2
add("치위생학과", MED, "자연", {"일반[교과]":35, "학생부종합":12, "농어촌학생전형[교과]":4, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":2})
# 물리치료학과 (총52): 일반30 종합14 [44] 농어촌4 기초4
add("물리치료학과", MED, "자연", {"일반[교과]":30, "학생부종합":14, "농어촌학생전형[교과]":4, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":4})
# 응급구조학과 (총52): 일반20 지역교과15 종합10 [45] 농어촌5 기초2
add("응급구조학과", MED, "자연", {"일반[교과]":20, "지역[교과]":15, "학생부종합":10, "농어촌학생전형[교과]":5, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":2})
# 의공학과 (총58): 일반38 지역교과11 종합7 [56] 농어촌2
add("의공학과", MED, "자연", {"일반[교과]":38, "지역[교과]":11, "학생부종합":7, "농어촌학생전형[교과]":2})
# 의료IT공학과 (총53): 일반39 지역교과5 종합5 [49] 농어촌2 특성화2
add("의료IT공학과", MED, "자연", {"일반[교과]":39, "지역[교과]":5, "학생부종합":5, "농어촌학생전형[교과]":2, "특성화고교졸업자전형":2})
# 의료공간디자인학과 (총48): 일반25 지역교과18 종합5 [48]
add("의료공간디자인학과", MED, "자연", {"일반[교과]":25, "지역[교과]":18, "학생부종합":5})
# 제약생명공학과 (총61): 일반41 지역교과10 종합8 [59] 농어촌2
add("제약생명공학과", MED, "자연", {"일반[교과]":41, "지역[교과]":10, "학생부종합":8, "농어촌학생전형[교과]":2})
# 의료신소재학과 (총40): 일반33 종합5 [38] 농어촌2
add("의료신소재학과", MED, "자연", {"일반[교과]":33, "학생부종합":5, "농어촌학생전형[교과]":2})
# 인공지능학과 (총35): 일반32 종합3 [35]
add("인공지능학과", MED, "자연", {"일반[교과]":32, "학생부종합":3})

# ===== 글로컬캠퍼스(논산) =====
# 국방XR학부 (총27): 일반22 지역교과5 [27]
add("국방XR학부", GLO, "자연", {"일반[교과]":22, "지역[교과]":5})
# 스마트팜학부 (총27): 일반25 [25] 기초1 특성화1
add("스마트팜학부", GLO, "자연", {"일반[교과]":25, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":1, "특성화고교졸업자전형":1})
# 기업소프트웨어학부 (총30): 일반30 [30]
add("기업소프트웨어학부", GLO, "자연", {"일반[교과]":30})
# 스마트보안학과 (총34): 일반30 종합4 [34]
add("스마트보안학과", GLO, "자연", {"일반[교과]":30, "학생부종합":4})
# 유무인항공학과 (총33): 일반20 종합5 [25] 채용조건8(계약정원-채용)
add("유무인항공학과", GLO, "자연", {"일반[교과]":20, "학생부종합":5, "채용조건형[계약]":8})
# 재난안전소방학전공 (총32): 일반30 [30] 농어촌2
add("재난안전소방학전공", GLO, "자연", {"일반[교과]":30, "농어촌학생전형[교과]":2})
# 방위산업공학전공 (총12): 채용조건12 (전원 채용조건형 계약·정원외; 정원내 0)
add("방위산업공학전공", GLO, "자연", {"채용조건형[계약]":12})
# 국방반도체공학과 (총25): 일반25 [25]
add("국방반도체공학과", GLO, "자연", {"일반[교과]":25})
# ND산업디자인학부 (총32): 일반31 [31] 특성화1
add("ND산업디자인학부", GLO, "자연", {"일반[교과]":31, "특성화고교졸업자전형":1})
# 국방산업경영학부 (총35): 일반32 종합3 [35]
add("국방산업경영학부", GLO, "인문", {"일반[교과]":32, "학생부종합":3})
# 임상의약바이오학과 (총32): 일반30 [30] 농어촌2
add("임상의약바이오학과", GLO, "자연", {"일반[교과]":30, "농어촌학생전형[교과]":2})
# 식품생명공학과 (총20): 일반17 종합3 [20]
add("식품생명공학과", GLO, "자연", {"일반[교과]":17, "학생부종합":3})
# 글로벌의료뷰티학전공 (총32): 일반11 지역교과7 특기자13 [31] 특성화1
add("글로벌의료뷰티학전공", GLO, "인문", {"일반[교과]":11, "지역[교과]":7, "특기자전형":13, "특성화고교졸업자전형":1})
# 스포츠의학전공 (총27): 일반15 종합10 [25] 농어촌2
add("스포츠의학전공", GLO, "자연", {"일반[교과]":15, "학생부종합":10, "농어촌학생전형[교과]":2})
# 심리상담치료학과 (총37): 일반18 종합14 [32] 농어촌2 기초1 특성화2
add("심리상담치료학과", GLO, "인문", {"일반[교과]":18, "학생부종합":14, "농어촌학생전형[교과]":2, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":1, "특성화고교졸업자전형":2})
# 유아교육과 (총23): 일반12 종합8 [20] 농어촌2 특수교육1
add("유아교육과", GLO, "인문", {"일반[교과]":12, "학생부종합":8, "농어촌학생전형[교과]":2, "특수교육대상자전형":1})
# 재활퍼스널트레이닝학과 (총30): 일반실기30 [30]
add("재활퍼스널트레이닝학과", GLO, "자연", {"일반[실기]":30})
# 국방경찰행정학부 (총47): 일반35 지역교과5 종합5 [45] 농어촌2
add("국방경찰행정학부", GLO, "인문", {"일반[교과]":35, "지역[교과]":5, "학생부종합":5, "농어촌학생전형[교과]":2})
# 군사학과(남) [육군협약] (총26): 군사학26 [26]
add("군사학과(남)", GLO, "자연", {"군사학전형":26})
# 군사학과(여) [육군협약] (총9): 군사학9 [9]
add("군사학과(여)", GLO, "자연", {"군사학전형":9})
# 사회복지학과 (총33): 일반18 지역교과10 종합5 [33]
add("사회복지학과", GLO, "인문", {"일반[교과]":18, "지역[교과]":10, "학생부종합":5})
# 특수교육과 [사범] (총46): 일반30 지역교과5 종합5 [40] 농어촌1 기초2 특수교육3
add("특수교육과", GLO, "인문", {"일반[교과]":30, "지역[교과]":5, "학생부종합":5, "농어촌학생전형[교과]":1, "기초생활수급자,차상위계층,한부모가족 지원대상자전형":2, "특수교육대상자전형":3})

# 총괄표 '총 모집인원' 컬럼 (rowSum 검증 basis) — GROUND TRUTH
TOTAL_HINT = {
 # 메디컬
 "의학과":51, "데이터의학과":20, "간호학과":187, "작업치료학과":60, "병원경영학과":63,
 "안경광학과":49, "임상병리학과":54, "방사선학과":42, "치위생학과":53, "물리치료학과":52,
 "응급구조학과":52, "의공학과":58, "의료IT공학과":53, "의료공간디자인학과":48,
 "제약생명공학과":61, "의료신소재학과":40, "인공지능학과":35,
 # 글로컬
 "국방XR학부":27, "스마트팜학부":27, "기업소프트웨어학부":30, "스마트보안학과":34,
 "유무인항공학과":33, "재난안전소방학전공":32, "방위산업공학전공":12, "국방반도체공학과":25,
 "ND산업디자인학부":32, "국방산업경영학부":35, "임상의약바이오학과":32, "식품생명공학과":20,
 "글로벌의료뷰티학전공":32, "스포츠의학전공":27, "심리상담치료학과":37, "유아교육과":23,
 "재활퍼스널트레이닝학과":30, "국방경찰행정학부":47, "군사학과(남)":26, "군사학과(여)":9,
 "사회복지학과":33, "특수교육과":46,
}

# 총괄표 전형별 열 합계 (colTotal 검증 stated) — 캠퍼스 통합 grand total 기준
# (요약표 기준; 학과별 trackKey 를 표시명으로 통합)
COL_STATED = {
 "일반[교과]":982, "지역[교과]":163, "일반[최저]":11, "지역[최저]":20, "지역[면접]":10,
 "지역[기초]":7,  # 의학2 + 간호5
 "군사학전형":35, "농어촌학생전형[면접]":2, "농어촌학생전형[교과]":60,
 "기초생활수급자,차상위계층,한부모가족 지원대상자전형":16,
 "특성화고교졸업자전형":7, "특수교육대상자전형":4, "채용조건형[계약]":20,
 "학생부종합":241, "지역의사":6, "특기자전형":13, "일반[실기]":30,
}

# ─────────────────────────────────────────────────────────────────────────────
# 빌드
# ─────────────────────────────────────────────────────────────────────────────
def track_display_name(tk):
    # 학과별 분기 키(지역[기초]_의학/_간호) → 표시명 '지역[기초]'
    if tk.startswith("지역[기초]"):
        return "지역[기초]"
    return tk

def build_track(tk, quota):
    info = TRACKS[tk]
    disp = track_display_name(tk)
    return OrderedDict([
        ("trackName", disp),
        ("trackTypeRaw", info["t"]),
        ("recruitmentPeriodRaw", "수시"),
        ("specialTypeKeyword", info["special"]),
        ("quotaInitial", quota),
        ("applicationQualification", info["qual"]),
        ("reflectionStages", info["st"]),
        ("csatMinimumRawText", info["csat"]),
        ("csatMinimumExempt", info["exempt"]),
        ("csatRequiredAreasRawText", info["areas"]),
        ("prevYearResult", None),
        ("sourcePages", info["pages"]),
    ])

# 전형 표시순서(총괄표 컬럼 순)
TRACK_ORDER = [
 "일반[교과]","지역[교과]","일반[최저]","지역[최저]","지역[면접]",
 "지역[기초]_의학","지역[기초]_간호","군사학전형",
 "농어촌학생전형[면접]","농어촌학생전형[교과]",
 "기초생활수급자,차상위계층,한부모가족 지원대상자전형","특성화고교졸업자전형","특수교육대상자전형",
 "채용조건형[계약]","학생부종합","지역의사","특기자전형","일반[실기]",
]

departments = []
warnings = []
col_computed = defaultdict(int)
row_pass = 0; row_fail = 0; failed_list = []

for name, d in DEPTS.items():
    tks = d["tracks"]
    ordered = [tk for tk in TRACK_ORDER if tk in tks]
    track_objs = [build_track(tk, tks[tk]) for tk in ordered]
    tq = sum(tks.values())
    hint = TOTAL_HINT[name]
    if tq != hint:
        row_fail += 1
        failed_list.append({"department":name, "trackSum":tq, "totalQuotaHint":hint})
    else:
        row_pass += 1
    # 열 합계 누적(표시명 기준)
    for tk, q in tks.items():
        col_computed[track_display_name(tk)] += q
    departments.append(OrderedDict([
        ("departmentName", name),
        ("campus", d["campus"]),
        ("trackHint", d["hint"]),
        ("totalQuotaHint", hint),
        ("tracks", track_objs),
    ]))

# colTotalValidation (표시명 단위 — '지역[기초]' 합본 7)
colval = []
display_stated = dict(COL_STATED)  # 표시명 단위 stated
for disp in ["일반[교과]","지역[교과]","일반[최저]","지역[최저]","지역[면접]","지역[기초]","군사학전형",
             "농어촌학생전형[면접]","농어촌학생전형[교과]","기초생활수급자,차상위계층,한부모가족 지원대상자전형",
             "특성화고교졸업자전형","특수교육대상자전형","채용조건형[계약]","학생부종합","지역의사","특기자전형","일반[실기]"]:
    comp = col_computed.get(disp, 0)
    stated = display_stated[disp]
    colval.append({"track":disp, "computed":comp, "stated":stated, "match":comp==stated})

checksum_passed = (row_fail == 0) and all(c["match"] for c in colval)

# 정원외 안내 warning
warnings.append("정원외 특별전형(농어촌·기초/차상위/한부모·특성화고·특수교육대상자·채용조건형[계약])은 총괄표 '총 모집인원' 컬럼에 이미 합산되어 있어 totalQuotaHint 및 rowSum에 포함됨. 정원외 합계 109명(농어촌면접2+농어촌교과60+기초16+특성화7+특수4+채용20).")
warnings.append("방위산업공학전공은 정원내 모집 없이 채용조건형[계약](정원외) 12명만 모집(총괄표 '총' 12, 정원내소계 표기 '-').")
warnings.append("지역[기초]는 의학과(2명, 수능최저 3합7·면접형 2단계)와 간호학과(5명, 수능최저 없음·교과100)로 전형방법·수능최저가 상이하여 학과별로 분리 구조화함(표시명은 동일 '지역[기초]').")
warnings.append("농어촌학생전형은 의학과만 면접형(농어촌[면접], 정원외 2명, 수능최저 3합6)이고 그 외 전 학과는 교과형(농어촌[교과], 수능최저 없음). 총괄표상 캠퍼스별 정원외 농어촌 컬럼이 분리되어 있어 [면접]/[교과]로 구분.")
warnings.append("의학과 지역의사전형은 6개 권역세부(광역·공주·논산·서산·천안·홍성) 각 1명 합 6명; 단일 모집단위(의학과)·단일 전형으로 통합 구조화.")
warnings.append("trackHint(인문/자연)는 대표 계열 추정값(모집요강에 계열 명시 없음). 입결 매핑 보조용 참고치.")

meta = OrderedDict([
    ("universityName", UNIV),
    ("universityId", SLUG),
    ("year", YEAR),
    ("recruitmentSeason", "susi"),
    ("sourceDocYear", YEAR),
    ("campusScope", "메디컬캠퍼스(대전)+글로컬캠퍼스(논산) 통합. '전형별 모집인원 총괄표'(txt p.12~13) GROUND TRUTH, 각 전형 세부 페이지(전형별 세부 사항 p.15~35)와 교차검증. 요약표 정원내 1,518/정원외 109/계 1,627 정합."),
    ("method", "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)"),
    ("visionCost", 0),
    ("departments", len(departments)),
    ("totalTracks", sum(len(x["tracks"]) for x in departments)),
    ("rowSumValidation", OrderedDict([
        ("basis", "totalQuotaHint(모집단위별 수시 전형 인원 합 == 총괄표 '총 모집인원')"),
        ("passed", row_pass),
        ("failed", row_fail),
        ("failedList", failed_list),
    ])),
    ("colTotalValidation", colval),
    ("checksumPassed", bool(checksum_passed)),
])

result = OrderedDict([
    ("universityName", UNIV),
    ("year", YEAR),
    ("recruitmentSeason", "susi"),
    ("departments", departments),
    ("warnings", warnings),
])

out = OrderedDict([("meta", meta), ("result", result)])
p = BASE/"konyang-text.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

# ── 콘솔 요약 ──
grand = sum(x["totalQuotaHint"] for x in departments)
print(f"DEPARTMENTS={len(departments)}  TRACKS={meta['totalTracks']}")
print(f"ROWSUM passed={row_pass} failed={row_fail}")
matched = sum(1 for c in colval if c['match'])
print(f"COLSUM matched={matched}/{len(colval)}")
print(f"CHECKSUM_PASSED={checksum_passed}")
print(f"GRAND_TOTAL extracted_sum={grand}  요강명시_총계=1627")
for c in colval:
    if not c["match"]:
        print("  COL MISMATCH:", c)
for f in failed_list:
    print("  ROW FAIL:", f)
