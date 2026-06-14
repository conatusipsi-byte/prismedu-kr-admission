#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
세종대학교 2027 수시 모집요강 → 구조화 JSON
SLUG=kcue_0000138  campus=서울(광진) 단일
입력: univ/susi-2027/kcue_0000138.txt(+.pdf)
출력: scripts/etl/text-extract-test/sejong-text.json

설계 메모(이중 체크섬):
 - p6 '전형별 모집인원' 총괄표를 컬럼위치(body grid)로 파싱 → 열합 == 원문 계행(398/23/364/260/99/42/3/120/16/32/24/344/119/13, 총 1857) 검증 통과 확인.
 - 행합: 각 모집단위 totalQuotaHint = 해당 행 track quota 합 (정의상 일치 → failed 0).
 - 세종 특이구조: 세종인재(서류형)/기회균형/사회기여및배려자 는 '계열 선발(유형2)' →
   인문사회계열·경상호텔관광계열·자연생명계열·IT계열·첨단융합계열·공과계열 + 첨단학과 개별행에 분산. 모두 모집단위로 보존.
 - 수능최저: 교과(지역균형)·논술·항공시스템공학(공군) 만 최저 있음. 종합/실기 전부 최저없음.
"""
import json
from pathlib import Path

UNIV = "세종대학교"
SLUG = "kcue_0000138"
OUT = Path("scripts/etl/text-extract-test/sejong-text.json")

# ── 전형 공통 정의 ──────────────────────────────────────────────
# trackName / trackTypeRaw / specialTypeKeyword / 수능최저 / reflectionStages 템플릿 / sourcePages
# 종합 서류형 일괄(서류평가 100%)
def stage_seoryu_only():
    return [{"stageLabel": "일괄합산", "multiplier": None,
             "components": {"서류종합평가": 100}, "stageMaxScore": 1000}]

def stage_myeonjeop():  # 세종인재 면접형: 1단계 서류100[3배수], 2단계 1단계60+면접40
    return [
        {"stageLabel": "1단계", "multiplier": 3, "components": {"서류종합평가": 100}, "stageMaxScore": 600},
        {"stageLabel": "2단계", "multiplier": None, "components": {"1단계 성적": 60, "면접": 40}, "stageMaxScore": 1000},
    ]

# ── 모집인원 그리드 (p6) : 모집단위 → {전형키: 인원} ─────────────
# 전형키: jiyeok(지역균형), hanggong(항공시스템), myeon(세종면접형), seoryu(세종서류형),
#  gihoe(기회균형), sahoe(사회기여배려자), seohae(서해5도), jaejik(특성화고졸재직),
#  cyber(사이버국방), haegun(국방AI융합시스템), haebyeong(국방AI로봇융합),
#  nonsul(논술우수자), silgi(실기우수자), teukgi(예체능특기자)
# (열합 검증을 코드 끝에서 재수행)
GRID = [
    # (모집단위명, campus 항상 서울, trackHint, {전형키:인원})
    ("자유전공학부",                 "자연", {"jiyeok":122, "nonsul":71}),
    ("인문사회계열",                 "인문", {"seoryu":30, "gihoe":9, "sahoe":6}),
    ("국어국문학과",                 "인문", {"jiyeok":5, "myeon":5, "nonsul":5}),
    ("국제학부",                     "인문", {"jiyeok":10, "myeon":15, "nonsul":10}),
    ("역사학과",                     "인문", {"myeon":6, "nonsul":6}),
    ("교육학과",                     "인문", {"jiyeok":5, "myeon":5, "nonsul":5}),
    ("행정학과",                     "인문", {"jiyeok":4, "myeon":4, "nonsul":3}),
    ("미디어커뮤니케이션학과",       "인문", {"jiyeok":4, "myeon":4, "nonsul":4}),
    ("법학과",                       "인문", {"jiyeok":4, "myeon":4, "nonsul":4}),
    ("경상호텔관광계열",             "인문", {"seoryu":30, "gihoe":15, "sahoe":5}),
    ("경영학부",                     "인문", {"jiyeok":10, "myeon":12, "seohae":1, "nonsul":9}),
    ("경제학과",                     "인문", {"jiyeok":4, "myeon":5, "nonsul":4}),
    ("호텔관광외식경영학부",         "인문", {"jiyeok":12, "myeon":14, "nonsul":9}),
    ("호텔외식관광프랜차이즈경영학과", "인문", {"jaejik":61}),
    ("조리서비스경영학과",           "인문", {"jaejik":59}),
    ("자연생명계열",                 "자연", {"seoryu":31, "gihoe":11, "sahoe":6}),
    ("수학통계학과",                 "자연", {"jiyeok":4, "myeon":5, "nonsul":7}),
    ("물리천문학과",                 "자연", {"jiyeok":6, "myeon":10, "nonsul":7}),
    ("화학과",                       "자연", {"jiyeok":4, "myeon":5, "nonsul":4}),
    ("생명시스템학부",               "자연", {"jiyeok":12, "myeon":17, "nonsul":12}),
    ("스마트생명산업융합학과",       "자연", {"jiyeok":4, "myeon":4, "seoryu":4, "nonsul":4}),
    ("IT계열",                       "자연", {"seoryu":30, "gihoe":14, "sahoe":5}),
    ("AI융합전자공학과",             "자연", {"jiyeok":9, "myeon":11, "nonsul":11}),
    ("반도체시스템공학과",           "자연", {"jiyeok":5, "myeon":6, "nonsul":6}),
    ("컴퓨터공학과",                 "자연", {"jiyeok":10, "myeon":12, "seohae":1, "nonsul":10}),
    ("정보보호학과",                 "자연", {"jiyeok":4, "myeon":5, "nonsul":4}),
    ("양자지능정보학과",             "자연", {"jiyeok":8, "myeon":5, "seoryu":7, "gihoe":5, "nonsul":5}),
    ("창의소프트학부 디자인이노베이션전공", "예체능", {"myeon":48}),
    ("창의소프트학부 만화애니메이션텍전공", "예체능", {"myeon":48}),
    ("사이버국방학과(육군)",         "자연", {"cyber":16}),
    ("국방AI로봇융합공학과(해병대)", "자연", {"haebyeong":24}),
    ("첨단융합계열",                 "자연", {"seoryu":50}),
    ("인공지능데이터사이언스학과",   "자연", {"jiyeok":22, "myeon":10, "seoryu":5, "gihoe":5, "sahoe":4, "nonsul":18}),
    ("AI로봇학과",                   "자연", {"jiyeok":30, "myeon":14, "seoryu":7, "gihoe":7, "sahoe":4, "seohae":1, "nonsul":24}),
    ("지능정보융합학과",             "자연", {"jiyeok":22, "myeon":9, "seoryu":5, "gihoe":5, "sahoe":4, "nonsul":17}),
    ("콘텐츠소프트웨어학과",         "자연", {"jiyeok":14, "myeon":6, "seoryu":5, "gihoe":4, "nonsul":12}),
    ("공과계열",                     "자연", {"seoryu":50, "gihoe":20, "sahoe":8}),
    ("건축공학과",                   "자연", {"jiyeok":7, "myeon":8, "nonsul":6}),
    ("건축학과(5년)",                "자연", {"jiyeok":4, "myeon":6, "nonsul":5}),
    ("건설환경공학과",               "자연", {"jiyeok":6, "myeon":9, "nonsul":9}),
    ("환경융합공학과",               "자연", {"jiyeok":6, "myeon":8, "nonsul":6}),
    ("에너지자원공학과",             "자연", {"jiyeok":7, "myeon":8, "nonsul":8}),
    ("기계공학과",                   "자연", {"jiyeok":6, "myeon":8, "nonsul":7}),
    ("우주항공시스템공학부 우주항공공학전공", "자연", {"jiyeok":4, "myeon":6, "nonsul":5}),
    ("우주항공시스템공학부 지능형드론융합전공", "자연", {"jiyeok":17, "myeon":7, "seoryu":6, "gihoe":4, "nonsul":12}),
    ("우주항공시스템공학부 항공시스템공학전공(공군)", "자연", {"hanggong":23}),
    ("나노신소재공학과",             "자연", {"jiyeok":7, "myeon":9, "nonsul":8}),
    ("양자원자력공학과",             "자연", {"myeon":6, "nonsul":7}),
    ("국방AI융합시스템공학과(해군)", "자연", {"haegun":32}),
    ("음악과",                       "예체능", {"silgi":38}),
    ("체육학과",                     "예체능", {"teukgi":13}),
    ("무용과",                       "예체능", {"silgi":36}),
    ("영화예술학과",                 "예체능", {"silgi":45}),
]

# 원문 계행(열합 기대값) — p6
COL_EXPECTED = {
    "jiyeok":398, "hanggong":23, "myeon":364, "seoryu":260, "gihoe":99, "sahoe":42,
    "seohae":3, "jaejik":120, "cyber":16, "haegun":32, "haebyeong":24, "nonsul":344,
    "silgi":119, "teukgi":13,
}
COL_LABEL = {
    "jiyeok":"학생부교과(지역균형 전형)",
    "hanggong":"학생부교과(항공시스템공학 특별전형)",  # 공군 계약(정원외)
    "myeon":"학생부종합(세종인재 전형(면접형))",
    "seoryu":"학생부종합(세종인재 전형(서류형))",
    "gihoe":"학생부종합(기회균형 전형)",
    "sahoe":"학생부종합(사회기여 및 배려자 전형)",
    "seohae":"학생부종합(서해5도학생 특별전형)",
    "jaejik":"학생부종합(특성화고교졸 재직자 특별전형)",
    "cyber":"학생부종합(사이버국방 특별전형)",
    "haegun":"학생부종합(국방AI융합시스템공학 특별전형)",
    "haebyeong":"학생부종합(국방AI로봇융합공학 특별전형)",
    "nonsul":"논술(논술우수자 전형)",
    "silgi":"실기/실적(실기우수자 전형)",
    "teukgi":"실기/실적(예체능특기자 전형)",
}

# ── 전형별 공통 속성 빌더 ───────────────────────────────────────
CSAT_JIYEOK_FREE = ("국어, 수학, 영어, 탐구(사회/과학탐구 중 1과목) 중 2개 영역 등급의 합이 5 이내",
                    "국어, 수학, 영어, 탐구(사회/과학 중 1과목)")
CSAT_JIYEOK_OTHER = ("국어, 수학, 영어, 탐구(사회/과학탐구 중 1과목) 중 2개 영역 등급의 합이 6 이내",
                     "국어, 수학, 영어, 탐구(사회/과학 중 1과목)")
CSAT_NONSUL = ("국어, 수학, 영어, 탐구(사회/과학탐구 중 1과목) 중 2개 영역 등급의 합이 5 이내",
               "국어, 수학, 영어, 탐구(사회/과학 중 1과목)")
CSAT_HANGGONG = ("국어, 수학, 영어, 탐구(사회/과학 중 1과목) 중 3개 영역 등급의 합 10 이내",
                 "국어, 수학, 영어, 탐구(사회/과학 중 1과목)")

def build_track(key, dept_name, quota):
    """전형키 + 모집단위명 + 인원 → track dict"""
    label = COL_LABEL[key]
    t = {
        "trackName": label,
        "trackTypeRaw": None,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": None,
        "quotaInitial": quota,
        "applicationQualification": None,
        "reflectionStages": [],
        "csatMinimumRawText": "없음",
        "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None,
        "prevYearResult": None,
        "sourcePages": [],
    }
    if key == "jiyeok":
        t["trackTypeRaw"] = "학생부위주(교과)"
        # 자유전공학부=2개합5, 그 외 인문/자연계열=2개합6
        if dept_name == "자유전공학부":
            t["csatMinimumRawText"], t["csatRequiredAreasRawText"] = CSAT_JIYEOK_FREE
        else:
            t["csatMinimumRawText"], t["csatRequiredAreasRawText"] = CSAT_JIYEOK_OTHER
        t["csatMinimumExempt"] = False
        comp = {"학생부(교과)": 100}
        t["reflectionStages"] = [{"stageLabel":"일괄합산","multiplier":None,"components":comp,"stageMaxScore":1000}]
        t["applicationQualification"] = ("국내 정규 고등학교 졸업(예정)자로 3학년 1학기까지 5개 학기 이상 학교생활기록부 성적이 "
            "있고 반영교과 석차등급이 있는 자 중 학교장 추천을 받은 자. 추천인원 제한 없음. "
            "예술(체육)고·마이스터고·특성화고·일반고 대안/직업교육위탁생·방송통신고·대안학교·검정고시·국외고 출신자는 지원 불가.")
        t["sourcePages"] = [6, 11, 12]
    elif key == "hanggong":
        t["trackTypeRaw"] = "학생부위주(교과)"
        t["specialTypeKeyword"] = "공군계약학과(정원외)"
        t["csatMinimumRawText"], t["csatRequiredAreasRawText"] = CSAT_HANGGONG
        t["csatMinimumExempt"] = False
        # 1단계 학생부(교과)100%[5배수], 2단계 1단계100%+공군본부주관(합/불)
        t["reflectionStages"] = [
            {"stageLabel":"1단계","multiplier":5,"components":{"학생부(교과)":100},"stageMaxScore":1000},
            {"stageLabel":"2단계","multiplier":None,"components":{"1단계 성적":100,"공군본부주관전형(합·불)":0},"stageMaxScore":1000},
        ]
        t["applicationQualification"] = ("국내 정규 고등학교 졸업(예정)자로 반영교과 석차등급 산출이 가능한 자. "
            "공군과 협약에 의해 설치·운영되는 장교(조종장교) 채용조건형 계약학과. 임관일 기준 만 20~29세, "
            "군인사법 제10조 결격사유 비해당, 재정보증보험 가입 가능자. 검정고시·국외고 출신자 지원 불가. 학교폭력 조치(1~9호) 지원 불가.")
        t["sourcePages"] = [6, 30]
    elif key == "myeon":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["reflectionStages"] = stage_myeonjeop()
        t["applicationQualification"] = "고등학교 졸업(예정)자 및 법령에 의하여 이와 동등 이상의 학력이 인정된 자. (서류평가+면접) 종합평가. 창의소프트학부는 제시문 기반 면접."
        t["sourcePages"] = [6, 13, 14]
    elif key == "seoryu":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["reflectionStages"] = stage_seoryu_only()
        t["applicationQualification"] = "고등학교 졸업(예정)자 및 법령에 의하여 이와 동등 이상의 학력이 인정된 자. 서류평가 100%(계열/학과 선발)."
        t["sourcePages"] = [6, 15]
    elif key == "gihoe":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["specialTypeKeyword"] = "기회균형(국가보훈/기초·차상위/농어촌/특성화고/만학도/북한이탈)"
        t["reflectionStages"] = stage_seoryu_only()
        t["applicationQualification"] = ("①국가보훈대상자 ②기초생활수급(권)자·차상위·한부모 ③농어촌학생(6년 또는 12년) "
            "④특성화고 졸업자 ⑤만학도(만30세 이상) ⑥북한이탈주민/제3국출생자녀 중 하나에 해당하는 자. 서류평가 100%.")
        t["sourcePages"] = [6, 16, 17]
    elif key == "sahoe":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["specialTypeKeyword"] = "사회기여및배려자"
        t["reflectionStages"] = stage_seoryu_only()
        t["applicationQualification"] = ("①직업군인·경찰·소방공무원 20년 이상 근무자의 자녀 ②다자녀(3자녀 이상) 가정 자녀 "
            "③다문화 가정 자녀 ④장애인 부모(장애의 정도가 심한 장애인)의 자녀 중 하나. 서류평가 100%.")
        t["sourcePages"] = [6, 18]
    elif key == "seohae":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["specialTypeKeyword"] = "서해5도학생"
        t["reflectionStages"] = stage_seoryu_only()
        t["applicationQualification"] = ("서해5도(백령·대청·소청·연평·소연평도) 소재 고교 졸업(예정)자로 유형1(6년) 또는 "
            "유형2(12년) 거주·이수 요건 충족자. 서류평가 100%.")
        t["sourcePages"] = [6, 19]
    elif key == "jaejik":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["specialTypeKeyword"] = "특성화고교졸재직자(정원외, 전형기간 자율화)"
        t["reflectionStages"] = stage_seoryu_only()
        t["applicationQualification"] = ("고등교육법 시행령 제29조제2항14호 다목에 따라 산업체 3년 이상 재직 중인 자로서 "
            "특성화고/마이스터고/일반고 직업교육위탁(1년 이상)/학력인정 평생교육시설 졸업·이수자. 서류평가 100%. 성인학습자 전담학과(정원외).")
        t["sourcePages"] = [6, 20]
    elif key == "cyber":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["specialTypeKeyword"] = "육군계약학과(정원외)"
        # 1단계 서류100[3배수], 2단계 1단계80+면접10+체력검정10 + 육군본부주관(합/불)
        t["reflectionStages"] = [
            {"stageLabel":"1단계","multiplier":3,"components":{"서류종합평가":100},"stageMaxScore":800},
            {"stageLabel":"2단계","multiplier":None,
             "components":{"1단계 성적":80,"면접":10,"체력검정":10,"육군본부주관(신체·인성·신원 합·불)":0},"stageMaxScore":1000},
        ]
        t["applicationQualification"] = ("고등학교 졸업(예정)자 및 동등 학력 인정자. 육군과 협약에 의해 설치·운영되는 채용조건형 계약학과. "
            "임관일 기준 만 20~29세, 군인사법 제10조 결격사유 비해당, 재정보증보험 가입 가능자. 학교폭력 조치(1~9호) 지원 불가.")
        t["sourcePages"] = [6, 39]
    elif key == "haegun":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["specialTypeKeyword"] = "해군계약학과(정원외)"
        t["reflectionStages"] = [
            {"stageLabel":"1단계","multiplier":3,"components":{"서류종합평가":100},"stageMaxScore":800},
            {"stageLabel":"2단계","multiplier":None,
             "components":{"1단계 성적":80,"면접":10,"체력검정":10,"해군본부주관(신체·인성·신원 합·불)":0},"stageMaxScore":1000},
        ]
        t["applicationQualification"] = ("고등학교 졸업(예정)자 및 동등 학력 인정자. 해군과 협약에 의해 설치·운영되는 장교(해군장교) 채용조건형 계약학과. "
            "임관일 기준 만 20~29세, 군인사법 제10조 결격사유 비해당, 재정보증보험 가입 가능자. 학교폭력 조치(1~9호) 지원 불가.")
        t["sourcePages"] = [6, 43]
    elif key == "haebyeong":
        t["trackTypeRaw"] = "학생부위주(종합)"
        t["specialTypeKeyword"] = "해병대계약학과(정원외)"
        t["reflectionStages"] = [
            {"stageLabel":"1단계","multiplier":3,"components":{"서류종합평가":100},"stageMaxScore":800},
            {"stageLabel":"2단계","multiplier":None,
             "components":{"1단계 성적":80,"면접(해병대 주관 P/F 동시진행)":10,"체력검정":10,"해병대본부주관(신체·인성·신원 합·불)":0},"stageMaxScore":1000},
        ]
        t["applicationQualification"] = ("고등학교 졸업(예정)자 및 동등 학력 인정자. 해병대와 협약에 의해 설치·운영되는 장교(해병대 장교) 채용조건형 계약학과. "
            "임관일 기준 만 20~29세, 군인사법 제10조 결격사유 비해당, 재정보증보험 가입 가능자. 학교폭력 조치(1~9호) 지원 불가.")
        t["sourcePages"] = [6, 47]
    elif key == "nonsul":
        t["trackTypeRaw"] = "논술위주"
        t["csatMinimumRawText"], t["csatRequiredAreasRawText"] = CSAT_NONSUL
        t["csatMinimumExempt"] = False
        # 일괄합산 논술80% + 학생부(교과)20%
        t["reflectionStages"] = [{"stageLabel":"일괄합산","multiplier":None,
                                  "components":{"논술":80,"학생부(교과)":20},"stageMaxScore":1000}]
        t["applicationQualification"] = "고등학교 졸업(예정)자 및 법령에 의하여 이와 동등 이상의 학력이 인정된 자. 논술고사(통합교과형/인문논술/수리논술) 120분."
        t["sourcePages"] = [6, 28, 29]
    elif key == "silgi":
        t["trackTypeRaw"] = "실기/실적위주"
        t["specialTypeKeyword"] = "실기우수자"
        # 음악과/무용과: 일괄 학생부10+실기90. (영화예술학과는 단계형이나 grid상 영화예술학과는 silgi 45=연출23+연기22)
        # 음악·무용은 일괄합산. 영화예술학과는 dept별로 override 처리.
        t["reflectionStages"] = [{"stageLabel":"일괄합산","multiplier":None,
                                  "components":{"실기":90,"학생부(교과)":10},"stageMaxScore":1000}]
        t["applicationQualification"] = "고등학교 졸업(예정)자 또는 동등 학력 인정자. 음악과·무용과 실기고사."
        t["sourcePages"] = [6, 53]
    elif key == "teukgi":
        t["trackTypeRaw"] = "실기/실적위주"
        t["specialTypeKeyword"] = "예체능특기자"
        # 체육학과 종목별 상이: 골프/태권도/리듬체조/에어로빅=입상실적20+학생부20+실기60(일괄),
        #  양궁=입상실적80+학생부20, 축구=입상실적55+학생부45. 대표(일괄합산, 종목별 상이) → 주력(골프계열) 표기 + 비고는 자격에.
        t["reflectionStages"] = [{"stageLabel":"일괄합산","multiplier":None,
                                  "components":{"입상실적":20,"학생부(교과)":20,"실기":60},"stageMaxScore":1000}]
        t["applicationQualification"] = ("체육학과 특기분야(골프·태권도(겨루기)·축구(남)·리듬체조(여)·에어로빅체조·양궁(리커브)) 입상실적 보유자. "
            "전형요소 종목별 상이: 골프/태권도/리듬체조/에어로빅=입상실적20%+학생부(교과)20%+실기60%, "
            "양궁=입상실적80%+학생부(교과)20%, 축구=입상실적55%+학생부(교과)45%.")
        t["sourcePages"] = [6, 57]
    return t

# ── 모집단위(부서) 빌드 ─────────────────────────────────────────
departments = []
warnings = []
# 전형키 순서(원문 컬럼 순서)
KEY_ORDER = ["jiyeok","hanggong","myeon","seoryu","gihoe","sahoe","seohae","jaejik",
             "cyber","haegun","haebyeong","nonsul","silgi","teukgi"]

for dept_name, hint, cols in GRID:
    tracks = []
    for key in KEY_ORDER:
        if key in cols and cols[key]:
            tr = build_track(key, dept_name, cols[key])
            # 영화예술학과 실기우수자: 연출제작(23) + 연기예술(22) 단계형 → 두 track 으로 분리
            if dept_name == "영화예술학과" and key == "silgi":
                # 연출제작
                tracks.append({
                    "trackName":"실기/실적(실기우수자 전형) 연출제작","trackTypeRaw":"실기/실적위주",
                    "recruitmentPeriodRaw":"수시","specialTypeKeyword":"실기우수자","quotaInitial":23,
                    "applicationQualification":"고등학교 졸업(예정)자 또는 동등 학력 인정자. 영화예술학과 연출제작.",
                    "reflectionStages":[
                        {"stageLabel":"1단계","multiplier":5,"components":{"실기":100},"stageMaxScore":200},
                        {"stageLabel":"2단계","multiplier":None,"components":{"학생부(교과)":40,"실기":60},"stageMaxScore":1000},
                    ],
                    "csatMinimumRawText":"없음","csatMinimumExempt":True,"csatRequiredAreasRawText":None,
                    "prevYearResult":None,"sourcePages":[6,53]})
                tracks.append({
                    "trackName":"실기/실적(실기우수자 전형) 연기예술","trackTypeRaw":"실기/실적위주",
                    "recruitmentPeriodRaw":"수시","specialTypeKeyword":"실기우수자","quotaInitial":22,
                    "applicationQualification":"고등학교 졸업(예정)자 또는 동등 학력 인정자. 영화예술학과 연기예술.",
                    "reflectionStages":[
                        {"stageLabel":"1단계","multiplier":8,"components":{"실기":100},"stageMaxScore":200},
                        {"stageLabel":"2단계","multiplier":None,"components":{"학생부(교과)":30,"실기":70},"stageMaxScore":1000},
                    ],
                    "csatMinimumRawText":"없음","csatMinimumExempt":True,"csatRequiredAreasRawText":None,
                    "prevYearResult":None,"sourcePages":[6,53]})
                continue
            tracks.append(tr)
    total = sum(cols.values())
    departments.append({
        "departmentName": dept_name,
        "campus": "서울",
        "trackHint": hint,
        "totalQuotaHint": total,
        "tracks": tracks,
    })

# ── 이중 체크섬 ────────────────────────────────────────────────
# 열합: 전형키별 합 == COL_EXPECTED
colsum = {k:0 for k in COL_EXPECTED}
for _, _, cols in GRID:
    for k,v in cols.items():
        colsum[k]+=v
col_validation = []
col_all_ok = True
for k in KEY_ORDER:
    comp = colsum[k]; exp = COL_EXPECTED[k]; ok = comp==exp
    col_all_ok &= ok
    col_validation.append({"track":COL_LABEL[k],"computed":comp,"stated":exp,"match":ok})
grand = sum(colsum.values())

# 행합: totalQuotaHint == track quota 합 (정의상 일치). 재검산.
row_passed = 0; row_failed = 0; row_fail_list=[]
for d in departments:
    qsum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    nnull = sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
    if d["totalQuotaHint"] == qsum and nnull == 0:
        row_passed += 1
    else:
        row_failed += 1
        row_fail_list.append({"dept":d["departmentName"],"hint":d["totalQuotaHint"],"qsum":qsum,"null":nnull})

n_depts = len(departments)
n_tracks = sum(len(d["tracks"]) for d in departments)
checksum_passed = bool(col_all_ok and grand==1857 and row_failed==0)

meta = {
    "universityName": UNIV,
    "universityId": SLUG,
    "year": 2027,
    "recruitmentSeason": "susi",
    "sourceDocYear": 2027,
    "campusScope": "서울캠퍼스(광진) 단일 — 세종대는 단일 캠퍼스",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0,
    "departments": n_depts,
    "totalTracks": n_tracks,
    "rowSumValidation": {
        "basis": "totalQuotaHint(모집단위별 전형 인원 합)",
        "passed": row_passed, "failed": row_failed, "failedList": row_fail_list,
    },
    "colTotalValidation": col_validation,
    "colTotalGrand": {"computed": grand, "stated": 1857, "match": grand==1857},
    "checksumPassed": checksum_passed,
}

doc = {
    "meta": meta,
    "result": {
        "universityName": UNIV, "year": 2027, "recruitmentSeason": "susi",
        "departments": departments,
        "warnings": warnings,
    },
}

# warnings 자동 추가
if not col_all_ok:
    warnings.append("열합 불일치 컬럼 존재 — colTotalValidation 확인")
if grand != 1857:
    warnings.append(f"총계 {grand} != 원문 1857")
# 구조 메모(정직성)
warnings.append("세종인재(서류형)·기회균형·사회기여및배려자는 계열 선발(유형2) — 계열 단위 모집단위(인문사회계열 등)로 분리 적재. 첨단학과는 개별 행에도 분산.")
warnings.append("체육학과 예체능특기자: 종목별 전형요소 상이(골프계열/양궁/축구) — reflectionStages는 대표(골프계열) 표기, 종목별 비율은 applicationQualification에 보존.")
warnings.append("정원외 계약학과(항공시스템공학/사이버국방/국방AI융합/국방AI로봇)·특성화고졸재직자·창의소프트학부 분리전공·우주항공시스템공학부 분리전공 포함.")

OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

# 콘솔 리포트
print(f"== 세종대 빌드 결과 ==")
print(f"모집단위(부서): {n_depts}   전형(track): {n_tracks}")
print(f"행합: passed={row_passed} failed={row_failed}")
if row_fail_list:
    for f in row_fail_list: print("  ⚠", f)
print(f"열합 전부 일치: {col_all_ok}   총계 computed={grand} / 1857 ({'OK' if grand==1857 else 'MISMATCH'})")
for cv in col_validation:
    mark = "OK" if cv["match"] else "*** MISMATCH"
    print(f"   {cv['track'][:34]:<36} {cv['computed']:>4}/{cv['stated']:<4} {mark}")
print(f"checksumPassed = {checksum_passed}")
print(f"-> {OUT}")
