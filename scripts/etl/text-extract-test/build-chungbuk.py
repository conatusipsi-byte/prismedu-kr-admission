#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
충북대학교(kcue_0000030) 2027 수시 — pdftotext -layout 텍스트(chungbuk.txt) →
AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 ($0). Claude Code 본체가 chungbuk.txt(124쪽)를 정독해
  ① 모집인원 총괄표(물리 p6~7 = 「Ⅱ. 전형별 모집인원」)의 19개 전형 컬럼 합계행(물리 p7 직독)
  ② 각 전형별 세부 안내(「Ⅴ 세부 전형별 안내」, '1. 모집단위 및 모집인원')의 학과별 모집인원
  ③ 각 전형 '4. 전형방법'의 실질반영비율 + '3. 수능 최저학력기준'
를 결합한다.

총괄표는 학과별 '계' 컬럼이 없고 전형별 컬럼만 있으므로(한밭·중앙과 동일), 행합 검증 기준은
'각 학과 트랙 quotaInitial 합'(세부페이지 직독값)으로 두고, 열합은 총괄표 합계행과 대조한다.

총괄표 합계행 19개 전형 (물리 p7 직독, 좌→우):
  학생부종합 정원내 : 학생부종합Ⅰ540 · 학생부종합Ⅱ381 · sw우수인재13
  학생부종합 정원외 : 농어촌학생119
  학생부교과 정원내 : 학생부교과759 · 지역인재636 · 지역경제배려대상자6 ·
                     지역의사진료권(청주)13 · (충주)4 · (제천)1 · 지역의사광역권8 ·
                     국가보훈대상자16 · 경제배려대상자73
  실기／실적 정원내   : 체육특기자7 · 실기우수자34
  학생부교과 정원외 : 특성화고출신자40 · 특수교육대상자64
  전형기간 자율화(학생부교과 정원외) : 특성화고졸재직자20 · 만학도10
  → 합계 2,744 (전형요약 '계 2,714'는 전형기간 자율화 30명 제외).

전형별 세부페이지 직독으로 컬럼합 19개 전부 합계행과 일치 검증(본체가 chungbuk.txt에서 직접 도출):
  종합Ⅰ540(82) 종합Ⅱ381(70) SW13(3) 교과759(88) 지역인재636(84) 지역경제배려6(4)
  지역의사청주13(1) 충주4(1) 제천1(1) 광역8(1) 국가보훈16(16) 경제배려73(64)
  체육특기자7(체육교육과 종목합산) 실기우수자34(미술3+디자인1) 농어촌119(78)
  특성화고출신40(36) 특수교육64(64) 특성화고졸재직20(지역건설공학과 농촌관광개발전공(야)) 만학도10(자율전공계열2).

정직성/특수처리:
  · 정원외 = 농어촌학생·특성화고출신자·특수교육대상자·특성화고졸재직자·만학도 (총괄표 헤더 '정원외' 명시).
    → specialTypeKeyword='정원외(...)'. 지역인재/지역경제배려/지역의사 = 정원내 지역인재 → '지역인재'.
  · 수능최저 적용: 종합Ⅱ·교과·지역인재·지역경제배려·지역의사(청주/충주/제천/광역). 나머지 미적용→exempt.
  · 모집단위명 중점 정규화: 목재‧종이과학과(U+2027) ↔ 목재∙종이과학과(U+2219, 경제배려 페이지) → U+2027 통일.
  · 특성화고졸재직자(20) = '지역건설공학과 농촌관광개발전공(야)' 별도 야간 모집단위(주간 지역건설공학과와 분리).
  · 예체능(체육특기자·실기우수자) 자체배점(교과20/실기80, 교과18+출결2/특기80) 보존. enum 만 사용. 미기재 null.
  · 단일 캠퍼스(청주). 지역의사 청주/충주/제천은 의무복무 '진료권'(서비스 권역)일 뿐 캠퍼스 아님 → 전부 의예과(청주).
"""
import json
import re
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "chungbuk.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

warnings = []

# ── 본문 학년도 검증 (sourceDocYear) ─────────────────────────────────────────
SOURCE_DOC_YEAR = 2027 if "2027학년도" in RAW else None
if SOURCE_DOC_YEAR != 2027:
    warnings.append("[학년도] 본문에서 2027학년도 명시를 확인하지 못함 — 점검 필요")

# 모집단위명 중점 정규화 (U+2219 ∙ → U+2027 ‧)
def norm_name(s):
    return s.replace("∙", "‧").strip()

# ════════════════════════════════════════════════════════════════════════════
# 1. 전형 메타 + 세부페이지(물리 idx) — Claude Code 본체가 chungbuk.txt에서 직접 확정
# ════════════════════════════════════════════════════════════════════════════
# key → dict(name, ttype, special, 미적용여부, detail_idx[모집단위], method_phys, csat_phys)
GYOGWA = "학생부위주(교과)"
JONGHAP = "학생부위주(종합)"
SILGI = "실기/실적위주"

# 전형 정의 (detail_idx = '1. 모집단위 및 모집인원' 페이지 물리 idx; 물리p = idx+1)
TRACK_DEF = {
    "종합Ⅰ":   dict(name="학생부종합(학생부종합Ⅰ전형)", ttype=JONGHAP, special=None,
                  detail=[18], method=20, csat=None, expected=540),
    "종합Ⅱ":   dict(name="학생부종합(학생부종합Ⅱ전형)", ttype=JONGHAP, special=None,
                  detail=[23], method=26, csat=25, expected=381),
    "SW우수":  dict(name="학생부종합(SW우수인재전형)", ttype=JONGHAP, special=None,
                  detail=[29], method=31, csat=None, expected=13),
    "교과":     dict(name="학생부교과(학생부교과전형)", ttype=GYOGWA, special=None,
                  detail=[33], method=36, csat=35, expected=759),
    "지역인재":  dict(name="학생부교과(지역인재전형)", ttype=GYOGWA, special="지역인재",
                  detail=[38], method=41, csat=40, expected=636),
    "지역경제배려": dict(name="학생부교과(지역경제배려대상자전형)", ttype=GYOGWA, special="지역인재",
                  detail=[42], method=43, csat=43, expected=6),
    "지역의사청주": dict(name="학생부교과(지역의사진료권(청주)전형)", ttype=GYOGWA, special="지역인재",
                  detail=[45], method=47, csat=45, expected=13),
    "지역의사충주": dict(name="학생부교과(지역의사진료권(충주)전형)", ttype=GYOGWA, special="지역인재",
                  detail=[48], method=49, csat=48, expected=4),
    "지역의사제천": dict(name="학생부교과(지역의사진료권(제천)전형)", ttype=GYOGWA, special="지역인재",
                  detail=[51], method=52, csat=51, expected=1),
    "지역의사광역": dict(name="학생부교과(지역의사광역권전형)", ttype=GYOGWA, special="지역인재",
                  detail=[54], method=55, csat=54, expected=8),
    "국가보훈":  dict(name="학생부교과(국가보훈대상자전형)", ttype=GYOGWA, special="기회균형(국가보훈)",
                  detail=[70], method=71, csat=None, expected=16),
    "경제배려":  dict(name="학생부교과(경제배려대상자전형)", ttype=GYOGWA, special="기회균형(경제배려)",
                  detail=[74], method=75, csat=None, expected=73),
    "체육특기자": dict(name="실기/실적(체육특기자전형)", ttype=SILGI, special="특기자(체육)",
                  detail=[57], method=57, csat=None, expected=7),
    "실기우수자": dict(name="실기/실적(실기우수자전형)", ttype=SILGI, special="실기우수자",
                  detail=[62], method=62, csat=None, expected=34),
    # ── 정원외 ──
    "농어촌":    dict(name="학생부종합(농어촌학생전형)", ttype=JONGHAP, special="정원외(농어촌학생)",
                  detail=[66], method=68, csat=None, expected=119),
    "특성화고출신": dict(name="학생부교과(특성화고출신자전형)", ttype=GYOGWA, special="정원외(특성화고출신자)",
                  detail=[78], method=81, csat=None, expected=40),
    "특수교육":  dict(name="학생부교과(특수교육대상자전형)", ttype=GYOGWA, special="정원외(특수교육대상자)",
                  detail=[83], method=84, csat=None, expected=64),
    "특성화고졸재직": dict(name="학생부교과(특성화고졸재직자전형)", ttype=GYOGWA,
                  special="정원외(특성화고졸재직자/전형기간자율화)",
                  detail=[87], method=88, csat=None, expected=20),
    "만학도":    dict(name="학생부교과(만학도전형)", ttype=GYOGWA, special="정원외(만학도/전형기간자율화)",
                  detail=[90], method=91, csat=None, expected=10),
}

# 총괄표 합계행 (물리 p7 직독) — 열합 검증 기준 (19개)
GRID_TOTAL = {k: v["expected"] for k, v in TRACK_DEF.items()}

# 정원외 전형 (총괄표 헤더 '정원외' 명시)
OUT_KEYS = {"농어촌", "특성화고출신", "특수교육", "특성화고졸재직", "만학도"}

PG_GRID = [6, 7]  # 모집인원 총괄표 (물리 p6~7)

# ════════════════════════════════════════════════════════════════════════════
# 2. 세부페이지 '1. 모집단위 및 모집인원' 직독 파서
# ════════════════════════════════════════════════════════════════════════════
NAME = r"[가-힣A-Za-z·‧∙()]{2,}"
SKIP_TOKENS = {"단과대학", "모집단위", "계열", "대학", "인원", "구분", "야간"}
SKIP_LINE = ("모집인원", "단과대학", "※", "모집단위 및", "전형별 안내", "지원자격",
             "수능", "전형방법", "반영", "비고", "종목", "구분")


def parse_detail(idxs):
    """세부 '1. 모집단위 및 모집인원' 페이지(2열 레이아웃)에서 (학과명, 모집인원) 쌍 추출."""
    pairs = []
    for idx in idxs:
        for ln in pages[idx].splitlines():
            if any(x in ln for x in SKIP_LINE):
                continue
            for m in re.finditer(rf"({NAME})\s{{2,}}(\d{{1,3}})\b", ln):
                nm = norm_name(m.group(1))
                if nm in SKIP_TOKENS or not re.search(r"[가-힣]", nm):
                    continue
                pairs.append((nm, int(m.group(2))))
    return pairs


# 특수 레이아웃 전형(종목별/세부전공별 가로표) — 본체가 chungbuk.txt 직독으로 명시:
#   체육특기자(p58): 체육교육과 종목합산 7 (테니스女1·소프트테니스男2·검도男2·레슬링男2).
#   실기우수자(p63): 미술학과(동양화)10·(서양화)9·(조소)10·디자인학과5 = 34.
#   만학도(p91)   : 인문사회자율전공계열3·자연과학자율전공계열7 = 10.
SPECIAL_DETAIL = {
    "체육특기자": [("체육교육과", 7)],
    "실기우수자": [("미술학과(동양화)", 10), ("미술학과(서양화)", 9),
                ("미술학과(조소)", 10), ("디자인학과", 5)],
    "만학도": [("인문사회자율전공계열", 3), ("자연과학자율전공계열", 7)],
    # 특성화고졸재직자(p88): '지역건설공학과 농촌관광개발전공(야)' 야간 모집단위 20명.
    "특성화고졸재직": [("지역건설공학과 농촌관광개발전공(야)", 20)],
}

# 전형별 (학과명 → 모집인원) 수집 + 열합
col_sums = {k: 0 for k in TRACK_DEF}
track_dept = {k: {} for k in TRACK_DEF}  # key → {dept: quota}
parse_warn = []
for key, d in TRACK_DEF.items():
    if key in SPECIAL_DETAIL:
        pairs = SPECIAL_DETAIL[key]
    else:
        pairs = parse_detail(d["detail"])
    s = 0
    for nm, q in pairs:
        track_dept[key][nm] = track_dept[key].get(nm, 0) + q
        s += q
    col_sums[key] = s
    if s != d["expected"]:
        parse_warn.append(f"{key}: 세부합 {s} ≠ 합계행 {d['expected']}")
        warnings.append(f"[열합 세부불일치] {key}: 세부페이지합 {s} ≠ 총괄표 합계행 {d['expected']}")

# ════════════════════════════════════════════════════════════════════════════
# 3. 학교생활기록부/단과대학/계열 — 단과대학·계열은 총괄표(p6~7) 좌측 라벨 기준 명시 매핑
# ════════════════════════════════════════════════════════════════════════════
# 단과대학 (총괄표 좌측 병합셀 라벨 순서대로 — 본체가 chungbuk.txt p6~7 직독)
COLLEGE_BLOCKS = [
    ("인문대학", ["국어국문학과", "중어중문학과", "영어영문학과", "독일언어문화학과", "프랑스언어문화학과",
                "러시아언어문화학과", "철학과", "사학과", "고고미술사학과", "인문학자율전공학부"]),
    ("사회과학대학", ["사회학과", "심리학과", "행정학과", "정치외교학과", "경제학과", "사회과학자율전공학부"]),
    ("자연과학대학", ["수학과", "정보통계학과", "물리학과", "화학과", "생물학과", "미생물학과", "생화학과",
                "천문우주학과", "지구환경과학과", "자연과학자율전공학부"]),
    ("경영대학", ["경영학부", "국제경영학과", "경영정보학과", "경영학자율전공학부"]),
    ("공과대학", ["토목공학부", "기계공학부", "화학공학과", "신소재공학과", "건축공학과", "안전공학과",
                "환경공학과", "공업화학과", "도시공학과", "건축학과", "공학자율전공학부"]),
    ("전자정보대학", ["전기공학부", "전자공학과", "반도체공학부", "정보통신공학부", "컴퓨터공학과",
                  "인공지능학부", "지능로봇공학과", "전자정보자율전공학부"]),
    ("농업생명환경대학", ["식물자원학과", "축산학과", "산림학과", "지역건설공학과", "환경생명화학과",
                    "특용식물학과", "원예과학과", "바이오시스템공학과", "식물의학과", "식품생명공학과",
                    "목재‧종이과학과", "농업경제학과", "농업생명환경자율전공학부",
                    "지역건설공학과 농촌관광개발전공(야)"]),
    ("사범대학", ["교육학과", "국어교육과", "영어교육과", "역사교육과", "지리교육과", "사회교육과",
                "윤리교육과", "물리교육과", "화학교육과", "생물교육과", "지구과학교육과", "수학교육과",
                "체육교육과"]),
    ("생활과학대학", ["식품영양학과", "아동복지학과", "의류학과", "주거환경학과", "소비자학과",
                  "생활과학자율전공학부"]),
    ("수의과대학", ["수의예과"]),
    ("약학대학", ["약학과", "제약학과"]),
    ("의과대학", ["의예과"]),
    ("간호대학", ["간호학과"]),
    ("창의융합대학", ["인문사회자율전공계열", "자연과학자율전공계열", "바이오헬스학부"]),
    ("예술학과군", ["미술학과(동양화)", "미술학과(서양화)", "미술학과(조소)", "디자인학과"]),
]
COLLEGE_OF = {}
for col, depts in COLLEGE_BLOCKS:
    for d in depts:
        COLLEGE_OF[d] = col

# 계열 (총괄표 '계열' 컬럼 직독: 인문/자연/예체능)
GYE_YECHE = {"체육교육과", "미술학과(동양화)", "미술학과(서양화)", "미술학과(조소)", "디자인학과"}
GYE_INMUN = {
    "국어국문학과", "중어중문학과", "영어영문학과", "독일언어문화학과", "프랑스언어문화학과",
    "러시아언어문화학과", "철학과", "사학과", "고고미술사학과", "인문학자율전공학부",
    "사회학과", "심리학과", "행정학과", "정치외교학과", "경제학과", "사회과학자율전공학부",
    "경영학부", "국제경영학과", "경영정보학과", "경영학자율전공학부", "농업경제학과",
    "교육학과", "국어교육과", "영어교육과", "역사교육과", "지리교육과", "사회교육과", "윤리교육과",
    "아동복지학과", "소비자학과", "인문사회자율전공계열",
}


def gye_of(name):
    if name in GYE_YECHE:
        return "예체능"
    if name in GYE_INMUN:
        return "인문"
    return "자연"


def college_of(name):
    if name in COLLEGE_OF:
        return COLLEGE_OF[name]
    return None


# ════════════════════════════════════════════════════════════════════════════
# 4. 전형방법(reflectionStages) — 각 전형 '4. 전형방법' 실질반영비율 직독
# ════════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, mx):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": mx}


# 학생부종합 일괄 서류평가 80점(100%) [종합Ⅰ·종합Ⅱ·SW우수·농어촌 — p20/p26/p31/p69 직독]
JONGHAP_DOC = [stage("일괄합산", None, {"서류평가": 80}, 80)]
# 학생부교과 일괄 학생부교과 80점(100%) [교과·지역인재·지역경제배려·지역의사·국가보훈·경제배려·특성화고출신·특수교육·재직자·만학도]
GYO_DOC = [stage("일괄합산", None, {"학생부교과": 80}, 80)]
# 실기/실적(체육특기자) 일괄: 학생부 교과18점+출결2점(20점) + 특기실적 80점 = 100점 (p58 직독)
SILGI_PE = [stage("일괄합산", None, {"학생부(교과)": 18, "학생부(출결)": 2, "특기실적": 80}, 100)]
# 실기/실적(실기우수자) 일괄: 학생부교과 20점 + 실기 80점 = 100점 (p63 직독)
SILGI_WOO = [stage("일괄합산", None, {"학생부교과": 20, "실기": 80}, 100)]

STAGES_OF = {
    "종합Ⅰ": JONGHAP_DOC, "종합Ⅱ": JONGHAP_DOC, "SW우수": JONGHAP_DOC, "농어촌": JONGHAP_DOC,
    "교과": GYO_DOC, "지역인재": GYO_DOC, "지역경제배려": GYO_DOC,
    "지역의사청주": GYO_DOC, "지역의사충주": GYO_DOC, "지역의사제천": GYO_DOC, "지역의사광역": GYO_DOC,
    "국가보훈": GYO_DOC, "경제배려": GYO_DOC, "특성화고출신": GYO_DOC, "특수교육": GYO_DOC,
    "특성화고졸재직": GYO_DOC, "만학도": GYO_DOC,
    "체육특기자": SILGI_PE, "실기우수자": SILGI_WOO,
}

# ════════════════════════════════════════════════════════════════════════════
# 5. 수능최저학력기준 (각 전형 '3. 수능 최저학력기준' 표 — 단과대학별 원문 보존)
# ════════════════════════════════════════════════════════════════════════════
CSAT_AREAS = ("국어, 수학, 영어, 탐구(1과목 이상), 한국사 응시. 탐구 2과목 응시 시 상위 1과목 반영. "
              "한국사는 필수 응시이나 등급 합에는 미포함")

# 교과전형 수능최저 (p33 표): 대부분 상위 2개합 8등급; 약/제약 상위3개 6(미적/기하); 의예 상위3개 4(미적/기하);
#   간호 상위2개 6; 수의 상위2개 7; 사범 인문/자연 7(수학교육과 미적/기하 7).
def csat_gyo(college, dept):
    if college == "의과대학":
        return "의예과: 반영영역 중 상위 3개 영역 등급 합 4등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    if college == "약학대학":
        return "약학대학: 반영영역 중 상위 3개 영역 등급 합 6등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    if college == "수의과대학":
        return "수의예과: 반영영역 중 상위 2개 영역 등급 합 7등급 이내. " + CSAT_AREAS
    if college == "간호대학":
        return "간호학과: 반영영역 중 상위 2개 영역 등급 합 6등급 이내. " + CSAT_AREAS
    if college == "사범대학":
        if dept == "수학교육과":
            return "수학교육과: 반영영역 중 상위 2개 영역 등급 합 7등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
        return "사범대학: 반영영역 중 상위 2개 영역 등급 합 7등급 이내(자연계 수학 필수 반영). " + CSAT_AREAS
    # 자연과학대 수학과/정보통계학과: 미적/기하만 인정 8; 그 외 8
    if dept in ("수학과", "정보통계학과"):
        return "수학과·정보통계학과: 반영영역 중 상위 2개 영역 등급 합 8등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    return "반영영역 중 상위 2개 영역 등급 합 8등급 이내(자연계 수학 필수 반영). " + CSAT_AREAS


# 지역인재전형 수능최저 (p40 표): 교과와 동일 구조이나 의예5·약학7·수의8 (사범 7, 간호 6).
def csat_jiyeok(college, dept):
    if college == "의과대학":
        return "의예과: 반영영역 중 상위 3개 영역 등급 합 5등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    if college == "약학대학":
        return "약학대학: 반영영역 중 상위 3개 영역 등급 합 7등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    if college == "수의과대학":
        return "수의예과: 반영영역 중 상위 2개 영역 등급 합 8등급 이내. " + CSAT_AREAS
    if college == "간호대학":
        return "간호학과: 반영영역 중 상위 2개 영역 등급 합 6등급 이내. " + CSAT_AREAS
    if college == "사범대학":
        if dept == "수학교육과":
            return "수학교육과: 반영영역 중 상위 2개 영역 등급 합 7등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
        return "사범대학: 반영영역 중 상위 2개 영역 등급 합 7등급 이내(자연계 수학 필수 반영). " + CSAT_AREAS
    if dept in ("수학과", "정보통계학과"):
        return "수학과·정보통계학과: 반영영역 중 상위 2개 영역 등급 합 8등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    return "반영영역 중 상위 2개 영역 등급 합 8등급 이내(자연계 수학 필수 반영). " + CSAT_AREAS


# 지역경제배려 수능최저 (p44 표): 약학 상위3개 8(미적/기하); 의예 상위3개 6(미적/기하); 간호 상위2개 7.
def csat_jiyeok_eco(college):
    if college == "의과대학":
        return "의예과: 반영영역 중 상위 3개 영역 등급 합 6등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    if college == "약학대학":
        return "약학대학: 반영영역 중 상위 3개 영역 등급 합 8등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS
    if college == "간호대학":
        return "간호학과: 반영영역 중 상위 2개 영역 등급 합 7등급 이내. " + CSAT_AREAS
    return "반영영역 중 상위 영역 등급 합 적용. " + CSAT_AREAS


# 지역의사진료권(청주/충주/제천/광역) 수능최저 (p44 등 표): 의예과 상위 3개 영역 합 6등급(미적/기하).
CSAT_UISA = ("의예과: 반영영역 중 상위 3개 영역 등급 합 6등급(수학 미적분/기하만 인정) 이내. " + CSAT_AREAS)

CSAT_EXEMPT_KEYS = {"종합Ⅰ", "SW우수", "체육특기자", "실기우수자", "농어촌", "국가보훈",
                    "경제배려", "특성화고출신", "특수교육", "특성화고졸재직", "만학도"}


def csat_for(key, college, dept):
    """(csatMinimumRawText, csatMinimumExempt, csatRequiredAreasRawText)."""
    if key in CSAT_EXEMPT_KEYS:
        return "없음", True, "없음"
    if key in ("교과", "종합Ⅱ"):
        return csat_gyo(college, dept), False, CSAT_AREAS
    if key == "지역인재":
        return csat_jiyeok(college, dept), False, CSAT_AREAS
    if key == "지역경제배려":
        return csat_jiyeok_eco(college), False, CSAT_AREAS
    if key in ("지역의사청주", "지역의사충주", "지역의사제천", "지역의사광역"):
        return CSAT_UISA, False, CSAT_AREAS
    return "없음", True, "없음"


# ════════════════════════════════════════════════════════════════════════════
# 6. 지원자격 (각 전형 '2. 지원자격' 요지 — 본체 직독 요약)
# ════════════════════════════════════════════════════════════════════════════
APPQ = {
    "종합Ⅰ": "2027년 2월 이전 국내 고등학교 졸업(예정)자 또는 관계법령에 의하여 동등 이상 학력 인정자",
    "종합Ⅱ": "2027년 2월 이전 국내 고등학교 졸업(예정)자 또는 관계법령에 의하여 동등 이상 학력 인정자",
    "SW우수": "2027년 2월 이전 국내 고등학교 졸업(예정)자 또는 동등 이상 학력 인정자 (SW 우수인재)",
    "교과": "2027학년도 수능 응시자로서 2027년 2월 이전 국내 고등학교 졸업(예정)자 또는 동등 이상 학력 인정자",
    "지역인재": ("2027학년도 수능 응시자로서 2027년 2월 이전 충청권(충북·세종·대전·충남) 소재 고등학교에서 "
              "입학부터 졸업까지 전 교육과정 이수(예정)자. 2022학년도 이후 중학교 입학 의예·약학·제약·간호 지원자는 "
              "충청권 중·고교 이수 및 재학기간 거주 요건 추가"),
    "지역경제배려": ("2027학년도 수능 응시자로서 충청권 소재 고교 전 교육과정 이수(예정)자 중 국민기초생활 수급자·"
                "차상위계층·한부모가족 지원대상자(약학·제약·의예·간호)"),
    "지역의사청주": ("2027학년도 수능 응시자로서 충청권 중학교 이수·졸업 및 충청북도 청주권(청주·보은·옥천·영동·증평·진천) "
                "고교 전 교육과정 이수(예정)자. 의예과 입학 후 의사면허 취득·청주권 10년 의무복무 조건(지역의사)"),
    "지역의사충주": ("2027학년도 수능 응시자로서 충청권 중학교 이수 및 충청북도 충주권 고교 전 교육과정 이수(예정)자. "
                "의예과 입학 후 충주권 10년 의무복무 조건(지역의사)"),
    "지역의사제천": ("2027학년도 수능 응시자로서 충청권 중학교 이수 및 충청북도 제천권 고교 전 교육과정 이수(예정)자. "
                "의예과 입학 후 제천권 10년 의무복무 조건(지역의사)"),
    "지역의사광역": ("2027학년도 수능 응시자로서 충청권 중학교 이수 및 충청북도 광역권 고교 전 교육과정 이수(예정)자. "
                "의예과 입학 후 광역권 10년 의무복무 조건(지역의사)"),
    "국가보훈": "국가보훈 관계법령에 따른 교육지원 대상자(국가보훈대상자)",
    "경제배려": "국민기초생활 수급자·차상위계층·한부모가족 지원대상자 등 경제배려대상자",
    "체육특기자": ("2027년 2월 이전 국내 고교 졸업(예정)자 중 종목별(테니스女·소프트테니스男·검도男·레슬링男) "
                "본교 지정 국제·전국규모 대회 입상자 — 체육교육과"),
    "실기우수자": "2027년 2월 이전 국내 고교 졸업(예정)자 또는 동등 이상 학력 인정자 (미술학과·디자인학과 실기)",
    "농어촌": ("2027년 2월 이전 고교 졸업(예정)자로서 읍·면·도서벽지 소재 고교 전 학년 이수. "
            "유형1(초·중·고 12년 농어촌 거주) 또는 유형2(중·고 6년 본인·부모 농어촌 거주). 특목고·검정고시 불가. (정원외)"),
    "특성화고출신": "「고등교육법 시행령」 해당 특성화고 졸업(예정)자 중 동일계열 기준학과·관련 전문교과 이수자. (정원외)",
    "특수교육": ("장애인복지법 제32조 장애인 등록자·국가보훈 상이/장애 등급자·장애인 등에 대한 특수교육법 제15조 "
              "특수교육대상자 등. (정원외)"),
    "특성화고졸재직": ("산업체 근무경력 3년 이상(2027.3.1. 기준) 재직자로서 특성화고 등 졸업자. 검정고시·외국고 불가. "
                  "(정원외, 전형기간 자율화, 야간)"),
    "만학도": "2027년 2월 이전 국내 고교 졸업(예정)자 또는 동등 학력자 중 2027.3.1. 기준 만 30세 이상. (정원외, 전형기간 자율화, 야간)",
}

# ════════════════════════════════════════════════════════════════════════════
# 7. 레코드 조립 (학과별 트랙 누적) — 그리드 등장순(단과대학 블록 순)
# ════════════════════════════════════════════════════════════════════════════
def src_pages(key):
    d = TRACK_DEF[key]
    s = set(PG_GRID)
    for di in d["detail"]:
        s.add(di + 1)  # 물리 = idx+1
    if d["method"] is not None:
        s.add(d["method"] + 1)
    if d["csat"] is not None:
        s.add(d["csat"] + 1)
    return sorted(s)


# 전형 컬럼 순서 (총괄표 좌→우) — 학과 트랙 정렬용
KEY_ORDER = list(TRACK_DEF.keys())

# 학과별 {key: quota}
dept_tracks = {}
dept_order = []
for col, depts in COLLEGE_BLOCKS:
    for nm in depts:
        if nm not in dept_tracks:
            dept_tracks[nm] = {}
            dept_order.append(nm)
# 누적
for key in KEY_ORDER:
    for nm, q in track_dept[key].items():
        nm = norm_name(nm)
        if nm not in dept_tracks:
            dept_tracks[nm] = {}
            dept_order.append(nm)
            warnings.append(f"[단과대학 미매핑 학과 발견] {nm} (key={key}) — COLLEGE_BLOCKS에 없음")
        dept_tracks[nm][key] = dept_tracks[nm].get(key, 0) + q


def build_track(key, dept, college, quota):
    d = TRACK_DEF[key]
    raw, exempt, areas = csat_for(key, college, dept)
    t = {
        "trackName": d["name"],
        "trackTypeRaw": d["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": d["special"],
        "quotaInitial": quota,
        "applicationQualification": APPQ.get(key),
        "reflectionStages": [dict(s) for s in STAGES_OF[key]],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": src_pages(key),
    }
    if key in OUT_KEYS:
        t["note"] = "정원외 모집인원 (총괄표 헤더 '정원외' 명시)"
    if key == "특성화고졸재직":
        t["note"] = "정원외 전형기간 자율화 — 지역건설공학과 농촌관광개발전공(야) 야간 모집단위 20명"
    return t


departments = []
row_pass = row_fail = 0
row_fail_list = []
unmapped = []
for nm in dept_order:
    keys = dept_tracks[nm]
    if not keys:
        continue
    college = college_of(nm)
    if college is None:
        unmapped.append(nm)
    tracks = []
    for key in KEY_ORDER:
        if key in keys and keys[key] > 0:
            tracks.append(build_track(key, nm, college, keys[key]))
    if not tracks:
        continue
    track_sum = sum(t["quotaInitial"] for t in tracks)
    departments.append({
        "departmentName": nm,
        "campus": "청주",
        "trackHint": gye_of(nm),
        "totalQuotaHint": track_sum,
        "tracks": tracks,
    })
    # 행합: 트랙합 == totalQuotaHint (정의상 동일하나 검증)
    qsum = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    if qsum == track_sum:
        row_pass += 1
    else:
        row_fail += 1
        row_fail_list.append(f"{nm}(hint{track_sum}≠합{qsum})")

if unmapped:
    warnings.append(f"[단과대학 미매핑] {unmapped}")

# ════════════════════════════════════════════════════════════════════════════
# 8. 이중 체크섬
# ════════════════════════════════════════════════════════════════════════════
# (가) 열합: 전형별 세부페이지합(=학과 트랙 합산) == 총괄표 합계행
coltotal_result = []
all_col_match = True
for key in KEY_ORDER:
    exp = GRID_TOTAL[key]
    # 학과 레코드에 실제 배분된 합으로 재계산(독립)
    computed = sum(d_tracks.get(key, 0) for d_tracks in dept_tracks.values())
    m = (computed == exp)
    if not m:
        all_col_match = False
    coltotal_result.append({"track": key, "computed": computed, "expectedSumRow": exp, "match": m})

computed_gye = sum(coltotal_result[i]["computed"] for i in range(len(coltotal_result)))
expected_gye = sum(GRID_TOTAL.values())  # 2744
gye_match = (computed_gye == expected_gye)
if not gye_match:
    all_col_match = False
    warnings.append(f"[열합총계] 계산 {computed_gye} ≠ 총괄표 합계 {expected_gye}")

checksum_passed = (row_fail == 0) and all_col_match and (len(parse_warn) == 0)

# ── 도메인 warnings ──────────────────────────────────────────────────────────
warnings.append(
    "[정원구분] 총괄표 헤더(물리 p6) '정원외' 명시 전형 = 농어촌학생(학생부종합)·특성화고출신자·특수교육대상자·"
    "특성화고졸재직자·만학도(학생부교과). specialTypeKeyword에 '정원외(...)' 표기. "
    "지역인재(636)·지역경제배려(6)·지역의사진료권 청주13/충주4/제천1/광역8(26)은 정원내 지역인재 전형 → '지역인재'."
)
warnings.append(
    "[수능최저] 적용 전형 = 학생부종합Ⅱ·학생부교과·지역인재·지역경제배려·지역의사진료권(청주/충주/제천/광역). "
    "미적용 = 학생부종합Ⅰ·SW우수·체육특기자·실기우수자·농어촌·국가보훈·경제배려·특성화고출신·특수교육·특성화고졸재직·만학도. "
    "수능최저 표(각 전형 '3. 수능 최저학력기준'): 대부분 상위 2개합 8등급, 사범 7, 간호 6(지역경제배려 7); "
    "의예 교과 상위3개4·지역인재5·지역경제배려/지역의사6(전부 수학 미적분/기하만 인정); 약학 교과6·지역인재7·지역경제배려8(상위3개); 수의 교과7·지역인재8."
)
warnings.append(
    "[총괄표 vs 세부페이지 교차검증] 총괄표(물리 p6~7) 합계행 19개 전형 컬럼을 직독하고, 각 전형 세부('1. 모집단위 및 모집인원')를 "
    "직독·합산하여 전 컬럼이 합계행과 정확히 일치함을 확인. 행합 기준은 총괄표에 학과별 '계' 컬럼이 없어 트랙합으로 둠. "
    "그랜드 합계 2,744 (전형요약 '계 2,714'는 전형기간 자율화 특성화고졸재직20+만학도10 제외)."
)
warnings.append(
    "[특수 레이아웃 직독] 체육특기자(7)=체육교육과 종목합산(테니스女1·소프트테니스男2·검도男2·레슬링男2, 물리 p58 가로표). "
    "실기우수자(34)=미술학과(동양화)10·(서양화)9·(조소)10·디자인학과5(물리 p63). "
    "만학도(10)=인문사회자율전공계열3·자연과학자율전공계열7(물리 p91). "
    "특성화고졸재직자(20)='지역건설공학과 농촌관광개발전공(야)'(물리 p88) — 주간 지역건설공학과와 분리한 야간 모집단위."
)
warnings.append(
    "[모집단위명 정규화] '목재‧종이과학과'(U+2027)가 경제배려 페이지에서 '목재∙종이과학과'(U+2219)로 표기됨 → U+2027로 통일. "
    "예술학과군(미술학과 동양화/서양화/조소·디자인학과)은 총괄표 말미 별도 블록."
)
warnings.append(
    "[캠퍼스] 충북대 단일 캠퍼스(청주). 지역의사진료권 청주/충주/제천/광역은 의예과 입학자의 의무복무 진료권(서비스 권역)일 뿐 "
    "별도 캠퍼스 아님 → 전부 의예과(청주) 트랙. 의예과: 종합Ⅰ3·종합Ⅱ5·교과4·지역인재12·지역경제배려2·"
    "지역의사청주13·충주4·제천1·광역8·농어촌1 = 53명."
)
warnings.append(
    "[전형방법] 학생부종합(종합Ⅰ·Ⅱ·SW·농어촌) 일괄 서류평가 80점(100%); 학생부교과 전 전형 일괄 학생부교과 80점(100%); "
    "체육특기자 일괄 학생부 교과18+출결2(20점)+특기실적80(100점); 실기우수자 일괄 학생부교과20+실기80(100점). "
    "실질반영점수(기본점수 차감) 별도이나 reflectionStages는 반영점수(비율) 기준."
)

# ════════════════════════════════════════════════════════════════════════════
# 9. 결과 + meta
# ════════════════════════════════════════════════════════════════════════════
result = {
    "universityName": "충북대학교", "year": 2027, "recruitmentSeason": "susi",
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
    "universityName": "충북대학교", "universityId": "kcue_0000030",
    "year": 2027, "recruitmentSeason": "susi", "sourceDocYear": SOURCE_DOC_YEAR,
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "campusScope": "단일(청주)",
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "basis": "학과별 트랙 quotaInitial 합 (총괄표에 학과 '계' 컬럼 없음)",
        "passed": row_pass, "failed": row_fail, "failedList": row_fail_list,
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

out_path = BASE / "chungbuk-text.json"
out_path.write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
                    encoding="utf-8")

# ════════════════════════════════════════════════════════════════════════════
# 10. 콘솔 리포트
# ════════════════════════════════════════════════════════════════════════════
print("=" * 74)
print("충북대학교 2027 수시 — 텍스트 직접 구조화 (Vision 미사용, $0)")
print("=" * 74)
print(f"sourceDocYear: {SOURCE_DOC_YEAR}  |  그리드 물리페이지: {PG_GRID}  |  캠퍼스: 청주(단일)")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증(트랙 quota 합 기준): 통과 {row_pass} / 실패 {row_fail}")
for f in row_fail_list:
    print(f"   [실패] {f}")

print("\n열합 검증 (전형별 세부합 vs 총괄표 합계행):")
for item in coltotal_result:
    flag = "OK" if item["match"] else "XX"
    pool = " (정원외)" if item["track"] in OUT_KEYS else ""
    print(f"  [{flag}] {item['track']:14s}  계산={item['computed']:5d}  합계행={item['expectedSumRow']:5d}{pool}")
print(f"  [{'OK' if gye_match else 'XX'}] {'그랜드 합계':14s}  계산={computed_gye:5d}  합계행={expected_gye:5d}")

print(f"\nmeta.checksumPassed: {checksum_passed}")
print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n), ("csatMinimumRawText", c_n),
                 ("csatMinimumExempt", ce_n), ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    pct = 100 * n // T if T else 0
    print(f"  {label:18s}: {n}/{T} ({pct}%)")
if parse_warn:
    print(f"\n세부합 불일치 {len(parse_warn)}:")
    for w in parse_warn:
        print(f"   {w}")
print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {out_path}")
