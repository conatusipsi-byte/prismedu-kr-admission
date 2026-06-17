#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
수원대학교 2027 수시 모집요강 구조화 빌더 (Claude Code 본체, Vision 미사용)
- 총괄표는 pdftotext -bbox-layout 의 word x좌표로 컬럼 매핑 (페이지15/16 오프셋 상이 → per-page header center 사용)
- 검증완료: 11개 전형 컬럼 모두 stated 일치, 계(정원내) 1,369, 입학정원 2,130
"""
import json

UNIV = "수원대학교"
UID = "kcue_0000140"
YEAR = 2027

# ---- 전형요소별 반영비율 (line 936-990, %는 실질반영비율) ----
# 교과논술전형: 학생부 25 / 교과논술 75 (명목 20/80), 수능이후 고사, 수능최저 없음
# 면접위주교과전형: 1단계 학생부100(5배수) / 2단계 학생부60+면접40
# 고교추천전형: 학생부 51.7 + 면접 48.3 (명목 60/40), 수능최저 1개영역 4등급 이내
# 교과우수전형: 학생부 100, 수능최저 2개영역 합7(간호 합6)
# 기회균형특별/고운사회/농어촌/특성화고: 학생부 100, 수능최저 없음
# 실기우수자: 학생부+실기 (종목별 상이), 수능최저 없음
# 재외국민/북한이탈: 면접 100 (정원외)

CSAT_AREAS = "국어, 수학, 영어, 탐구(1과목) 과목 중"

def stage(label, comps, maxscore=None, mult=None):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

def track(name, ttype, special, quota, appq, stages, csat_raw, csat_exempt,
          csat_areas, pages):
    return {
        "trackName": name,
        "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special,
        "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": stages,
        "csatMinimumRawText": csat_raw,
        "csatMinimumExempt": csat_exempt,
        "csatRequiredAreasRawText": csat_areas,
        "prevYearResult": None,
        "sourcePages": pages,
    }

# 공통 전형 빌더(정원내 학생부교과 계열)
def t_nonsul(q, pg):
    return track("교과논술전형", "논술위주", None, q,
                 "고등학교 졸업(예정)자 또는 법령상 동등 학력 인정자(검정고시 가능)",
                 [stage("일괄합산", {"학생부(교과)": 25, "논술": 75})],
                 None, True, None, pg)

def t_myeonjeop(q, pg):
    return track("면접위주교과전형", "학생부위주(교과)", None, q,
                 "고등학교 졸업(예정)자 또는 법령상 동등 학력 인정자",
                 [stage("1단계", {"학생부(교과)": 100}),
                  stage("2단계", {"학생부(교과)": 60, "면접": 40})],
                 None, True, None, pg)

def t_chucheon(q, pg):
    return track("고교추천전형", "학생부위주(교과)", None, q,
                 "소속 고등학교장의 추천을 받은 2027년 2월 국내 고등학교 졸업예정자",
                 [stage("일괄합산", {"학생부(교과)": 51.7, "면접": 48.3})],
                 "1개 영역 4등급 이내 (국어, 수학, 영어, 탐구(1과목) 중)", False,
                 CSAT_AREAS, pg)

def t_woosu(q, pg, nurse=False):
    raw = "2개 영역 합 6등급 이내" if nurse else "2개 영역 합 7등급 이내"
    raw += " (국어, 수학, 영어, 탐구(1과목) 중)"
    return track("교과우수전형", "학생부위주(교과)", None, q,
                 "고등학교 졸업(예정)자 또는 법령상 동등 학력 인정자",
                 [stage("일괄합산", {"학생부(교과)": 100})],
                 raw, False, CSAT_AREAS, pg)

def t_gihoe(q, pg):
    return track("기회균형특별전형", "학생부위주(교과)", "기회균형", q,
                 "국가보훈대상자, 농어촌학생, 기초생활수급자/차상위계층/한부모가족, 서해5도, 특성화고 등을 졸업한 재직자 등 (전형별 자격요건 충족자)",
                 [stage("일괄합산", {"학생부(교과)": 100})],
                 None, True, None, pg)

def t_goun(q, pg):
    return track("고운사회전형", "학생부위주(교과)", "사회배려", q,
                 "본교가 정한 사회배려대상자 자격요건 충족자",
                 [stage("일괄합산", {"학생부(교과)": 100})],
                 None, True, None, pg)

# 정원외
def t_nongeochon(q, pg):
    return track("농어촌학생전형(정원외)", "학생부위주(교과)", "농어촌학생", q,
                 "농어촌 소재지 6년(중·고) 또는 12년(초·중·고) 거주 및 교육과정 이수자",
                 [stage("일괄합산", {"학생부(교과)": 100})],
                 None, True, None, pg)

def t_teukseong_jol(q, pg):
    return track("특성화고졸업자전형(정원외)", "학생부위주(교과)", "특성화고졸업자", q,
                 "특성화고등학교 졸업(예정)자 중 지원 모집단위 관련 기준학과 이수자",
                 [stage("일괄합산", {"학생부(교과)": 100})],
                 None, True, None, pg)

def t_teukseong_jik(q, pg):
    return track("특성화고 등을 졸업한 재직자 전형(정원외)", "학생부위주(교과)", "특성화고재직자", q,
                 "특성화고 등을 졸업하고 산업체에서 일정 기간 재직 중인 자",
                 [stage("일괄합산", {"학생부(교과)": 100})],
                 None, True, None, pg)

def t_jaeoe(q, pg):
    # 재외국민/북한이탈 합산 컬럼 (정원외) - 면접 100%
    return track("재외국민·북한이탈주민전형(정원외)", "학생부위주(종합)", "재외국민", q,
                 "재외국민과 외국인 특별전형(2년/12년 등) 및 북한이탈주민 자격요건 충족자",
                 [stage("일괄합산", {"면접": 100})],
                 None, True, None, pg)

# 실기우수자(종목별 학생부:실기 비율 상이)
SILGI_RATIO = {
    "체육": {"학생부(교과)": 11.8, "실기": 88.2},
    "미술": {"학생부(교과)": 11.1, "실기": 88.9},
    "음악": {"실기": 100},
    "영화예술": {"학생부(교과)": 17.6, "실기": 82.4},
    "연기예술": {"학생부(교과)": 17.6, "실기": 82.4},
}
def t_silgi(q, pg, kind):
    comps = SILGI_RATIO.get(kind, {"학생부(교과)": 11.1, "실기": 88.9})
    return track("실기우수자전형", "실기/실적위주", "실기우수자", q,
                 "고등학교 졸업(예정)자 또는 법령상 동등 학력 인정자(검정고시 가능). 해당 실기종목 응시",
                 [stage("일괄합산", comps)],
                 None, True, None, pg)

# 농어촌(연기예술) 별도 (연기예술 정원외 2명)
def t_nong_yeongi(q, pg):
    return track("농어촌학생전형(연기예술)(정원외)", "실기/실적위주", "농어촌학생", q,
                 "농어촌 소재지 거주·이수 요건 충족자 중 연기예술 실기 응시자",
                 [stage("일괄합산", {"학생부(교과)": 17.6, "실기": 82.4})],
                 None, True, None, pg)

# ============ 부서 정의 ============
# (departmentName, college, trackHint, 입정, page, grid_dict)
# grid_dict 키: nonsul,myeonjeop,chucheon,woosu,gihoe,goun,silgi,nong,tjol,tjik,jaeoe
DEPTS = []

def add(name, college, hint, ipjeong, pg, g, **opts):
    DEPTS.append((name, college, hint, ipjeong, pg, g, opts))

# --- page 15 (정원내+정원외 일반) ---
add("자유전공학부", "자유전공학부", "인문", 160, [15],
    {"myeonjeop":20,"chucheon":15,"woosu":30,"gihoe":15,"goun":5,"nong":10,"jaeoe":3})
add("인문사회융합대학 인문계열(한국언어문화/영미언어문화/일본언어문화/중국언어문화/러시아언어문화/법학/행정학/미디어커뮤니케이션/디지털헤리티지)",
    "인문사회융합대학", "인문", 222, [15],
    {"nonsul":70,"myeonjeop":20,"chucheon":15,"woosu":30,"gihoe":15,"goun":5,"nong":15,"jaeoe":4})
add("경영공학대학(경영/글로벌비즈니스/회계/경제금융/호텔관광외식경영)",
    "경영공학대학", "인문", 210, [15],
    {"nonsul":63,"myeonjeop":20,"chucheon":10,"woosu":30,"gihoe":11,"goun":5,"nong":15,"tjol":11,"tjik":40,"jaeoe":4})
add("바이오공학과", "혁신공과대학", "자연", 40, [15],
    {"nonsul":8,"myeonjeop":8,"chucheon":3,"woosu":2,"gihoe":2,"goun":2,"nong":2,"tjol":2})
add("건설환경에너지공학부(건설환경공학/환경에너지공학)", "혁신공과대학", "자연", 94, [15],
    {"nonsul":30,"myeonjeop":10,"chucheon":8,"woosu":10,"gihoe":3,"goun":2,"nong":3,"tjol":3})
add("건축학과", "혁신공과대학", "자연", 42, [15],
    {"nonsul":14,"myeonjeop":5,"chucheon":2,"woosu":4,"gihoe":2,"goun":1,"nong":2,"tjol":2})
add("도시부동산학과", "혁신공과대학", "자연", 30, [15],
    {"nonsul":8,"myeonjeop":4,"chucheon":2,"woosu":3,"gihoe":2,"goun":1,"nong":2,"tjol":1})
add("기계공학부", "혁신공과대학", "자연", 60, [15],
    {"nonsul":15,"myeonjeop":10,"chucheon":5,"woosu":5,"gihoe":2,"goun":2,"nong":3,"tjol":3,"jaeoe":4})
add("반도체공학과", "혁신공과대학", "자연", 50, [15],
    {"nonsul":15,"myeonjeop":8,"chucheon":3,"woosu":5,"gihoe":2,"goun":2,"nong":3})
add("전기전자공학부(전기공학/전자공학/정보통신공학)", "혁신공과대학", "자연", 135, [15],
    {"nonsul":50,"myeonjeop":10,"chucheon":10,"woosu":10,"gihoe":4,"goun":4,"nong":5,"tjol":3})
add("화학공학·신소재공학부(화학공학/신소재공학)", "혁신공과대학", "자연", 90, [15],
    {"nonsul":30,"myeonjeop":10,"chucheon":6,"woosu":13,"gihoe":4,"goun":2,"nong":3})
add("소방재난공학과", "혁신공과대학", "자연", 25, [15],
    {"nonsul":5,"myeonjeop":4,"chucheon":3,"woosu":3,"gihoe":1,"goun":1,"nong":1})
add("AI데이터과학부(AI빅데이터/AI소프트웨어)", "지능형SW융합대학", "자연", 90, [15],
    {"nonsul":32,"myeonjeop":10,"chucheon":6,"woosu":11,"gihoe":4,"goun":2,"nong":4})
add("컴퓨터공학부(컴퓨터공학)", "지능형SW융합대학", "자연", 90, [15],
    {"nonsul":32,"myeonjeop":10,"chucheon":6,"woosu":11,"gihoe":4,"goun":2,"nong":4,"tjol":3,"jaeoe":3})
add("지능형보안학부(정보보안/보안관리)", "지능형SW융합대학", "자연", 50, [15],
    {"nonsul":12,"myeonjeop":10,"chucheon":3,"woosu":5,"gihoe":2,"goun":2,"nong":2,"tjol":3})

# --- page 16 ---
add("간호학과", "라이프케어사이언스대학", "자연", 104, [16],
    {"nonsul":25,"myeonjeop":10,"chucheon":10,"woosu":20,"gihoe":3,"goun":1,"nong":3}, nurse=True)
add("아동가족복지학과", "라이프케어사이언스대학", "자연", 35, [16],
    {"nonsul":5,"myeonjeop":8,"chucheon":3,"woosu":5,"gihoe":2,"goun":1,"nong":2})
add("의류학과", "라이프케어사이언스대학", "자연", 30, [16],
    {"nonsul":5,"myeonjeop":8,"chucheon":2,"woosu":3,"gihoe":2,"goun":1,"nong":2,"jaeoe":4})
add("식품영양학과", "라이프케어사이언스대학", "자연", 35, [16],
    {"nonsul":5,"myeonjeop":8,"chucheon":3,"woosu":5,"gihoe":2,"goun":1,"nong":2})
# 실기 계열
add("스포츠과학부(체육학/레저스포츠/운동건강관리)", "라이프케어사이언스대학", "예체능", 105, [16],
    {"silgi":45}, silgi_kind="체육")
add("조형예술학부(회화(한국화/서양화)/조소)", "디자인앤아트대학", "예체능", 90, [16],
    {"silgi":60}, silgi_kind="미술")
add("디자인학부 커뮤니케이션디자인", "디자인앤아트대학", "예체능", 50, [16],
    {"silgi":33}, silgi_kind="미술")
add("디자인학부 패션디자인", "디자인앤아트대학", "예체능", 30, [16],
    {"silgi":20}, silgi_kind="미술")
add("디자인학부 공예디자인", "디자인앤아트대학", "예체능", 25, [16],
    {"silgi":17}, silgi_kind="미술")
add("아트앤테크놀로지작곡과", "음악테크놀로지대학", "예체능", 20, [16],
    {"silgi":15}, silgi_kind="음악")
add("성악과", "음악테크놀로지대학", "예체능", 30, [16],
    {"silgi":10}, silgi_kind="음악")
add("피아노과", "음악테크놀로지대학", "예체능", 40, [16],
    {"silgi":15}, silgi_kind="음악")
add("관현악과", "음악테크놀로지대학", "예체능", 50, [16],
    {"silgi":25}, silgi_kind="음악")
add("국악과", "음악테크놀로지대학", "예체능", 22, [16],
    {"silgi":22}, silgi_kind="음악")
add("영화예술", "문화예술융합대학", "예체능", 25, [16],
    {"silgi":18}, silgi_kind="영화예술")
add("연기예술", "문화예술융합대학", "예체능", 25, [16],
    {"silgi":18,"nong":2}, silgi_kind="연기예술", nong_is_yeongi=True)
add("디지털콘텐츠", "문화예술융합대학", "인문", 25, [16],
    {"nonsul":10})
add("글로벌자유전공학부", "글로벌인재대학", "인문", 1, [16],
    {})  # 정원내 0 (정시/수시 미배정 표기), 실제 모집인원 없음

# ============ build tracks ============
TRACK_BUILDERS = {
    "nonsul": lambda q,pg,o: t_nonsul(q,pg),
    "myeonjeop": lambda q,pg,o: t_myeonjeop(q,pg),
    "chucheon": lambda q,pg,o: t_chucheon(q,pg),
    "woosu": lambda q,pg,o: t_woosu(q,pg,nurse=o.get("nurse",False)),
    "gihoe": lambda q,pg,o: t_gihoe(q,pg),
    "goun": lambda q,pg,o: t_goun(q,pg),
    "tjol": lambda q,pg,o: t_teukseong_jol(q,pg),
    "tjik": lambda q,pg,o: t_teukseong_jik(q,pg),
    "jaeoe": lambda q,pg,o: t_jaeoe(q,pg),
}
# 정원내 컬럼(계 산입)
INTERNAL_COLS = {"nonsul","myeonjeop","chucheon","woosu","gihoe","goun","silgi"}
EXTERNAL_COLS = {"nong","tjol","tjik","jaeoe"}

departments = []
warnings = []
col_computed = {k:0 for k in
    ["nonsul","myeonjeop","chucheon","woosu","gihoe","goun","silgi","nong","tjol","tjik","jaeoe"]}
row_fail = []

STATED_COL = {  # from 전형별 소계 (line 827)
    "nonsul":434,"myeonjeop":193,"chucheon":115,"woosu":205,"gihoe":82,"goun":42,
    "silgi":298,"nong":85,"tjol":31,"tjik":40,"jaeoe":22}
COL_TRACKNAME = {
    "nonsul":"교과논술전형","myeonjeop":"면접위주교과전형","chucheon":"고교추천전형",
    "woosu":"교과우수전형","gihoe":"기회균형특별전형","goun":"고운사회전형",
    "silgi":"실기우수자전형","nong":"농어촌학생전형(정원외)","tjol":"특성화고졸업자전형(정원외)",
    "tjik":"특성화고 등을 졸업한 재직자 전형(정원외)","jaeoe":"재외국민·북한이탈주민전형(정원외)"}

for name, college, hint, ipjeong, pg, g, opts in DEPTS:
    tracks = []
    internal_sum = 0
    silgi_kind = opts.get("silgi_kind", "미술")
    nong_is_yeongi = opts.get("nong_is_yeongi", False)
    # ordered build
    for col in ["nonsul","myeonjeop","chucheon","woosu","gihoe","goun"]:
        if col in g:
            q = g[col]
            tracks.append(TRACK_BUILDERS[col](q, pg, opts))
            col_computed[col]+=q
            if col in INTERNAL_COLS: internal_sum+=q
    if "silgi" in g:
        q=g["silgi"]; tracks.append(t_silgi(q,pg,silgi_kind))
        col_computed["silgi"]+=q; internal_sum+=q
    # 정원외
    if "nong" in g:
        q=g["nong"]
        if nong_is_yeongi:
            tracks.append(t_nong_yeongi(q,pg))
        else:
            tracks.append(t_nongeochon(q,pg))
        col_computed["nong"]+=q
    if "tjol" in g:
        q=g["tjol"]; tracks.append(t_teukseong_jol(q,pg)); col_computed["tjol"]+=q
    if "tjik" in g:
        q=g["tjik"]; tracks.append(t_teukseong_jik(q,pg)); col_computed["tjik"]+=q
    if "jaeoe" in g:
        q=g["jaeoe"]; tracks.append(t_jaeoe(q,pg)); col_computed["jaeoe"]+=q

    departments.append({
        "departmentName": name,
        "campus": "수원(화성) 캠퍼스",
        "trackHint": hint,
        "totalQuotaHint": internal_sum,  # 계(정원내). 정원외 제외
        "tracks": tracks,
    })

# ---- row sum validation: 정원내 트랙 합 == 표의 계(정원내) ----
STATED_ROW = {  # 계(정원내) per dept from 총괄표
    "자유전공학부":85,
    "인문사회융합대학 인문계열(한국언어문화/영미언어문화/일본언어문화/중국언어문화/러시아언어문화/법학/행정학/미디어커뮤니케이션/디지털헤리티지)":155,
    "경영공학대학(경영/글로벌비즈니스/회계/경제금융/호텔관광외식경영)":139,
    "바이오공학과":25,"건설환경에너지공학부(건설환경공학/환경에너지공학)":63,"건축학과":28,
    "도시부동산학과":20,"기계공학부":39,"반도체공학과":35,
    "전기전자공학부(전기공학/전자공학/정보통신공학)":88,"화학공학·신소재공학부(화학공학/신소재공학)":65,
    "소방재난공학과":17,"AI데이터과학부(AI빅데이터/AI소프트웨어)":65,"컴퓨터공학부(컴퓨터공학)":65,
    "지능형보안학부(정보보안/보안관리)":34,"간호학과":69,"아동가족복지학과":24,"의류학과":21,
    "식품영양학과":24,"스포츠과학부(체육학/레저스포츠/운동건강관리)":45,"조형예술학부(회화(한국화/서양화)/조소)":60,
    "디자인학부 커뮤니케이션디자인":33,"디자인학부 패션디자인":20,"디자인학부 공예디자인":17,
    "아트앤테크놀로지작곡과":15,"성악과":10,"피아노과":15,"관현악과":25,"국악과":22,
    "영화예술":18,"연기예술":18,"디지털콘텐츠":10,"글로벌자유전공학부":0,
}
passed=0; failed=0; failedList=[]
for d in departments:
    nm=d["departmentName"]; comp=d["totalQuotaHint"]; st=STATED_ROW.get(nm)
    if st is not None and comp==st:
        passed+=1
    else:
        failed+=1; failedList.append({"dept":nm,"computed":comp,"stated":st})

colTotalValidation=[]
all_col_match=True
for col in ["nonsul","myeonjeop","chucheon","woosu","gihoe","goun","silgi","nong","tjol","tjik","jaeoe"]:
    comp=col_computed[col]; st=STATED_COL[col]; m=(comp==st)
    all_col_match&=m
    colTotalValidation.append({"track":COL_TRACKNAME[col],"computed":comp,"stated":st,"match":m})

checksum = (failed==0) and all_col_match

warnings.append("총괄표 컬럼 정렬은 pdftotext -bbox-layout word x좌표로 매핑(페이지15/16 헤더 오프셋 상이). 11개 전형 컬럼 모두 stated 일치.")
warnings.append("재외국민·북한이탈주민전형은 총괄표에서 단일 컬럼(소계22)으로만 채워져 재외국민(2년/12년)·북한이탈 분리 불가 → 합산 1트랙으로 표기. 정원외이므로 totalQuotaHint(계 정원내)에서 제외.")
warnings.append("농어촌학생/특성화고졸업자/특성화고재직자/재외국민·북한이탈 전형은 정원외 → totalQuotaHint(계 정원내)에 미산입. 연기예술 농어촌 2명도 정원외.")
warnings.append("인문계열·경영공학대학·전기전자공학부 등은 계열/학부 단위 광역모집(세부 모집단위 괄호 병기). 모집인원은 그룹 단위.")
warnings.append("글로벌자유전공학부: 입학정원1, 계(정원내)0 → 수시 모집인원 없음(전 전형 0). totalQuotaHint=0.")
warnings.append("교과논술전형 학생부:논술 실질25:75(명목20:80). 면접위주교과 2단계 학생부60+면접40. 고교추천 실질 학생부51.7+면접48.3(명목60:40). 실기우수자 종목별 학생부:실기 비율 상이(체육11.8:88.2/미술11.1:88.9/음악0:100/영화·연기17.6:82.4).")

result = {
    "universityName": UNIV, "year": YEAR, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}
meta = {
    "universityName": UNIV, "universityId": UID, "year": YEAR,
    "recruitmentSeason": "susi", "sourceDocYear": YEAR,
    "campusScope": "수원대학교 단일 캠퍼스(경기 화성시 봉담읍) — 전 모집단위 동일 캠퍼스",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0,
    "departments": len(departments),
    "totalTracks": sum(len(d["tracks"]) for d in departments),
    "rowSumValidation": {
        "basis": "totalQuotaHint(모집단위별 수시 전형 인원 합)",
        "passed": passed, "failed": failed, "failedList": failedList,
    },
    "colTotalValidation": colTotalValidation,
    "checksumPassed": checksum,
}

out = {"meta": meta, "result": result}
with open("scripts/etl/text-extract-test/suwon-text.json","w",encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print("departments:", len(departments))
print("totalTracks:", meta["totalTracks"])
print("rowSum passed/failed:", passed, failed)
print("colMatch all:", all_col_match)
print("checksum:", checksum)
print("grand internal (sum totalQuotaHint):", sum(d["totalQuotaHint"] for d in departments))
