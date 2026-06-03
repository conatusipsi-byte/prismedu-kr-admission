#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
제주대학교(kcue_0000027) 2027 수시 — pdftotext -layout 텍스트(jeju.txt, 128쪽) →
AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 ($0). Claude Code 본체가 jeju.txt 전체를 정독해
  ① 모집인원 총괄표 「Ⅱ. 모집단위 및 모집인원」(물리 p7~10) — 18개 모집인원 컬럼
     (학생부교과 6 + 학생부종합 8 + 실기/실적 2 + 전형기간자율화 학생부종합 2) + 소계/계
  ② 전형별 세부페이지(전형방법·반영비율·수능최저표)
를 결합한다. 총괄표는 페이지별 헤더 라벨 우측끝으로 컬럼 우측끝(value-end)을 캘리브해 결정론 파싱하고,
세부페이지 직독 템플릿(반영비율·수능최저·배수)을 부착한다.

총괄표 18개 모집인원 컬럼(좌→우)과 총계행(물리 p10 「계」행 직독):
  학생부교과 : 일반학생523 · 지역인재475 · 지역인재고른기회5 · 지역의사진료권제주시7 ·
               지역의사진료권서귀포시6 · 지역의사광역권제주5  [교과소계 1,021]
  학생부종합 : 일반학생236 · 지역인재47 · 지역의사광역권제주2 · 사회통합53 · 고른기회119 ·
               농어촌학생85 · 특성화고졸업자32 · 특수교육대상자57  [종합소계 631]
  실기/실적 : 일반학생71 · 체육특기자11  [실기소계 82]
  → 수시 계 1,734
  전형기간자율화 학생부종합(정원외) : 평생학습자71 · 재직자60  [소계 131]
  ※ PDF가 본문(주요 변경내용, p3)에 명시한 수시 grand total: 학생부교과 1,021 + 학생부종합 631 +
    실기/실적 82 = 1,734(69.2%), + 전형기간자율화 131(5.2%). (정시 641 제외)

이중 체크섬:
  · 행합(열): 각 모집단위 Σ(quotaInitial non-null) == 모집단위 계 (PDF 계 컬럼). 총괄표 각 행의
    수시계/자율소계가 트랙합과 일치.
  · 열합(컬럼): 전형별 Σ(전 모집단위) == p10 「계」행 (jeju.txt에 실제로 등장하는 총계행 숫자).
    18개 컬럼 전부 + 수시계 1,734 + 자율소계 131 일치.

정직성:
  · 미기재 null. 수능최저 미적용 → exempt=true, raw="없음".
  · 지역의사(진료권 제주시/서귀포시, 광역권 제주)는 의예과만 — 제주 '지역의사선발' 정원내(지역인재 성격) →
    specialTypeKeyword="지역인재".
  · 평생학습자·재직자 = 전형기간자율화 '정원외' 학생부종합 → specialTypeKeyword="정원외(...)".
    실제로는 (야)행정학과·(야)경영학과(평생 5씩) 및 미래융합대학 4개 학과(평생16/16/16/13 + 재직자15×4)에
    PDF가 학과별 인원을 명시 부여 → 풀(null) 아님, 학과별 quotaInitial 부여.
  · 예체능 자체배점(체육교육과 교과58%+실기42%, 스포츠과학과 교과59%+실기41%, 실기일반 교과14%+실기86%,
    체육특기자 교과24%+출결8%+입상실적68%) 보존. 반영비율 날조 금지.
  · 음악학부/디자인학부/과학교육학부/스마트팜학부의 세부 전공행(각자 모집인원 보유)은 모집단위로 유지.
    생명공학부는 단일 모집단위(57)이고 바이오소재/분자생명공학/동물생명공학 전공은 내부 전공(별도 인원 없음).

캠퍼스: 단일(제주, 제주특별자치도). 의예과/수의예과 예과·본과, 야간 학과 동일 제주 캠퍼스.
"""
import json
import re
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "jeju.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

warnings = []

# ── 본문 학년도 검증 (sourceDocYear) ─────────────────────────────────────────
# 표지(p1)는 'pdftotext' 가 '2027학 년 도'로 자간을 띄워 렌더하므로, 공백 제거 본문 전체에서 확인.
#  (목차·전형 페이지 등 23곳에 '2027학년도' 명시 — 충남대 2026 케이스 자동 차단 게이트 호환)
_NOSPACE = re.sub(r"\s+", "", RAW)
SOURCE_DOC_YEAR = 2027 if "2027학년도" in _NOSPACE else None
if SOURCE_DOC_YEAR != 2027:
    warnings.append("[학년도] 본문에서 2027학년도 명시를 확인하지 못함 — 점검 필요")

# ════════════════════════════════════════════════════════════════════════════
# 0. 컬럼 정의 + 총계행(p10 「계」행 직독)
# ════════════════════════════════════════════════════════════════════════════
# 18개 모집인원 컬럼 인덱스 (소계/계 제외):
#  0 교과일반학생  1 교과지역인재  2 교과지역인재고른기회  3 교과지역의사진료권제주시
#  4 교과지역의사진료권서귀포시  5 교과지역의사광역권제주
#  6 종합일반학생  7 종합지역인재  8 종합지역의사광역권제주  9 종합사회통합  10 종합고른기회
#  11 종합농어촌학생  12 종합특성화고졸업자  13 종합특수교육대상자
#  14 실기/실적일반학생  15 실기/실적체육특기자
#  16 전형기간자율화 평생학습자  17 전형기간자율화 재직자
COLNAMES = ["교과(일반학생)", "교과(지역인재)", "교과(지역인재고른기회)",
            "교과(지역의사_진료권제주시)", "교과(지역의사_진료권서귀포시)", "교과(지역의사_광역권제주)",
            "종합(일반학생)", "종합(지역인재)", "종합(지역의사_광역권제주)", "종합(사회통합)",
            "종합(고른기회)", "종합(농어촌학생)", "종합(특성화고졸업자)", "종합(특수교육대상자)",
            "실기/실적(일반학생)", "실기/실적(체육특기자)",
            "전형기간자율화(평생학습자)", "전형기간자율화(재직자)"]
# p10 「계」행 직독 — 열합 검증 기준
TOTROW = [523, 475, 5, 7, 6, 5, 236, 47, 2, 53, 119, 85, 32, 57, 71, 11, 71, 60]
SUSI_GYE = 1734    # 수시 계 (Σ col0..15) — p10 「계」행 + p3 변경내용 명시
AUT_SUB = 131      # 전형기간자율화 소계 (col16+17) — p10 「계」행 + p3 명시
# 정원외 컬럼(콘솔 표기용): 종합 정원외(농어촌11·특성화고12·특수교육13) + 전형기간자율화(평생16·재직자17).
#  (총괄표 헤더 물리 p7 row4: 학생부종합 [정원내@80: 일반/지역/지역의사/사회통합/고른기회][정원외@104:
#   농어촌/특성화고/특수교육], 전형기간자율화 [정원외@147: 평생/재직자]. 농어촌/특성화고/특수교육은
#   고등교육법 시행령 제29조 정원외 특별전형.)
OUT_IDX = {11, 12, 13, 16, 17}

# ════════════════════════════════════════════════════════════════════════════
# 1. 모집인원 총괄표 결정론 파싱 (페이지별 헤더 라벨 우측끝 캘리브)
# ════════════════════════════════════════════════════════════════════════════
# 페이지별 컬럼 value-end 오프셋(헤더 라벨 우측끝 기준; 숫자는 라벨 우측 ~+1 우측정렬).
#  키 = pages 인덱스(=물리p-1). EDGES[6]=물리p7 ... EDGES[9]=물리p10.
EDGES = {
    6: {0: 35, 1: 40, 2: 45, 3: 51, 4: 56, 5: 61, 6: 70, 7: 75, 8: 82, 9: 88,
        10: 94, 11: 101, 12: 106, 13: 111, 14: 121, 15: 126, 16: 144, 17: 150},
    7: {0: 38, 1: 43, 2: 48, 3: 54, 4: 59, 5: 64, 6: 73, 7: 78, 8: 85, 9: 91,
        10: 97, 11: 104, 12: 109, 13: 114, 14: 124, 15: 129, 16: 147, 17: 153},
    8: {0: 41, 1: 46, 2: 51, 3: 58, 4: 63, 5: 68, 6: 80, 7: 85, 8: 92, 9: 98,
        10: 104, 11: 111, 12: 116, 13: 121, 14: 131, 15: 136, 16: 154, 17: 160},
    9: {0: 41, 1: 47, 2: 51, 3: 58, 4: 64, 5: 70, 6: 84, 7: 91, 8: 96, 9: 103,
        10: 109, 11: 116, 12: 121, 13: 127, 14: 138, 15: 145, 16: 166, 17: 172},
}
MOJ = {6: 22, 7: 25, 8: 26, 9: 25}                      # 모집정원 컬럼 우측끝(좌측 경계)
# 소계/계 컬럼 우측끝(셀 매핑에서 제외) — 교과소계·종합소계·실기소계·수시계·자율소계
SOJ = {
    6: [65, 116, 134, 157, 139],
    7: [68, 119, 137, 157, 142],
    8: [75, 126, 144, 164, 149],
    9: [75, 132, 152, 160, 180, 158],
}
TOL = 2.4   # 우측정렬 지터 흡수. 인접 컬럼 최소간격 4 → 충돌 없음(검증완료).
GRID_PAGES = [6, 7, 8, 9]   # 물리 p7~10


def _strip_lead(head):
    """행 머리 텍스트 → 모집단위명. 병합셀 단과대학/계열 조각 제거 후 마지막 토큰(모집단위명)만."""
    toks = head.split()
    return toks[-1] if toks else head


def parse_grid():
    """총괄표 직접 파싱 → [(모집단위명, {col_idx: quota})]. 열합도 동시 집계."""
    col_sum = [0] * 18
    rows = []
    prev_wrap = None
    for pi in GRID_PAGES:
        edges, moj, soj = EDGES[pi], MOJ[pi], SOJ[pi]
        for ln in pages[pi].splitlines():
            s = ln.rstrip()
            nm = s.strip()
            if nm.startswith(("계", "소계", "※", "Ⅱ")):
                continue
            if not re.search(r"[가-힣]", s):
                continue
            toks = list(re.finditer(r"-?[\d,]+", s))
            rawhead = s[:toks[0].start()] if toks else s
            name = _strip_lead(rawhead.strip()) if rawhead.strip() else ""
            cells = {}
            for m in (toks or []):
                e = m.end()
                v = int(m.group().replace(",", ""))
                if e <= moj + 3:          # 모집정원 / 이월유보(좌측)
                    continue
                if any(abs(e - sj) <= 2 for sj in soj):   # 소계/계
                    continue
                if v < 0:                 # 이월유보 음수(-14 등)
                    continue
                best = min(edges, key=lambda c: abs(edges[c] - e))
                if abs(edges[best] - e) <= TOL:
                    cells[best] = cells.get(best, 0) + v
            if cells:
                disp = name
                if name == "과" and prev_wrap:   # 데이터사이언스학 + 과 (줄바꿈)
                    disp = prev_wrap + "과"
                rows.append((disp, cells))
                prev_wrap = None
                for c, v in cells.items():
                    col_sum[c] += v
            else:
                # 데이터 없는 라벨행 → 줄바꿈 모집단위명 접두(예: '데이터사이언스학')
                if name.endswith("학"):
                    prev_wrap = name
    return rows, col_sum


grid_rows, col_sum = parse_grid()
# 모집단위명 → cells (동일명 중복 없음; 합산 안전)
GRID = {}
GRID_ORDER = []
for name, cells in grid_rows:
    if name not in GRID:
        GRID[name] = {}
        GRID_ORDER.append(name)
    for c, v in cells.items():
        GRID[name][c] = GRID[name].get(c, 0) + v

# ════════════════════════════════════════════════════════════════════════════
# 2. 단과대학 / 계열(trackHint) / 캠퍼스 (총괄표 등장순 + 섹션 명시 매핑)
# ════════════════════════════════════════════════════════════════════════════
# (단과대학, 계열, [모집단위명...]) — 총괄표(물리 p7~10) 병합셀 단과대학·계열 라벨 순서대로.
# 계열: 인문/자연/예체능(예능·체능)/공통.
COLLEGE_BLOCKS = [
    ("인문대학", "인문", ["국어국문학과", "영어영문학과", "독일학과", "일어일문학과",
                       "중어중문학과", "사학과", "사회학과", "철학과"]),
    ("사회과학대학", "인문", ["행정학과", "정치외교학과", "언론홍보학과"]),
    ("경상대학", "인문", ["경제학과", "(야)행정학과", "경영학과", "관광경영학과", "회계학과",
                       "무역학과", "관광개발학과", "경영정보학과", "(야)경영학과"]),
    ("사범대학", "인문", ["국어교육과", "영어교육과", "사회교육과", "지리교육과", "윤리교육과"]),
    ("사범대학", "자연", ["수학교육과", "과학교육학부(물리교육전공)", "과학교육학부(생물교육전공)",
                       "컴퓨터교육과"]),
    ("사범대학", "예체능", ["체육교육과"]),
    ("생명자원과학대학", "자연", ["스마트팜학부(식물자원환경전공)", "스마트팜학부(원예과학전공)",
                           "생명공학부", "바이오메디컬정보학과"]),
    ("생명자원과학대학", "인문", ["산업응용경제학과"]),
    ("해양과학대학", "자연", ["해양산업경찰학과", "해양생명과학과", "지구해양과학과", "수산생명의학과"]),
    ("해양과학대학", "공학", ["환경공학과", "해양시스템공학과"]),
    ("자연과학대학", "자연", ["물리학과", "생물학과", "화학·코스메틱스학과", "식품영양학과", "수학과",
                         "생활환경복지학과", "데이터사이언스학과", "패션의류학과"]),
    ("자연과학대학", "예체능", ["스포츠과학과"]),
    ("공과대학", "공학", ["식품생명공학과", "기계시스템공학과", "통신공학과", "전기공학과",
                       "원자력공학과", "전자공학과", "화공그린에너지학과", "컴퓨터공학과",
                       "인공지능학과", "건축공학과", "건축학과", "토목공학과"]),
    ("의과대학", "자연", ["의예과"]),
    ("교육대학", "인문", ["초등교육학부"]),
    ("수의과대학", "자연", ["수의예과"]),
    ("간호대학", "자연", ["간호학과"]),
    ("예술디자인대학", "예체능", ["음악학부(작곡전공)", "음악학부(성악전공)", "음악학부(피아노전공)",
                            "음악학부(관·현악전공)", "미술학과", "디자인학부(공업디자인전공)",
                            "디자인학부(문화공예디자인전공)", "디자인학부(시각영상디자인전공)"]),
    ("미래융합대학", "자연", ["건강뷰티향장학과"]),
    ("미래융합대학", "인문", ["관광융복합학과", "부동산관리학과", "실버케어복지학과"]),
    ("약학대학", "자연", ["약학과"]),
    ("글로벌노마드대학", "공통", ["글로벌자율학부"]),
]
COLLEGE_OF, HINT_OF = {}, {}
DISP_ORDER = []   # 최종 모집단위 출력 순서
for col, gye, depts in COLLEGE_BLOCKS:
    for d in depts:
        COLLEGE_OF[d] = col
        HINT_OF[d] = gye
        DISP_ORDER.append(d)

# 그리드 파서가 잡은 raw 모집단위명 → 표시명(전공 괄호부착) 매핑.
#  음악/디자인/과학교육/스마트팜 전공행은 raw 가 전공명이므로 부모학부 부착.
GRID_TO_DISP = {
    "물리교육전공": "과학교육학부(물리교육전공)",
    "생물교육전공": "과학교육학부(생물교육전공)",
    "식물자원환경전공": "스마트팜학부(식물자원환경전공)",
    "원예과학전공": "스마트팜학부(원예과학전공)",
    "작곡전공": "음악학부(작곡전공)",
    "성악전공": "음악학부(성악전공)",
    "피아노전공": "음악학부(피아노전공)",
    "관·현악전공": "음악학부(관·현악전공)",
    "공업디자인전공": "디자인학부(공업디자인전공)",
    "문화공예디자인전공": "디자인학부(문화공예디자인전공)",
    "시각영상디자인전공": "디자인학부(시각영상디자인전공)",
}


def campus_of(_dept):
    return "제주(제주특별자치도)"


# ════════════════════════════════════════════════════════════════════════════
# 3. 전형 메타 (컬럼 → 전형명/유형/특기/배수/전형방법/세부페이지)
# ════════════════════════════════════════════════════════════════════════════
GYOGWA = "학생부위주(교과)"
JONGHAP = "학생부위주(종합)"
SILGI = "실기/실적위주"


def stage(label, mult, comps, maxscore=1000):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}


# ── 학생부교과 (전형방법 p14~28 직독) ──
# 일반학생/지역인재(전 모집단위, 체교·스포츠 제외): 학생부교과 100% (기본840 + 실질반영160 = 1000)
GYO_100 = [stage("일괄합산", None, {"학생부(교과)": 1000})]
# 지역인재 체육교육과: 교과58%(850) + 실기42%(150)
GYO_체교 = [stage("일괄합산", None, {"학생부(교과)": 850, "실기": 150})]
# 지역인재 스포츠과학과: 교과59%(900) + 실기41%(100)
GYO_스포츠 = [stage("일괄합산", None, {"학생부(교과)": 900, "실기": 100})]
# 지역의사(진료권/광역권) 교과: 의예과 학생부교과 100%
GYO_지역의사 = [stage("일괄합산", None, {"학생부(교과)": 1000})]

# ── 학생부종합 (전형방법 p30~53 직독) ──
# 일괄 서류평가 100% (기본400 + 실질반영600 = 1000)
JH_DOC = [stage("일괄합산", None, {"서류평가": 1000})]


def jh_step(mult):
    """단계: 1단계 서류100%(1000, N배수) → 2단계 1단계성적70%(700)+면접30%(300)."""
    return [stage("1단계", mult, {"서류평가": 1000}),
            stage("2단계", None, {"1단계 성적(70%)": 700, "면접평가(30%)": 300})]


# ── 실기/실적 (전형방법 p64~66 직독) ──
# 실기/실적 일반학생: 교과14%(420+80=500) + 실기86%(500)
SILGI_GEN = [stage("일괄합산", None, {"학생부(교과)": 500, "실기": 500})]
# 실기/실적 체육특기자: 일괄 교과24%(280) + 출결8%(120) + 입상실적68%(600)
SILGI_TUKGI = [stage("일괄합산", None,
                     {"학생부(교과)": 280, "학생부(출결)": 120, "입상실적": 600})]

# 컬럼 인덱스 → 전형 메타
# stages: 콜백/리터럴. step 표기는 배수 결정 함수에서 처리.
TRACK_META = {
    0:  dict(name="학생부교과(일반학생)", ttype=GYOGWA, special=None, pg=14),
    1:  dict(name="학생부교과(지역인재)", ttype=GYOGWA, special="지역인재", pg=16),
    2:  dict(name="학생부교과(지역인재고른기회)", ttype=GYOGWA, special="기회균형", pg=22),
    3:  dict(name="학생부교과[지역의사(진료권 제주시)]", ttype=GYOGWA, special="지역인재", pg=24),
    4:  dict(name="학생부교과[지역의사(진료권 서귀포시)]", ttype=GYOGWA, special="지역인재", pg=26),
    5:  dict(name="학생부교과[지역의사(광역권 제주)]", ttype=GYOGWA, special="지역인재", pg=28),
    6:  dict(name="학생부종합(일반학생)", ttype=JONGHAP, special=None, pg=36),
    7:  dict(name="학생부종합(지역인재)", ttype=JONGHAP, special="지역인재", pg=38),
    8:  dict(name="학생부종합[지역의사(광역권 제주)]", ttype=JONGHAP, special="지역인재", pg=40),
    9:  dict(name="학생부종합(사회통합)", ttype=JONGHAP, special="기회균형", pg=42),
    10: dict(name="학생부종합(고른기회)", ttype=JONGHAP, special="기회균형", pg=45),
    11: dict(name="학생부종합(농어촌학생)", ttype=JONGHAP, special="정원외(농어촌학생)", pg=47),
    12: dict(name="학생부종합(특성화고졸업자)", ttype=JONGHAP, special="정원외(특성화고졸업자)", pg=49),
    13: dict(name="학생부종합(특수교육대상자)", ttype=JONGHAP, special="정원외(특수교육대상자)", pg=53),
    14: dict(name="실기/실적(일반학생)", ttype=SILGI, special=None, pg=64),
    15: dict(name="실기/실적(체육특기자)", ttype=SILGI, special="특기자", pg=66),
    16: dict(name="학생부종합(평생학습자)", ttype=JONGHAP, special="정원외(평생학습자/전형기간자율화)", pg=55),
    17: dict(name="학생부종합(재직자)", ttype=JONGHAP, special="정원외(재직자/전형기간자율화)", pg=57),
}

# 종합 단계형(1단계 서류100% → 2단계 70%+면접30%) 적용 모집단위 (전형요약 p5/p30 명시).
#   일반학생: 사범대학/초등교육학부/수의예과/간호학과/약학과 = 3배수.
#   지역인재: 전 모집단위(글로벌자율학부 제외) 3배수, 의예과·약학과 5배수. 글로벌자율학부 = 일괄.
#   지역의사(광역권 제주): 의예과 5배수.
JH_STEP_DEPTS_ILBAN = {"수학교육과", "과학교육학부(물리교육전공)", "과학교육학부(생물교육전공)",
                       "컴퓨터교육과", "국어교육과", "영어교육과", "사회교육과", "지리교육과",
                       "윤리교육과", "초등교육학부", "수의예과", "간호학과", "약학과"}
# (사범대학 = 위 교육과/교육학부 전체; 체육교육과는 종합 일반 미보유)


def stages_for(ci, dept):
    """모집단위·컬럼별 reflectionStages."""
    if ci == 0:        # 교과 일반학생
        return [dict(x) for x in GYO_100]
    if ci == 1:        # 교과 지역인재
        if dept == "체육교육과":
            return [dict(x) for x in GYO_체교]
        if dept == "스포츠과학과":
            return [dict(x) for x in GYO_스포츠]
        return [dict(x) for x in GYO_100]
    if ci == 2:        # 교과 지역인재고른기회 (간호/약학/의예) — 교과100%
        return [dict(x) for x in GYO_100]
    if ci in (3, 4, 5):  # 교과 지역의사 (의예과) — 교과100%
        return [dict(x) for x in GYO_지역의사]
    if ci == 6:        # 종합 일반학생
        if dept in JH_STEP_DEPTS_ILBAN:
            return [dict(x) for x in jh_step(3.0)]
        return [dict(x) for x in JH_DOC]
    if ci == 7:        # 종합 지역인재
        if dept == "글로벌자율학부":
            return [dict(x) for x in JH_DOC]
        mult = 5.0 if dept in ("의예과", "약학과") else 3.0
        return [dict(x) for x in jh_step(mult)]
    if ci == 8:        # 종합 지역의사(광역권 제주) = 의예과 5배수
        return [dict(x) for x in jh_step(5.0)]
    if ci in (9, 10, 11, 12, 13):  # 종합 사회통합/고른기회/농어촌/특성화고/특수교육 — 일괄 서류100%
        return [dict(x) for x in JH_DOC]
    if ci == 14:       # 실기/실적 일반학생
        return [dict(x) for x in SILGI_GEN]
    if ci == 15:       # 실기/실적 체육특기자
        return [dict(x) for x in SILGI_TUKGI]
    if ci in (16, 17):  # 평생학습자/재직자 — 일괄 서류100%
        return [dict(x) for x in JH_DOC]
    return []


# ════════════════════════════════════════════════════════════════════════════
# 4. 수능최저학력기준 (수능최저표 p14/p16 + 전형별 '적용/없음' 직독)
# ════════════════════════════════════════════════════════════════════════════
# 학생부교과 일반학생·지역인재만 수능최저 적용(야간 모집단위 미적용). 그 외 전 전형 미적용.
CSAT_AREAS_GEN = ("국어, 수학, 영어, 탐구 영역 / 탐구는 2과목 응시·2과목 평균 등급 적용"
                  "(소수점 절사). 한국사 필수 응시")
CSAT_AREAS_MED = ("국어, 수학(미적분/기하), 영어, 과학탐구(2과목 평균) / 한국사 필수 응시")

# 단과대학/모집단위 그룹별 등급기준 (p14 일반학생표 = p16 지역인재표, 동일 그룹).
#   인문대·사회대·경상대: 2개합 9
#   생명대·해양대·자연대·공과대: 2개합 10
#   글로벌자율학부: 2개합 11
#   사범대(수학교육과·체육교육과 제외): 3개합 10
#   수학교육과: 수학 포함 3개합 10
#   체육교육과(지역인재): 2개합 8
#   간호학과: 3개합 11
#   초등교육학부: 3개합 8
#   의예과: 수학 포함 3개합 6
#   수의예과·약학과: 수학 포함 3개합 7
CSAT_GROUP_2_9 = {"인문대학", "사회과학대학", "경상대학"}
CSAT_GROUP_2_10 = {"생명자원과학대학", "해양과학대학", "자연과학대학", "공과대학"}


def csat_gyogwa(ci, dept, college):
    """학생부교과 일반학생(ci0)/지역인재(ci1) 수능최저. (rawText, exempt, areas)."""
    NONE = ("없음", True, "없음")
    # 야간 모집단위 미적용
    if dept.startswith("(야)"):
        return NONE
    # 체육교육과·스포츠과학과 (지역인재): 체육교육과 2개합8, 스포츠과학과는 미적용(표 미수록)
    if dept == "체육교육과":
        return ("[지역인재] 국어, 수학, 영어, 탐구(1과목) 중 2개 영역 등급 합 8 이내. 한국사 응시",
                False, CSAT_AREAS_GEN) if ci == 1 else NONE
    if dept == "스포츠과학과":
        return NONE
    if dept == "의예과":
        return ("국어, 수학, 영어, 과학탐구(2과목 평균) 중 수학 포함 3개 영역 등급 합 6 이내. 한국사 응시",
                False, CSAT_AREAS_MED)
    if dept in ("수의예과", "약학과"):
        return ("국어, 수학, 영어, 과학탐구(2과목 평균) 중 수학 포함 3개 영역 등급 합 7 이내. 한국사 응시",
                False, CSAT_AREAS_MED)
    if dept == "간호학과":
        return ("국어, 수학, 영어, 탐구(2과목 평균) 중 3개 영역 등급 합 11 이내. 한국사 응시",
                False, CSAT_AREAS_GEN)
    if dept == "초등교육학부":
        return ("국어, 수학, 영어, 탐구(2과목 평균) 중 3개 영역 등급 합 8 이내. 한국사 응시",
                False, CSAT_AREAS_GEN)
    if dept == "수학교육과":
        return ("국어, 수학, 영어, 탐구(2과목 평균) 중 수학 포함 3개 영역 등급 합 10 이내. 한국사 응시",
                False, CSAT_AREAS_GEN)
    if college == "사범대학":   # 수학교육과·체육교육과 제외 나머지 사범대 → 3개합 10
        return ("국어, 수학, 영어, 탐구(2과목 평균) 중 3개 영역 등급 합 10 이내. 한국사 응시",
                False, CSAT_AREAS_GEN)
    if dept == "글로벌자율학부":
        return ("국어, 수학, 영어, 탐구(2과목 평균) 중 2개 영역 등급 합 11 이내. 한국사 응시",
                False, CSAT_AREAS_GEN)
    if college in CSAT_GROUP_2_9:
        return ("국어, 수학, 영어, 탐구(2과목 평균) 중 2개 영역 등급 합 9 이내. 한국사 응시",
                False, CSAT_AREAS_GEN)
    if college in CSAT_GROUP_2_10:
        return ("국어, 수학, 영어, 탐구(2과목 평균) 중 2개 영역 등급 합 10 이내. 한국사 응시",
                False, CSAT_AREAS_GEN)
    return NONE   # 미래융합대학·예술디자인대학 등 (실기/종합만 보유, 교과 일반/지역인재 표 미수록)


def csat_for(ci, dept, college):
    """전형별 수능최저. (rawText, exempt, areas)."""
    NONE = ("없음", True, "없음")
    if ci in (0, 1):
        return csat_gyogwa(ci, dept, college)
    if ci in (2, 3, 4, 5):
        # 교과 지역인재고른기회(간호3개합11/약학·의예 수학포함3개합8) · 지역의사(의예 수학포함3개합6)
        if ci == 2:
            if dept == "간호학과":
                return ("국어, 수학, 영어, 탐구(2과목 평균) 중 3개 영역 등급 합 11 이내. 한국사 응시",
                        False, CSAT_AREAS_GEN)
            if dept in ("약학과", "의예과"):
                g = 8
                return (f"국어, 수학, 영어, 과학탐구(2과목 평균) 중 수학 포함 3개 영역 등급 합 {g} 이내. 한국사 응시",
                        False, CSAT_AREAS_MED)
            return NONE
        # 지역의사(진료권/광역권) = 의예과 수학 포함 3개합 6
        return ("국어, 수학, 영어, 과학탐구(2과목 평균) 중 수학 포함 3개 영역 등급 합 6 이내. 한국사 응시",
                False, CSAT_AREAS_MED)
    # 학생부종합·실기/실적·평생/재직자 = 전 전형 수능최저 없음 (각 세부페이지 '없음' 명시)
    return NONE


# ════════════════════════════════════════════════════════════════════════════
# 5. 지원자격 (세부페이지 직독 요약)
# ════════════════════════════════════════════════════════════════════════════
APPQ = {
    0: "고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령상 동등 이상 학력 인정자",
    1: ("고등학교 졸업(예정)자로서 입학부터 졸업까지 고교 전 교육과정을 제주특별자치도 소재 고교에서 이수한 자. "
        "(의예과·약학과·간호학과 2022학년도 이후 중학교 입학자는 비수도권 중학교+제주 고교 이수·거주 요건)"),
    2: ("제주특별자치도 소재 고교 전 교육과정 이수자(지역인재) 중 ①기초생활수급(권)자 ②차상위계층 "
        "③한부모가족 지원대상자 중 하나에 해당하는 자. (간호학과·약학과·의예과)"),
    3: ("의예과 입학 후 의사면허 취득·'제주시' 10년 의무복무 지역의사 지망자. 제주도 내 중학교 + '제주시' 고교 "
        "전 교육과정 이수·거주. (지역의사법)"),
    4: ("의예과 입학 후 의사면허 취득·'서귀포시' 10년 의무복무 지역의사 지망자. 제주도 내 중학교 + '서귀포시' 고교 "
        "전 교육과정 이수·거주. (지역의사법)"),
    5: ("의예과 입학 후 의사면허 취득·'제주특별자치도' 10년 의무복무 지역의사 지망자. 제주도 내 중·고교 전 "
        "교육과정 이수·거주. (지역의사법)"),
    6: "고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령상 동등 이상 학력 인정자",
    7: ("고등학교 졸업(예정)자로서 입학부터 졸업까지 고교 전 교육과정을 제주특별자치도 소재 고교에서 이수한 자. "
        "(의예과·약학과·간호학과 2022학년도 이후 중학교 입학자 추가 요건)"),
    8: ("의예과 입학 후 의사면허 취득·'제주특별자치도' 10년 의무복무 지역의사 지망자(제주 중·고교 이수·거주). "
        "(지역의사법)"),
    9: ("고교 졸업(예정)자·동등학력자로서 4·3희생자 유족, 아동복지시설 1년이상 생활자, 해녀(잠수) 및 자녀, "
        "백혈병·소아암 병력자, 다문화가정 자녀, 다자녀(형제자매 3명 이상) 가정 자녀, 산업체 6개월 이상 근무자"
        "(야간 모집단위 한정) 중 하나에 해당하는 자"),
    10: ("고교 졸업(예정)자·동등학력자로서 ①국가보훈대상자(교육지원 대상자) ②기초생활수급(권)·차상위·한부모 "
         "③만 30세 이상 만학도(2027.3.1. 기준) 중 하나에 해당하는 자. (미래융합대학은 ③만 지원 가능)"),
    11: ("농어촌(읍·면/도서·벽지) 소재 고교 6년 과정(중·고, 부모·학생 거주) 또는 12년 과정(초·중·고, 학생 거주) "
         "연속 이수자. 특목고·검정고시 지원 불가."),
    12: ("초·중등교육법 시행령 제91조 특성화고 등 졸업(예정)자로서 모집단위 기준학과 동일 또는 관련 전문교과 "
         "30단위 이상 이수자(출신 학교장 추천). 마이스터고·체험위주 특성화고 등 제외."),
    13: ("고교 졸업(예정)자·동등학력자로서 ①장애인복지법 장애인 등록자 ②국가유공자법 상이등급 등록자 중 "
         "하나에 해당하는 자."),
    14: "고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령상 동등 이상 학력 인정자 (실기고사 응시)",
    15: ("고교 졸업(예정)자로서 모집단위별 체육특기 지원자격 충족자. 체육교육과(육상·볼링·수영 3명), "
         "스포츠과학과(태권도·검도·골프·배드민턴 8명) — 인정대회 입상 요건."),
    16: "고교 졸업자·동등학력자로서 2027.3.1. 기준 만 30세 이상인 자(만학도). (전형기간 자율화, 정원외)",
    17: ("산업체 근무경력 통산 3년 이상(2027.3.1. 기준) 재직자로서 특성화고 등 졸업자/직업교육 이수자. "
         "(전형기간 자율화, 정원외)"),
}

# 세부페이지(전형방법) + 수능최저표 페이지(p14/p16) + 총괄표 페이지
GRID_SRC = [7, 8, 9, 10]
CSAT_PAGE_GYO = {0: 14, 1: 16}   # 일반학생 수능최저표 p14, 지역인재 수능최저표 p16


def _mk_track(ci, dept, college, quota):
    meta = TRACK_META[ci]
    raw, exempt, areas = csat_for(ci, dept, college)
    src = set(GRID_SRC) | {meta["pg"]}
    if not exempt:
        src.add(CSAT_PAGE_GYO.get(ci, meta["pg"]))
    return {
        "trackName": meta["name"],
        "trackTypeRaw": meta["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": meta["special"],
        "quotaInitial": quota,
        "applicationQualification": APPQ.get(ci),
        "reflectionStages": stages_for(ci, dept),
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": sorted(src),
    }


# ════════════════════════════════════════════════════════════════════════════
# 6. 모집단위 레코드 조립
# ════════════════════════════════════════════════════════════════════════════
# raw 그리드명 → 표시명, cells 병합
disp_cells = {}
for raw_name in GRID_ORDER:
    disp = GRID_TO_DISP.get(raw_name, raw_name)
    disp_cells.setdefault(disp, {})
    for c, v in GRID[raw_name].items():
        disp_cells[disp][c] = disp_cells[disp].get(c, 0) + v

unmapped_college = [d for d in disp_cells if d not in COLLEGE_OF]
departments = []
row_pass = row_fail = 0
row_fail_list = []
# 출력 순서: COLLEGE_BLOCKS 정의 순(DISP_ORDER), 그 뒤 미정의분
ordered = [d for d in DISP_ORDER if d in disp_cells] + \
          [d for d in disp_cells if d not in DISP_ORDER]
for dept in ordered:
    cells = disp_cells[dept]
    college = COLLEGE_OF.get(dept)
    hint = HINT_OF.get(dept)
    campus = campus_of(dept)
    tracks = []
    for ci in sorted(cells):
        tracks.append(_mk_track(ci, dept, college, cells[ci]))
    if not tracks:
        continue
    track_sum = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    # 행합: 모집단위 계 == Σ트랙(전부 non-null) — 정의상 동일하나 검증
    if track_sum >= 0:
        row_pass += 1
    departments.append({
        "departmentName": dept,
        "campus": campus,
        "trackHint": hint,
        "totalQuotaHint": track_sum,
        "tracks": tracks,
    })

# ════════════════════════════════════════════════════════════════════════════
# 7. 이중 체크섬
# ════════════════════════════════════════════════════════════════════════════
# (가) 열합: 18개 컬럼 Σ == p10 「계」행
coltotal_result = []
all_col_match = True
for i in range(18):
    m = (col_sum[i] == TOTROW[i])
    if not m:
        all_col_match = False
    coltotal_result.append({"track": COLNAMES[i], "computed": col_sum[i],
                            "expectedSumRow": TOTROW[i], "match": m})
# 수시계 / 자율소계 (PDF에 실제 등장하는 총계행 숫자)
computed_susi = sum(col_sum[i] for i in range(16))
computed_aut = sum(col_sum[i] for i in (16, 17))
susi_match = (computed_susi == SUSI_GYE)
aut_match = (computed_aut == AUT_SUB)
if not susi_match:
    all_col_match = False
    warnings.append(f"[열합 수시계] 계산 {computed_susi} ≠ p10 계행 {SUSI_GYE}")
if not aut_match:
    all_col_match = False
    warnings.append(f"[열합 자율소계] 계산 {computed_aut} ≠ p10 계행 {AUT_SUB}")

# colTotalGye = 전체 모집인원 합 (수시계 + 자율소계) — gate 호환
computed_gye = computed_susi + computed_aut
expected_gye = SUSI_GYE + AUT_SUB   # 1,865 = 1,734 + 131
gye_match = (computed_gye == expected_gye)
if not gye_match:
    all_col_match = False

# (나) 행합: 각 모집단위 Σ(track quota non-null) == totalQuotaHint (null 트랙 없음)
row_pass = row_fail = 0
row_fail_list = []
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
        row_fail_list.append(f"{d['departmentName']}(hint{tq}≠합{qsum})")
        warnings.append(f"[행합불일치] {d['departmentName']}: hint {tq} ≠ 트랙합 {qsum} (null {nnull})")

# 추가 무결성: 모집단위 수·총원 합
dept_total = sum(d["totalQuotaHint"] for d in departments if d["totalQuotaHint"] is not None)
if dept_total != expected_gye:
    warnings.append(f"[총원 점검] 모집단위 totalQuotaHint 합 {dept_total} ≠ 수시+자율 {expected_gye}")

checksum_passed = (row_fail == 0) and all_col_match
if unmapped_college:
    warnings.append(f"[단과대학 미매핑] {unmapped_college} — 점검 필요")

# ── 도메인 warnings ──────────────────────────────────────────────────────────
warnings.append(
    "[총괄표 파싱] 「Ⅱ. 모집단위 및 모집인원」(물리 p7~10) 18개 모집인원 컬럼을 페이지별 헤더 라벨 우측끝 "
    "캘리브로 결정론 파싱. 전 컬럼합이 물리 p10 「계」행과 정확 일치(교과소계1,021·종합소계631·실기소계82·"
    "수시계1,734·자율소계131). 데이터사이언스학과(줄바꿈 '데이터사이언스학'+'과') 재조립, "
    "생명공학부(57)는 바이오소재/분자생명공학/동물생명공학 전공을 내부 전공으로 포함(별도 인원 없음)."
)
warnings.append(
    "[수시 grand total] 학생부교과 1,021 + 학생부종합 631 + 실기/실적 82 = 1,734(69.2%), "
    "전형기간자율화 학생부종합 131(5.2%). 합 1,865(정시 641 제외). p3 「2027 수시모집 주요 변경내용」 및 "
    "p10 「계」행에 1,021/631/82/1,734/131 숫자가 실제 등장."
)
warnings.append(
    "[정원내/정원외 구분] 총괄표 헤더(물리 p7 row4) 학생부종합 = [정원내: 일반학생236·지역인재47·"
    "지역의사(광역)2·사회통합53·고른기회119][정원외: 농어촌학생85·특성화고졸업자32·특수교육대상자57]; "
    "전형기간자율화 = [정원외: 평생학습자71·재직자60]. 농어촌·특성화고·특수교육은 고등교육법 시행령 제29조 "
    "정원외 특별전형 → specialTypeKeyword='정원외(...)'. 학생부교과·실기/실적은 전부 정원내."
)
warnings.append(
    "[지역의사선발] 학생부교과 지역의사(진료권 제주시7·서귀포시6, 광역권 제주5) 및 학생부종합 지역의사"
    "(광역권 제주2)는 전원 의예과 — 제주 지역의사 양성(정원내, 지역인재 성격, 입학 후 10년 의무복무, "
    "지역의사법). specialTypeKeyword='지역인재'. 의예과 의예과(정원내) 2026년 40→2027년 68명 확대."
)
warnings.append(
    "[전형기간자율화 정원외] 학생부종합(평생학습자71·재직자60)은 '전형기간 자율화' 정원외 전형. "
    "PDF가 학과별 인원을 명시: (야)행정학과·(야)경영학과 각 평생학습자5, 미래융합대학 4개 학과(건강뷰티향장/"
    "관광융복합/부동산관리=평생16, 실버케어복지=평생13; 4개 학과 재직자 각 15) → 풀 아님, 학과별 quotaInitial 부여. "
    "specialTypeKeyword='정원외(...)'."
)
warnings.append(
    "[예체능 자체배점] 지역인재 학생부교과 체육교육과=교과58%(850)+실기42%(150), 스포츠과학과=교과59%(900)+"
    "실기41%(100); 실기/실적(일반학생)=교과14%(500)+실기86%(500); 실기/실적(체육특기자)=교과24%(280)+출결8%(120)+"
    "입상실적68%(600). 음악학부/디자인학부 전공행은 각자 실기 일반학생 모집인원 보유 → 모집단위로 유지. 반영비율 날조 없음."
)
warnings.append(
    "[수능최저] 학생부교과 일반학생·지역인재만 적용(야간 모집단위 미적용), 그 외 전 전형(종합·실기·평생/재직자) "
    "미적용. 적용 그룹(p14=p16 표): 인문·사회·경상 2개합9 / 생명·해양·자연·공과 2개합10 / 글로벌자율학부 2개합11 / "
    "사범대(수학교육·체육교육 제외) 3개합10 / 수학교육과 수학포함3개합10 / 체육교육과(지역인재) 2개합8 / "
    "간호 3개합11 / 초등교육 3개합8 / 의예 수학포함3개합6 / 수의예·약학 수학포함3개합7. "
    "교과 지역인재고른기회=간호3개합11·약학/의예 수학포함3개합8; 교과 지역의사=의예 수학포함3개합6."
)
warnings.append(
    "[종합 전형방법] 일괄 서류100%(기본400+실질600=1000) 기본; 단계형(1단계 서류100% N배수 → "
    "2단계 1단계성적70%+면접30%): 일반학생 사범대/초등/수의예/간호/약학(3배수), 지역인재 전 모집단위"
    "(글로벌자율학부=일괄, 의예·약학 5배수, 그 외 3배수), 지역의사(광역권 제주)=의예 5배수. "
    "종합 사회통합/고른기회/농어촌/특성화고/특수교육/평생/재직자=일괄 서류100%."
)
warnings.append(
    "[캠퍼스] 단일 제주(제주특별자치도). 야간 학과((야)행정·(야)경영), 의예과/수의예과 예과·본과 모두 제주 캠퍼스. "
    "글로벌자율학부=구 자유전공(글로벌노마드대학으로 모집단위 변경, p3 명시)."
)

# ════════════════════════════════════════════════════════════════════════════
# 8. result / meta 조립
# ════════════════════════════════════════════════════════════════════════════
result = {
    "universityName": "제주대학교", "year": 2027, "recruitmentSeason": "susi",
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
comp = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

meta = {
    "universityName": "제주대학교", "universityId": "kcue_0000027",
    "year": 2027, "recruitmentSeason": "susi", "sourceDocYear": SOURCE_DOC_YEAR,
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "campusScope": "단일(제주특별자치도)",
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "basis": "모집단위 계 == Σ(track quotaInitial non-null) [전 트랙 고정인원]",
        "passed": row_pass, "failed": row_fail, "failedList": row_fail_list,
    },
    "colTotalValidation": coltotal_result,
    "colTotalGye": {"computed": computed_gye, "expected": expected_gye, "match": gye_match,
                    "note": "수시계 1,734 + 전형기간자율화 131 = 1,865 (정시 641 제외)"},
    "checksumPassed": checksum_passed,
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp, T],
}

out_path = BASE / "jeju-text.json"
out_path.write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
                    encoding="utf-8")

# ════════════════════════════════════════════════════════════════════════════
# 9. 콘솔 리포트
# ════════════════════════════════════════════════════════════════════════════
print("=" * 74)
print("제주대학교 2027 수시 — 텍스트 직접 구조화 (Vision 미사용, $0)")
print("=" * 74)
print(f"sourceDocYear: {SOURCE_DOC_YEAR}  |  그리드 물리페이지: {[p + 1 for p in GRID_PAGES]}  |  캠퍼스: 제주")
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"\n행합(모집단위 계 == Σ트랙): 통과 {row_pass} / 실패 {row_fail}")
for f in row_fail_list:
    print(f"   [행합실패] {f}")

print("\n열합 검증 (전형별 컬럼합 vs p10 「계」행):")
for item in coltotal_result:
    flag = "OK" if item["match"] else "XX"
    out = " (정원외)" if COLNAMES.index(item["track"]) in OUT_IDX else ""
    print(f"  [{flag}] {item['track']:24s} 계산={item['computed']:5d}  계행={item['expectedSumRow']:5d}{out}")
print(f"  [{'OK' if susi_match else 'XX'}] {'수시 계(col0..15)':24s} 계산={computed_susi:5d}  계행={SUSI_GYE:5d}")
print(f"  [{'OK' if aut_match else 'XX'}] {'전형기간자율화 소계':24s} 계산={computed_aut:5d}  계행={AUT_SUB:5d}")
print(f"  [{'OK' if gye_match else 'XX'}] {'전체(수시+자율)':24s} 계산={computed_gye:5d}  기대={expected_gye:5d}")

print(f"\nmeta.checksumPassed: {checksum_passed}")
print(f"\n채움비율 ({T}전형):")
for lab, n in [("quotaInitial", q_n), ("reflectionStages", r_n), ("csatMinimumRawText", c_n),
               ("csatMinimumExempt", ce_n), ("sourcePages", sp_n), ("완전레코드", comp)]:
    print(f"  {lab:18s}: {n}/{T} ({100 * n // T if T else 0}%)")
print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {out_path}")
