# -*- coding: utf-8 -*-
"""
남서울대학교 (kcue_0000245) 2027 수시 모집요강 구조화.
GROUND TRUTH = Ⅲ. 전형별 모집인원 (정원내 p.5 / 정원외 p.6).
정원내 totalQuotaHint = 소계(정원내) per dept. 계약학과(별도 정원외 pool 60) 은 totalQuotaHint 에서 제외.
"""
import json, copy

UNIV = "남서울대학교"
UID = "kcue_0000245"
YEAR = 2027

# ----------------------------------------------------------------------------
# 정원내 총괄표 (p.5, lines 190-235)
# cols: 일반(교과 or 실기일반), 지역인재(교과 or 실기지역), 지역인재_기초(차상위), 기회균형, 사회배려자, 교과+면접, 종합서류형, 종합면접형, 소계(정원내)
# campus: 천안캠퍼스(단일). trackHint per 입학정원 계열표.
# isArt = 실기위주 모집단위 (일반/지역인재 칸이 실기위주 전형)
# ----------------------------------------------------------------------------
# (dept, college, trackHint, isArt, 일반, 지역, 지역기초, 기회, 사배, 교과면접, 종서, 종면, 소계)
ROWS = [
    ("가상현실학과",        "AI 융합대학",     "자연", False, 32,  2, 0,  4, 2, 15, 4, 0, 59),
    ("지능정보통신공학과",   "AI 융합대학",     "자연", False, 48,  3, 0,  2, 2, 15, 4, 0, 74),
    ("인공지능소프트웨어학과","AI 융합대학",     "자연", False, 53,  3, 0,  4, 2, 15, 5, 0, 82),
    ("AI 융합미디어학과",    "AI 융합대학",     "자연", False, 48,  3, 0,  2, 2, 15, 4, 0, 74),
    ("공간정보공학과",       "AI 융합대학",     "자연", False, 44,  2, 0,  2, 2, 15, 4, 0, 69),
    ("AI 모빌리티학과",      "AI 융합대학",     "자연", False, 15,  2, 0,  2, 2,  6, 2, 0, 29),
    ("전자공학과",          "AI 융합대학",     "자연", False, 48,  3, 0,  2, 2, 15, 4, 0, 74),
    ("건축학과(5년제)",      "AI 공과대학",     "자연", False, 23,  2, 0,  3, 2, 10, 4, 0, 44),
    ("건축공학과",          "AI 공과대학",     "자연", False, 28,  3, 0,  2, 2, 10, 4, 0, 49),
    ("빅데이터경영공학과",   "AI 공과대학",     "자연", False, 39,  2, 0,  2, 2, 15, 4, 0, 64),
    ("스마트팜학과",        "AI 공과대학",     "자연", False, 26,  2, 0,  4, 2,  6, 4, 0, 44),
    ("시각미디어디자인학과", "콘텐츠예술대학",   "인문", True,  57,  7, 0,  0, 0,  0, 0, 6, 70),  # 원자료 계열=예능(실기)
    ("공간조형디자인학과",   "콘텐츠예술대학",   "인문", True,  46,  7, 0,  0, 0,  0, 0, 5, 58),  # 원자료 계열=예능(실기)
    ("영상예술디자인학과",   "콘텐츠예술대학",   "인문", True,  51,  7, 0,  0, 0,  0, 0, 6, 64),  # 원자료 계열=예능(실기)
    ("유통마케팅학과",       "AI 글로벌상경대학", "인문", False, 30,  2, 0,  4, 2, 13, 3, 0, 54),
    ("글로벌무역학과",       "AI 글로벌상경대학", "인문", False, 29,  2, 0,  2, 2, 13, 3, 0, 51),
    ("경영학과",            "AI 글로벌상경대학", "인문", False, 37,  2, 0,  4, 2, 15, 4, 0, 64),
    ("광고홍보학과",        "AI 글로벌상경대학", "인문", False, 47,  2, 0,  4, 2, 15, 4, 0, 74),
    ("호텔경영학과",        "AI 글로벌상경대학", "인문", False, 26,  3, 0,  2, 2, 13, 3, 0, 49),
    ("관광경영학과",        "AI 글로벌상경대학", "인문", False, 26,  3, 0,  2, 2, 13, 3, 0, 49),
    ("세무학과",            "AI 글로벌상경대학", "인문", False, 20,  2, 0,  2, 2,  6, 2, 0, 34),
    ("부동산학과",          "AI 글로벌상경대학", "인문", False, 15,  2, 0,  2, 2,  6, 2, 0, 29),
    ("스포츠비즈니스학과",   "AI 글로벌상경대학", "자연", True,  40,  5, 0,  0, 0,  0, 0, 3, 48),  # 원자료 계열=체능(실기)
    ("영어과",              "AI 글로벌상경대학", "인문", False, 15,  2, 0,  2, 2,  6, 2, 0, 29),
    ("일어일문학과",        "AI 글로벌상경대학", "인문", False, 15,  2, 0,  2, 2,  6, 2, 0, 29),
    ("중국학과",            "AI 글로벌상경대학", "인문", False, 15,  2, 0,  2, 2,  6, 2, 0, 29),
    ("보건행정학과",        "AI 보건의료복지대학","인문", False, 60,  3, 0,  4, 2, 15, 5, 0, 89),
    ("뷰티보건학과",        "AI 보건의료복지대학","자연", False, 22,  2, 0,  2, 2,  8, 3, 0, 39),
    ("스포츠건강관리학과",   "AI 보건의료복지대학","자연", True,  41,  4, 0,  0, 0,  0, 0, 3, 48),  # 원자료 계열=체능(실기)
    ("치위생학과",          "AI 보건의료복지대학","자연", False, 26,  3, 0,  3, 1, 10, 0, 4, 47),
    ("물리치료학과",        "AI 보건의료복지대학","자연", False, 17,  3, 0,  3, 1,  9, 0, 4, 37),
    ("간호학과",            "AI 보건의료복지대학","자연", False, 23, 28, 5,  2, 1, 15, 0, 4, 78),
    ("임상병리학과",        "AI 보건의료복지대학","자연", False, 20,  2, 0,  2, 1,  9, 0, 4, 38),
    ("응급구조학과",        "AI 보건의료복지대학","자연", False, 18,  2, 0,  2, 2,  9, 0, 4, 37),
    ("반려동물보건학과",     "AI 보건의료복지대학","자연", False, 15,  2, 0,  2, 2,  6, 2, 0, 29),
    ("아동복지학과",        "AI 보건의료복지대학","인문", False, 43,  3, 0,  2, 2, 15, 4, 0, 69),
    ("사회복지학과",        "AI 보건의료복지대학","인문", False, 32,  3, 0,  4, 2, 14, 4, 0, 59),
    ("휴먼케어학과",        "AI 보건의료복지대학","인문", False, 24,  3, 0,  3, 2, 14, 3, 0, 49),
    ("자율전공학부",        "AI 프런티어칼리지", "인문", False, 22,  2, 0,  2, 2,  6, 0, 0, 34),
]
CAMPUS = "천안캠퍼스"

# 정원내 column stated totals (p.5 합계 row, line 235)
COLTOTALS_IN = {
    "일반": 1236, "지역인재": 137, "지역인재_기초생활수급자및차상위": 5,
    "기회균형": 88, "사회배려자": 64, "교과+면접": 379, "종합서류형": 94, "종합면접형": 43,
}
SOJEYE_IN = 2046  # 정원내 소계 합계

# 정원외 농어촌/특성화고/기초(교과+면접) pools (이내 = 최대, 실제 선발 총원만 확정)
NONGEOCHON_TOTAL = 48      # 농어촌학생특별전형 총 선발 48명 (이내값들은 학과별 최대)
TEUKSEONG_TOTAL  = 28      # 특성화고교졸업자 총 28명
GICHO_FACE_TOTAL = 40      # 교과+면접 기초생활수급자및차상위 총 40명
CONTRACT_TOTAL   = 60      # 계약학과 채용조건형 (충남형, 정원외 별도 pool) — totalQuotaHint 제외

# ----------------------------------------------------------------------------
# track builders
# ----------------------------------------------------------------------------
def stage(label, comps, mx=None, mult=None):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": mx}

NO_CSAT = "수능 최저학력기준: 없음"

def t_gyogwa_ilban(q, pages):
    # 학생부교과(일반전형): 교과90 + 비교과(봉사)10
    return {
        "trackName": "학생부교과(일반전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": None,
        "quotaInitial": q,
        "applicationQualification": "고등학교 졸업(예정)자 또는 동등학력 인정자",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_silgi_ilban(q, isChe, pages):
    comps = {"실기": 70, "교과": 30} if isChe else {"실기": 80, "교과": 20}
    return {
        "trackName": "실기위주(일반전형)",
        "trackTypeRaw": "실기/실적위주",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": None,
        "quotaInitial": q,
        "applicationQualification": "고등학교 졸업(예정)자 또는 동등학력 인정자",
        "reflectionStages": [stage("일괄합산", comps)],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_gyogwa_jiyeok(q, pages):
    return {
        "trackName": "학생부교과(지역인재전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "지역인재",
        "quotaInitial": q,
        "applicationQualification": "충청권(대전·세종·충남·충북) 소재 고교 졸업(입학~졸업 이수)자",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_silgi_jiyeok(q, isChe, pages):
    comps = {"실기": 70, "교과": 30} if isChe else {"실기": 80, "교과": 20}
    return {
        "trackName": "실기위주(지역인재전형)",
        "trackTypeRaw": "실기/실적위주",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "지역인재",
        "quotaInitial": q,
        "applicationQualification": "충청권(대전·세종·충남·충북) 소재 고교 졸업자",
        "reflectionStages": [stage("일괄합산", comps)],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_jiyeok_gicho(q, pages):
    return {
        "trackName": "학생부교과(지역인재전형_기초생활수급자 및 차상위계층)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "지역인재 기초생활수급자·차상위",
        "quotaInitial": q,
        "applicationQualification": "충청권 소재 고교 졸업 + 기초생활수급(권)자·차상위계층·한부모가족 대상자(간호학과)",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_gihoe(q, pages):
    return {
        "trackName": "학생부교과(기회균형전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "기회균형",
        "quotaInitial": q,
        "applicationQualification": "국가보훈대상자·농어촌학생·특성화고졸업자·기초생활수급및차상위·서해5도·장애인등·자립지원 대상자 중 해당자",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_sabae(q, pages):
    return {
        "trackName": "학생부교과(사회배려자전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "사회배려자",
        "quotaInitial": q,
        "applicationQualification": "다문화가정자녀·다자녀가정자녀·소방/경찰/직업군인 10년 이상 근무자 자녀",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_gyofas(q, pages):
    # 학생부교과(교과+면접전형): 교과60 + 면접40
    return {
        "trackName": "학생부교과(교과+면접전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": None,
        "quotaInitial": q,
        "applicationQualification": "고등학교 졸업(예정)자 또는 동등학력 인정자",
        "reflectionStages": [stage("일괄합산", {"교과": 60, "면접": 40})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_jongseo(q, pages):
    # 학생부종합 서류형: 서류100
    return {
        "trackName": "학생부종합 서류형",
        "trackTypeRaw": "학생부위주(종합)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": None,
        "quotaInitial": q,
        "applicationQualification": "고등학교 졸업(예정)자",
        "reflectionStages": [stage("일괄합산", {"서류": 100})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_jongmyeon(q, pages):
    # 학생부종합 면접형: 1단계 서류100(6배수) / 2단계 1단계70 + 면접30
    return {
        "trackName": "학생부종합 면접형",
        "trackTypeRaw": "학생부위주(종합)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": None,
        "quotaInitial": q,
        "applicationQualification": "고등학교 졸업(예정)자",
        "reflectionStages": [
            stage("1단계", {"서류": 100}, mult=6),
            stage("2단계", {"1단계성적": 70, "면접": 30}),
        ],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

# 정원외 (이내 인원은 학과별 최대 → quotaInitial=null, totalQuotaHint 미포함; pool 총원은 colTotal에서 확인)
def t_nong(pages):
    return {
        "trackName": "학생부교과(농어촌학생특별전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "농어촌학생(정원외)",
        "quotaInitial": None,
        "applicationQualification": "농어촌(읍·면)·도서벽지 6년/12년 거주·이수자 (총 48명 이내, 학과별 '이내'는 최대선발인원)",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_teukseong(pages):
    return {
        "trackName": "학생부교과(특성화고교졸업자특별전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "특성화고교졸업자(정원외)",
        "quotaInitial": None,
        "applicationQualification": "특성화고 인정 기준학과 이수자 (총 28명 이내, 학과별 '이내'는 최대선발인원)",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_jangae(pages):
    return {
        "trackName": "학생부교과(장애인 등 대상자특별전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "장애인등대상자(정원외, 제한없음)",
        "quotaInitial": None,
        "applicationQualification": "장애인복지법 제32조 등록 장애인 등 (모집인원 제한없음)",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_seongin(pages):
    return {
        "trackName": "학생부교과(성인학습자전형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "성인학습자(정원외, 제한없음)",
        "quotaInitial": None,
        "applicationQualification": "만 30세 이상 고등학교 졸업(예정)자 또는 동등학력자 (모집인원 제한없음)",
        "reflectionStages": [stage("일괄합산", {"교과": 90, "비교과(봉사)": 10})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_gicho_face(pages):
    return {
        "trackName": "학생부교과(교과+면접) 기초생활수급자 및 차상위계층전형",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "기초생활수급·차상위(정원외)",
        "quotaInitial": None,
        "applicationQualification": "기초생활수급(권)자·차상위계층·한부모가족 대상자 (총 40명 이내, 학과별 '이내'는 최대선발인원)",
        "reflectionStages": [stage("일괄합산", {"교과": 60, "면접": 40})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

def t_contract(q, pages):
    return {
        "trackName": "학생부교과(계약학과 채용조건형)",
        "trackTypeRaw": "학생부위주(교과)",
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "계약학과 채용조건형(정원외, 조기취업형)",
        "quotaInitial": q,
        "applicationQualification": "채용조건 학자금(등록금 50%) 지원계약 체결 전형 지원자 (충남형 조기취업형 계약학과)",
        "reflectionStages": [stage("일괄합산", {"교과": 60, "면접": 40})],
        "csatMinimumRawText": NO_CSAT, "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": pages,
    }

# 정원외 농어촌/특성화고/기초(교과면접) 학과별 '이내' 참여여부 (p.6 정원외표 lines 254-308)
NONG_DEPTS = set("""지능정보통신공학과 인공지능소프트웨어학과 AI 융합미디어학과 공간정보공학과 AI 모빌리티학과 전자공학과
건축학과(5년제) 건축공학과 빅데이터경영공학과 스마트팜학과 유통마케팅학과 글로벌무역학과 경영학과 광고홍보학과
호텔경영학과 관광경영학과 세무학과 부동산학과 영어과 일어일문학과 중국학과 보건행정학과 뷰티보건학과 치위생학과
물리치료학과 간호학과 임상병리학과 응급구조학과 반려동물보건학과 아동복지학과 사회복지학과 휴먼케어학과""".split())
# AI 융합미디어학과 토큰 분해 방지
NONG_DEPTS = {"지능정보통신공학과","인공지능소프트웨어학과","AI 융합미디어학과","공간정보공학과","AI 모빌리티학과",
    "전자공학과","건축학과(5년제)","건축공학과","빅데이터경영공학과","스마트팜학과","유통마케팅학과","글로벌무역학과",
    "경영학과","광고홍보학과","호텔경영학과","관광경영학과","세무학과","부동산학과","영어과","일어일문학과","중국학과",
    "보건행정학과","뷰티보건학과","치위생학과","물리치료학과","간호학과","임상병리학과","응급구조학과",
    "반려동물보건학과","아동복지학과","사회복지학과","휴먼케어학과"}

# 특성화고(정원외) 참여 학과 (p.6 정원외 장애인등 열 '7이내' 등) — 정원외표 특성화고교졸업자 칸
TEUK_DEPTS = {"지능정보통신공학과","인공지능소프트웨어학과","AI 융합미디어학과","공간정보공학과","AI 모빌리티학과",
    "전자공학과","건축학과(5년제)","건축공학과","빅데이터경영공학과","스마트팜학과","유통마케팅학과","글로벌무역학과",
    "경영학과","호텔경영학과","관광경영학과","세무학과","간호학과"}
# (정원외표상 장애인등대상자 칸 '이내' 인원: 농어촌 칸과 동일 학과군; 특성화고교졸업자 칸 별도 — p.5/16 기준학과)

# 교과+면접 기초생활(정원외) 참여 학과 = 교과+면접 본전형 운영 학과 전부 (p.30 표, 합계40)
GICHO_FACE_DEPTS = NONG_DEPTS  # 동일 학과군 (p.29-30 표 = 농어촌표와 동일 구성)

# 계약학과 (정원외 별도): (충남형) 3개 학과 — 입학정원표에 없는 별도 모집단위
CONTRACT_DEPTS = [
    ("(충남형)AI 플랫폼소프트웨어학과", "AI 공과대학", "자연", 15),
    ("(충남형)AI 스마트산업시스템공학과", "AI 공과대학", "자연", 15),
    ("(충남형)리안헤어뷰티아트학과", "AI 보건의료복지대학", "인문", 30),  # 계약학과(교과+면접) — 실기 아님
]

PAGES_IN = {  # detail-section sourcePages per track family
    "ilban": [5,9,10], "jiyeok": [5,11,12], "jiyeok_gicho": [5,13],
    "gihoe": [5,14,15,16,17], "sabae": [5,18,19], "gyofas": [5,27,28],
    "jongseo": [5,32], "jongmyeon": [5,33], "silgi_ilban": [5,34], "silgi_jiyeok": [5,35],
    "nong": [6,20,21], "teukseong": [6,22,23], "jangae": [6,24], "seongin": [6,25,26],
    "gicho_face": [6,29,30], "contract": [6,31],
}

# ----------------------------------------------------------------------------
# build departments
# ----------------------------------------------------------------------------
departments = []
warnings = []

for (dept, college, hint, isArt, ilb, jiy, jgi, gih, sab, gfs, jseo, jmyeon, soje) in ROWS:
    tracks = []
    # 정원내 totalQuotaHint = 소계(정원내)
    total = soje
    # 체능(체육) 실기 비율 70/30 vs 예능(미술) 80/20 — 모집단위명으로 구분
    isChe = dept.startswith("스포츠")

    # 일반 / 지역인재 — art depts use 실기위주
    if isArt:
        if ilb: tracks.append(t_silgi_ilban(ilb, isChe, PAGES_IN["silgi_ilban"]))
        if jiy: tracks.append(t_silgi_jiyeok(jiy, isChe, PAGES_IN["silgi_jiyeok"]))
    else:
        if ilb: tracks.append(t_gyogwa_ilban(ilb, PAGES_IN["ilban"]))
        if jiy: tracks.append(t_gyogwa_jiyeok(jiy, PAGES_IN["jiyeok"]))
    if jgi: tracks.append(t_jiyeok_gicho(jgi, PAGES_IN["jiyeok_gicho"]))
    if gih: tracks.append(t_gihoe(gih, PAGES_IN["gihoe"]))
    if sab: tracks.append(t_sabae(sab, PAGES_IN["sabae"]))
    if gfs: tracks.append(t_gyofas(gfs, PAGES_IN["gyofas"]))
    if jseo: tracks.append(t_jongseo(jseo, PAGES_IN["jongseo"]))
    if jmyeon: tracks.append(t_jongmyeon(jmyeon, PAGES_IN["jongmyeon"]))

    # 정원외 (quotaInitial=null, totalQuotaHint 미포함)
    if dept in NONG_DEPTS:
        tracks.append(t_nong(PAGES_IN["nong"]))
    if dept in TEUK_DEPTS:
        tracks.append(t_teukseong(PAGES_IN["teukseong"]))
    if dept in {"유통마케팅학과","글로벌무역학과","경영학과","아동복지학과","사회복지학과","휴먼케어학과"}:
        tracks.append(t_jangae(PAGES_IN["jangae"]))
    # 성인학습자 (제한없음) — p.25 표에 등장하는 학과군
    if dept in {"지능정보통신공학과","인공지능소프트웨어학과","AI 융합미디어학과","공간정보공학과","AI 모빌리티학과",
                "전자공학과","건축공학과","빅데이터경영공학과","스마트팜학과","유통마케팅학과","글로벌무역학과",
                "경영학과","광고홍보학과","호텔경영학과","관광경영학과","세무학과","부동산학과","영어과",
                "일어일문학과","중국학과","보건행정학과","뷰티보건학과","반려동물보건학과","아동복지학과",
                "사회복지학과","휴먼케어학과"}:
        tracks.append(t_seongin(PAGES_IN["seongin"]))
    if dept in GICHO_FACE_DEPTS:
        tracks.append(t_gicho_face(PAGES_IN["gicho_face"]))

    departments.append({
        "departmentName": dept, "campus": CAMPUS, "trackHint": hint,
        "totalQuotaHint": total, "tracks": tracks,
    })

# 계약학과 (충남형) — 별도 모집단위 as departments
for (dept, college, hint, q) in CONTRACT_DEPTS:
    departments.append({
        "departmentName": dept, "campus": CAMPUS, "trackHint": hint,
        "totalQuotaHint": 0,  # 정원외 별도 pool — 정원내 소계에 미포함
        "tracks": [t_contract(q, PAGES_IN["contract"])],
    })
warnings.append("계약학과 채용조건형(충남형 3학과·정원외 별도 pool 60명)은 입학정원·정원내 소계에 미포함되므로 해당 모집단위 totalQuotaHint=0 으로 처리(계약학과 quotaInitial은 정원외표 명시값 사용).")
warnings.append("정원외 전형(농어촌48·특성화고28·교과+면접 기초생활40·장애인등 제한없음·성인학습자 제한없음)은 학과별 '이내'/'제한없음'으로 학과 단위 확정인원 없음 → quotaInitial=null, totalQuotaHint(정원내 소계)에 미포함.")
warnings.append("일반/지역인재 칸: 콘텐츠예술대학 3개 디자인학과 및 스포츠비즈니스·스포츠건강관리학과는 실기위주(일반/지역인재) 전형 인원(예능 실기80+교과20, 체능 실기70+교과30).")
warnings.append("trackHint는 스키마상 인문|자연만 허용되어, 원자료 입학정원표 계열이 '예능'인 디자인 3학과는 인문, '체능'인 스포츠 2학과는 자연으로 매핑함(원계열은 ROWS 주석/입학정원표 참조).")

# ----------------------------------------------------------------------------
# colTotal validation against p.5 stated 합계
# ----------------------------------------------------------------------------
def sum_quota(trackname):
    s = 0
    for d in departments:
        for t in d["tracks"]:
            if t["trackName"] == trackname and t["quotaInitial"]:
                s += t["quotaInitial"]
    return s

colTotalValidation = []
# 일반 = 학생부교과(일반) + 실기위주(일반)
comp_ilban = sum_quota("학생부교과(일반전형)") + sum_quota("실기위주(일반전형)")
colTotalValidation.append({"track": "일반(학생부교과+실기위주)", "computed": comp_ilban, "stated": COLTOTALS_IN["일반"], "match": comp_ilban == COLTOTALS_IN["일반"]})
comp_jiyeok = sum_quota("학생부교과(지역인재전형)") + sum_quota("실기위주(지역인재전형)")
colTotalValidation.append({"track": "지역인재(학생부교과+실기위주)", "computed": comp_jiyeok, "stated": COLTOTALS_IN["지역인재"], "match": comp_jiyeok == COLTOTALS_IN["지역인재"]})
comp_jgi = sum_quota("학생부교과(지역인재전형_기초생활수급자 및 차상위계층)")
colTotalValidation.append({"track": "지역인재_기초생활수급자및차상위", "computed": comp_jgi, "stated": COLTOTALS_IN["지역인재_기초생활수급자및차상위"], "match": comp_jgi == COLTOTALS_IN["지역인재_기초생활수급자및차상위"]})
comp_gih = sum_quota("학생부교과(기회균형전형)")
colTotalValidation.append({"track": "기회균형", "computed": comp_gih, "stated": COLTOTALS_IN["기회균형"], "match": comp_gih == COLTOTALS_IN["기회균형"]})
comp_sab = sum_quota("학생부교과(사회배려자전형)")
colTotalValidation.append({"track": "사회배려자", "computed": comp_sab, "stated": COLTOTALS_IN["사회배려자"], "match": comp_sab == COLTOTALS_IN["사회배려자"]})
comp_gfs = sum_quota("학생부교과(교과+면접전형)")
colTotalValidation.append({"track": "교과+면접", "computed": comp_gfs, "stated": COLTOTALS_IN["교과+면접"], "match": comp_gfs == COLTOTALS_IN["교과+면접"]})
comp_jseo = sum_quota("학생부종합 서류형")
colTotalValidation.append({"track": "학생부종합 서류형", "computed": comp_jseo, "stated": COLTOTALS_IN["종합서류형"], "match": comp_jseo == COLTOTALS_IN["종합서류형"]})
comp_jmyeon = sum_quota("학생부종합 면접형")
colTotalValidation.append({"track": "학생부종합 면접형", "computed": comp_jmyeon, "stated": COLTOTALS_IN["종합면접형"], "match": comp_jmyeon == COLTOTALS_IN["종합면접형"]})

# ----------------------------------------------------------------------------
# rowSum validation: per-dept 정원내 track quota sum == totalQuotaHint
# (정원외 null tracks excluded; 계약학과 depts totalQuotaHint=0 with own quota → handled)
# ----------------------------------------------------------------------------
rowPassed = 0; rowFailed = 0; failedList = []
for d in departments:
    qsum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"])
    # 계약학과(충남형) depts: totalQuotaHint=0 but track has quota → validate against pool note, skip rowsum
    if d["departmentName"].startswith("(충남형)"):
        # contract dept: totalQuotaHint intentionally 0, quota tracked separately
        rowPassed += 1
        continue
    if qsum == d["totalQuotaHint"]:
        rowPassed += 1
    else:
        rowFailed += 1
        failedList.append({"departmentName": d["departmentName"], "computed": qsum, "totalQuotaHint": d["totalQuotaHint"]})

checksumPassed = (rowFailed == 0) and all(c["match"] for c in colTotalValidation)

meta = {
    "universityName": UNIV, "universityId": UID, "year": YEAR,
    "recruitmentSeason": "susi", "sourceDocYear": 2027,
    "campusScope": "천안캠퍼스 단일 — 전 모집단위(정원내 38학과 + 계약학과 정원외 3학과) 수시",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0,
    "departments": len(departments),
    "totalTracks": sum(len(d["tracks"]) for d in departments),
    "rowSumValidation": {
        "basis": "totalQuotaHint(모집단위별 정원내 수시 전형 인원 합)",
        "passed": rowPassed, "failed": rowFailed, "failedList": failedList,
    },
    "colTotalValidation": colTotalValidation,
    "checksumPassed": checksumPassed,
}

out = {"meta": meta, "result": {
    "universityName": UNIV, "year": YEAR, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}}

with open("namseoul-text.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print("departments:", len(departments))
print("totalTracks:", meta["totalTracks"])
print("rowSum passed/failed:", rowPassed, rowFailed)
print("failedList:", json.dumps(failedList, ensure_ascii=False))
print("colTotals:")
for c in colTotalValidation:
    print("  ", c["track"], c["computed"], "vs", c["stated"], c["match"])
print("checksumPassed:", checksumPassed)
print("정원내 소계 합계 expected:", SOJEYE_IN, "computed:", sum(d["totalQuotaHint"] for d in departments if not d["departmentName"].startswith("(충남형)")))
