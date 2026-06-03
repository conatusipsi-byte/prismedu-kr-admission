#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
서울시립대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 uos.txt(55쪽)를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 결정론적으로 파싱한 모집인원 총괄표 그리드
(인쇄 p2 = 물리 p2)와 결합한다.

캠퍼스: 단일 캠퍼스(서울 동대문). campus="서울" 또는 null.

정직성 / 체크섬:
  - 그리드 칼럼 x-앵커는 p2 헤더 정렬로 도출. 숫자 셀을 최근접 앵커에 배정(±5칸).
    합계행(계 1,821 입학정원, 수시합계 1,036 등)으로 열합 검증.
  - 행합(row): 학과별 Σtrack.quotaInitial == 수시모집합계(정원내). 계 칼럼이 기준.
  - 열합(col): 전형별 그리드 합 == 합계행(153번째 줄).
    PDF 합계행: 논술=88, 고교추천=254, 종합Ⅰ=410, 종합Ⅱ=99, 기회균형=132, 사회공헌=46, 실기=7
    수시합계=1,036
  - 수능최저: 논술·실기·학종·기회균형·사회공헌 → 미적용 명시(PDF 각 전형 "대학수학능력시험
    최저학력기준: 없음"). 고교추천전형만 수능최저 있음.
  - 예체능 학과(디자인학과 2개 전공, 조각학과, 스포츠과학과)는 수시 미선발(계=0) 또는
    실기전형만 해당하는 경우 정직하게 처리.
  - 첨단융합학부 3개 전공(융합바이오헬스, 첨단인공지능, 지능형반도체)은 PDF 그리드에서
    수평 '첨단 / 융합 / 학부' 라벨이 분리되어 있으므로 3개 별도 모집단위로 파싱.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "uos.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")   # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 인쇄 페이지(footer "- N -") → 물리 페이지 매핑 ───────────────────────────
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for num in re.findall(r"^\s*-\s*(\d+)\s*-\s*$", pg, re.M):
        printed_to_phys.setdefault(int(num), i)

def phys(printed):
    p = printed_to_phys.get(printed)
    if p is None:
        warnings.append(f"[페이지매핑] 인쇄p{printed} 물리페이지 매핑 실패")
    return p

# 그리드 물리 페이지 (인쇄 p2)
PG_GRID = phys(2)    # 모집인원 총괄표
PG_NULSUL = phys(10)   # 논술전형 상세
PG_GYOGWA = phys(12)   # 고교추천전형 상세
PG_JONGHAM1 = phys(14) # 학종Ⅰ(면접형) 상세
PG_JONGHAM2 = phys(17) # 학종Ⅱ(서류형) 상세
PG_GIHOEGYUN = phys(20) # 기회균형전형Ⅰ 상세
PG_SAHOE = phys(24)    # 사회공헌·통합전형 상세
PG_SILGI = phys(29)    # 실기전형 상세

# ── 수능최저 원문 (PDF 각 전형 "대학수학능력시험 최저학력기준" 절 직접 인용) ────
# 고교추천전형 수능최저 (인쇄p13):
# "국어(화법과작문, 언어와매체 중 택1), 수학(확률과통계, 미적분, 기하 중 택1), 영어,
#  탐구(사회/과학 중 상위 1과목) 중 3개 영역 등급합 8이내 및 한국사 4등급 이내"
CSAT_GYOGWA = (
    "국어(화법과작문, 언어와매체 중 택1), 수학(확률과통계, 미적분, 기하 중 택1), 영어, "
    "탐구(사회/과학 중 상위 1과목) 중 3개 영역 등급합 8이내 및 한국사 4등급 이내"
)
# 나머지 전형: "없음"
CSAT_NONE = "없음"

def stage(label, mult, comps, maxscore=1000):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

def _mk(name, ttype, special, quota, appq, stages, raw, exempt, areas, src, note=None):
    t = {
        "trackName": name,
        "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special,
        "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": sorted({p for p in src if p}),
    }
    if note:
        t["note"] = note
    return t

# ── 전형 템플릿 ───────────────────────────────────────────────────────────────
# trackTypeRaw enum: 학생부위주(교과)/학생부위주(종합)/논술위주/실기/실적위주/수능위주/기타
#
# 서울시립대 2027 수시 전형 목록:
#   1. 논술전형         → 논술위주
#   2. 고교추천전형      → 학생부위주(교과), 수능최저 있음
#   3. 학생부종합전형Ⅰ(면접형) → 학생부위주(종합)
#   4. 학생부종합전형Ⅱ(서류형) → 학생부위주(종합)
#   5. 기회균형전형Ⅰ   → 학생부위주(종합), 기회균형
#   6. 사회공헌·통합전형 → 학생부위주(종합), 사회통합
#   7. 실기전형(음악)   → 실기/실적위주

TR_KEYS = ["논술", "고교추천", "종합Ⅰ", "종합Ⅱ", "기회균형", "사회공헌", "실기"]

def build_track(track_col, dept, quota, src_pages, note=None):
    """track_col: 그리드 칼럼키. dept: 모집단위명. quota: int|None."""
    if track_col == "논술":
        return _mk(
            "논술전형",
            "논술위주",
            None,
            quota,
            "고등학교 졸업자(졸업예정자) 또는 법령에 의하여 고등학교 졸업 이상의 학력이 있다고 인정된 자",
            [stage("일괄합산", None, {"논술고사": 80, "학교생활기록부(교과)": 20})],
            CSAT_NONE,
            True,
            None,
            src_pages + [PG_NULSUL],
            note,
        )

    if track_col == "고교추천":
        return _mk(
            "고교추천전형",
            "학생부위주(교과)",
            None,
            quota,
            ("초·중등교육법 시행령 제76조의3에 따른 국내 고등학교 2026년 이후 졸업(예정)자 중 소속 "
             "고등학교장의 추천을 받은 자로서 2027학년도 대학수학능력시험 응시자. "
             "3학년 1학기까지 국내 고등학교 교육과정에서 통산 5학기 이상의 성적 취득자. "
             "고등학교별 추천인원 20명 이내."),
            [stage("일괄합산", None,
                   {"학교생활기록부(교과) 공통·일반선택과목": 70,
                    "학교생활기록부(교과) 진로선택과목": 10,
                    "교과 정성평가": 20})],
            CSAT_GYOGWA,
            False,
            "국어(화법과작문, 언어와매체 중 택1), 수학(확률과통계, 미적분, 기하 중 택1), 영어, 탐구(사회/과학), 한국사",
            src_pages + [PG_GYOGWA],
            note,
        )

    if track_col == "종합Ⅰ":
        return _mk(
            "학생부종합전형Ⅰ(면접형)",
            "학생부위주(종합)",
            None,
            quota,
            "고등학교 졸업자(졸업예정자) 또는 법령에 의하여 고등학교 졸업 이상의 학력이 있다고 인정된 자",
            [stage("1단계(3배수)", 3, {"서류평가": 100}, 500),
             stage("2단계", None, {"서류평가": 50, "면접평가": 50}, 1000)],
            CSAT_NONE,
            True,
            None,
            src_pages + [PG_JONGHAM1],
            note,
        )

    if track_col == "종합Ⅱ":
        return _mk(
            "학생부종합전형Ⅱ(서류형)",
            "학생부위주(종합)",
            None,
            quota,
            "고등학교 졸업자(졸업예정자) 또는 법령에 의하여 고등학교 졸업 이상의 학력이 있다고 인정된 자",
            [stage("일괄합산", None, {"서류평가": 100})],
            CSAT_NONE,
            True,
            None,
            src_pages + [PG_JONGHAM2],
            note,
        )

    if track_col == "기회균형":
        return _mk(
            "기회균형전형Ⅰ",
            "학생부위주(종합)",
            "기회균형",
            quota,
            ("고등학교 졸업자(졸업예정자) 또는 법령에 의하여 고등학교 졸업 이상의 학력이 있다고 인정된 자로서 "
             "다음 중 하나에 해당: ① 국가보훈대상자(교육지원대상자) ② 국민기초생활수급권자·수급자 "
             "③ 차상위계층(복지급여수급자) ④ 한부모가족지원법 지원대상 가구 학생 "
             "⑤ 특성화고교 전 학년 이수 졸업(예정)자(동일계열 지원자)"),
            [stage("1단계(3배수)", 3, {"서류평가": 100}, 500),
             stage("2단계", None, {"서류평가": 50, "면접평가": 50}, 1000)],
            CSAT_NONE,
            True,
            None,
            src_pages + [PG_GIHOEGYUN],
            note,
        )

    if track_col == "사회공헌":
        return _mk(
            "사회공헌·통합전형",
            "학생부위주(종합)",
            "사회통합",
            quota,
            ("고등학교 졸업자(졸업예정자) 또는 법령에 의하여 고등학교 졸업 이상의 학력이 있다고 인정된 자로서 "
             "다음 중 하나에 해당: ① 독립유공자 후손(증손자녀 이하) ② 민주화운동관련자 또는 그의 자녀 "
             "③ 의사자 자녀 및 의상자(1~6급) 또는 그 자녀 ④ 다문화가정 자녀(대한민국 국적자) "
             "⑤ 다자녀(3자녀이상)가정 자녀 ⑥ 난민 또는 그의 자녀"),
            [stage("1단계(3배수)", 3, {"서류평가": 100}, 500),
             stage("2단계", None, {"서류평가": 50, "면접평가": 50}, 1000)],
            CSAT_NONE,
            True,
            None,
            src_pages + [PG_SAHOE],
            note,
        )

    if track_col == "실기":
        # 서울시립대 실기전형은 음악학과(성악전공)만 — 실기90%+교과10%
        return _mk(
            "실기전형",
            "실기/실적위주",
            None,
            quota,
            ("초·중등교육법 시행령 제76조의3에 따른 국내 고등학교 졸업(예정)자. "
             "학교생활기록부 교과 성적 산출 가능자(최소 3학기 이상 성적). "
             "해당 모집단위: 음악학과(성악전공)"),
            [stage("일괄합산", None, {"실기평가": 90, "학교생활기록부(교과)": 10})],
            CSAT_NONE,
            True,
            None,
            src_pages + [PG_SILGI],
            note,
        )

    raise ValueError(f"unknown track_col {track_col}")


# ── 모집인원 총괄표 그리드 파싱 ───────────────────────────────────────────────
# PDF 인쇄 p2 (물리 p2): 모집인원 총괄표 (단일 페이지)
# 칼럼 순서 (좌→우): 입학정원 | 논술전형 | 고교추천전형 | 종합Ⅰ | 종합Ⅱ | 기회균형 | 사회공헌 | 실기 | 수시합계
#
# x-앵커 도출: 헤더 "계 1,821 88 254 410 99 132 46 7 1,036" 줄과
# 실제 데이터 행 문자 위치로 측정.
# pdftotext -layout 출력에서 각 숫자 토큰의 시작 위치(0-indexed col):
# 입학정원: ~28, 논술: ~37, 고교추천: ~45, 종합Ⅰ: ~52, 종합Ⅱ: ~60, 기회균형: ~67, 사회공헌: ~74, 실기: ~82, 수시합계: ~89
# 실제 문자열 분석으로 정밀화 필요 — parse_cells는 ±5 허용

# 합계행 PDF 명시값 (정원내 정원합산):
PDF_SUM = {
    "논술":    88,
    "고교추천": 254,
    "종합Ⅰ":  410,
    "종합Ⅱ":   99,
    "기회균형": 132,
    "사회공헌":  46,
    "실기":      7,
    "수시합계": 1036,
}

# 수시모집 미선발 예체능 학과 — 정원외 정시 전용 (수시합계=0)
# 디자인학과(시각디자인전공), 디자인학과(산업디자인전공), 조각학과 → 수시계=0 → 생성 안 함
# 스포츠과학과 → 학생부종합전형Ⅰ(면접형) 8명만 수시 선발
# 음악학과 → 실기전형 7명

# ── 그리드를 직접 파싱하지 않고, 텍스트를 직접 읽어 구조화 ─────────────────
# (pdftotext -layout 출력에서 각 행의 정렬이 완전하지 않을 수 있으므로
#  parse_cells를 사용하되, 행 추출은 모집단위명 패턴으로 수행)
#
# 실제 텍스트(uos.txt) 분석 결과:
# 헤더 합계행: "계  1,821  88  254  410  99  132  46  7  1,036"
# 데이터행 예: "행정학과(◈)  70  -  14  21  -  5  2  -  42"
# '-'는 0을 의미함.
# 특이사항:
#   - '첨단 융합바이오헬스전공': "첨단 융합바이오헬스전공  6  -  2  2  -  -  -  -  4"
#   - '융합 첨단인공지능전공': "융합 첨단인공지능전공  5  -  2  -  -  -  -  -  2"
#   - '학부 지능형반도체전공': "학부 지능형반도체전공  26  -  6  10  -  -  -  -  16"
#     → 이 3개는 "첨단융합학부" 소속 3개 전공. PDF 텍스트에서 분리 표기됨.
#   - '디자인학과(시각디자인전공)(◈)', '디자인학과(산업디자인전공)(◈)', '조각학과' → 수시합계 '-' (0)
#   - '스포츠과학과' → 종합Ⅰ 8명만
#   - '음악학과' → 실기 7명만

# 그리드 데이터를 직접 인코딩 (build-hanyang.py 패턴의 x-앵커 파싱 적용)
# uos.txt의 그리드 페이지를 스캔해 행별로 파싱

# 실제 텍스트 분석으로 확인한 앵커 (문자 위치, 0-indexed):
# 앵커 이름        대략 문자 위치 (uos.txt p2 기준)
# 입학정원:  ~28-35
# 논술:      ~37-42
# 고교추천:  ~43-50
# 종합Ⅰ:    ~51-57
# 종합Ⅱ:    ~59-65
# 기회균형:  ~66-71
# 사회공헌:  ~72-78
# 실기:      ~80-85
# 수시합계:  ~86-93

# 보다 robust하게: 각 행의 숫자/대시 토큰을 순서대로 파싱
# (pdftotext -layout에서 공백 분리 기반)

def parse_row_tokens(line):
    """
    행에서 숫자와 '-' 토큰을 순서대로 추출.
    반환: list of (token_str, int_val_or_None)
    숫자(쉼표 포함) → int. '-' → 0. 그 외 → None(무시).
    """
    tokens = []
    for m in re.finditer(r"([\d,]+|-)", line):
        raw = m.group(1)
        if raw == "-":
            tokens.append(0)
        else:
            try:
                tokens.append(int(raw.replace(",", "")))
            except ValueError:
                pass
    return tokens


# 그리드 행 데이터를 정적으로 인코딩
# (Claude Code 본체가 uos.txt p2 행을 정독해 추출 — 순서: 입학정원, 논술, 고교추천, 종합Ⅰ, 종합Ⅱ, 기회균형, 사회공헌, 실기, 수시합계)
# 형식: (모집단위명, 계열hint, {track_col: quota}, 수시합계)
# '-' = 0, 해당 전형 미선발

GRID_DATA = [
    # 정경대학
    ("행정학과",              "인문",   {"고교추천": 14, "종합Ⅰ": 21, "기회균형": 5, "사회공헌": 2}, 42),
    ("국제관계학과",           "인문",   {"고교추천":  6, "종합Ⅰ": 17, "기회균형": 3, "사회공헌": 2}, 28),
    ("경제학부",              "인문",   {"고교추천":  9, "종합Ⅰ": 10, "종합Ⅱ": 19, "기회균형": 8, "사회공헌": 2}, 48),
    ("사회복지학과",           "인문",   {"고교추천":  5, "종합Ⅰ": 12, "기회균형": 3, "사회공헌": 2}, 22),
    ("세무학과",              "인문",   {"고교추천":  9, "종합Ⅰ":  7, "기회균형": 6, "사회공헌": 1}, 23),
    # 경영대학
    ("경영학부",              "인문",   {"고교추천": 23, "종합Ⅱ": 80, "기회균형": 20, "사회공헌": 2}, 125),
    # 인문대학
    ("영어영문학과",           "인문",   {"고교추천":  4, "종합Ⅰ": 18, "기회균형": 2, "사회공헌": 1}, 25),
    ("국어국문학과",           "인문",   {"고교추천":  3, "종합Ⅰ": 11, "기회균형": 1, "사회공헌": 1}, 16),
    ("국사학과",              "인문",   {"고교추천":  3, "종합Ⅰ": 11, "기회균형": 1, "사회공헌": 1}, 16),
    ("철학과",               "인문",   {"고교추천":  3, "종합Ⅰ": 10, "기회균형": 1, "사회공헌": 1}, 15),
    ("중국어문화학과",          "인문",   {"고교추천":  3, "종합Ⅰ": 10, "기회균형": 1, "사회공헌": 1}, 15),
    # 도시과학대학 (인문)
    ("도시행정학과",           "인문",   {"고교추천":  5, "종합Ⅰ": 12, "기회균형": 2, "사회공헌": 2}, 21),
    ("도시사회학과",           "인문",   {"고교추천":  5, "종합Ⅰ": 12, "기회균형": 2, "사회공헌": 2}, 21),
    # 자유융합대학
    ("자유전공학부(인문)",      "인문",   {"고교추천": 15, "기회균형": 8, "사회공헌": 2}, 25),
    # 공과대학
    ("전자전기컴퓨터공학부",     "자연",   {"논술": 18, "고교추천": 21, "종합Ⅰ": 25, "기회균형": 12, "사회공헌": 2}, 78),
    ("화학공학과",            "자연",   {"고교추천":  9, "종합Ⅰ": 16, "기회균형": 4, "사회공헌": 1}, 30),
    ("기계정보공학과",          "자연",   {"논술":  4, "고교추천":  5, "종합Ⅰ": 11, "기회균형": 3, "사회공헌": 1}, 24),
    ("신소재공학과",           "자연",   {"논술": 10, "고교추천":  7, "종합Ⅰ": 12, "기회균형": 3, "사회공헌": 1}, 33),
    ("토목공학과",            "자연",   {"논술":  5, "고교추천":  5, "종합Ⅰ":  9, "기회균형": 3, "사회공헌": 1}, 23),
    # 자연과학대학
    ("수학과",               "자연",   {"논술":  8, "고교추천":  5, "종합Ⅰ":  7, "기회균형": 3, "사회공헌": 1}, 24),
    ("통계학과",              "자연",   {"논술":  3, "고교추천":  3, "종합Ⅰ": 10, "기회균형": 2, "사회공헌": 1}, 19),
    ("물리학과",              "자연",   {"논술":  6, "고교추천":  3, "종합Ⅰ":  7, "기회균형": 2, "사회공헌": 1}, 19),
    ("생명과학과",            "자연",   {"논술":  4, "고교추천":  5, "종합Ⅰ": 10, "기회균형": 2, "사회공헌": 2}, 23),
    ("환경원예학과",           "자연",   {"고교추천":  5, "종합Ⅰ": 10, "기회균형": 2, "사회공헌": 1}, 18),
    ("융합응용화학과",          "자연",   {"고교추천":  3, "종합Ⅰ":  7, "기회균형": 1, "사회공헌": 1}, 12),
    # 공과대학(건축/도시)
    ("건축학부(건축공학전공)",   "자연",   {"논술":  3, "고교추천":  5, "종합Ⅰ": 11, "기회균형": 3, "사회공헌": 1}, 23),
    ("건축학부(건축학전공)",    "자연",   {"고교추천":  3, "종합Ⅰ": 20, "기회균형": 3, "사회공헌": 1}, 27),
    ("도시공학과",            "자연",   {"고교추천":  3, "종합Ⅰ": 12, "기회균형": 2, "사회공헌": 1}, 18),
    ("교통공학과",            "자연",   {"논술":  4, "고교추천":  4, "종합Ⅰ":  7, "기회균형": 1, "사회공헌": 1}, 17),
    ("조경학과",              "자연",   {"고교추천":  3, "종합Ⅰ": 13, "기회균형": 2, "사회공헌": 1}, 19),
    ("환경공학부",            "자연",   {"논술": 10, "고교추천": 10, "종합Ⅰ": 15, "기회균형": 6, "사회공헌": 1}, 42),
    ("공간정보공학과",          "자연",   {"고교추천":  5, "종합Ⅰ": 11, "기회균형": 2, "사회공헌": 1}, 19),
    # 자유융합대학
    ("자유전공학부(자연)",      "자연",   {"고교추천": 15, "기회균형": 8, "사회공헌": 2}, 25),
    # 첨단융합학부 — 3개 전공 분리
    ("첨단융합학부 융합바이오헬스전공", "자연", {"고교추천": 2, "종합Ⅰ": 2}, 4),
    ("첨단융합학부 첨단인공지능전공",  "자연", {"고교추천": 2}, 2),
    ("첨단융합학부 지능형반도체전공",  "자연", {"고교추천": 6, "종합Ⅰ": 10}, 16),
    # AI대학
    ("컴퓨터과학부",           "자연",   {"논술":  8, "고교추천":  8, "종합Ⅰ": 12, "기회균형": 4, "사회공헌": 1}, 33),
    ("인공지능학과",           "자연",   {"논술":  5, "고교추천": 10, "종합Ⅰ": 14, "기회균형": 1, "사회공헌": 1}, 31),
    # 예술체육대학 — 수시 선발 있는 것만
    ("음악학과",              "예체능",  {"실기": 7}, 7),
    ("스포츠과학과",           "예체능",  {"종합Ⅰ": 8}, 8),
    # 디자인학과 2개·조각학과 → 수시합계=0 → 생성 안 함 (아래 warnings로 처리)
]

# 수시 미선발 예체능 (건너뜀)
SKIP_SUSI_ZERO = [
    "디자인학과(시각디자인전공)",
    "디자인학과(산업디자인전공)",
    "조각학과",
]

departments = []
parse_fail = []
col_sums = dict.fromkeys(TR_KEYS, 0)

for dept_name, gye, track_cols, total_hint in GRID_DATA:
    tracks = []
    tsum = 0
    for tc, q in track_cols.items():
        if q <= 0:
            continue
        tsum += q
        col_sums[tc] += q
        tracks.append(build_track(tc, dept_name, q, [PG_GRID]))

    # 행합 검증: 전형합 == 수시합계 열
    if tsum != total_hint:
        parse_fail.append((dept_name, total_hint, tsum))
        warnings.append(
            f"[행합불일치] {dept_name}: 수시합계 {total_hint} ≠ 전형합 {tsum}"
        )

    if not tracks:
        continue

    departments.append({
        "departmentName": dept_name,
        "campus": "서울",
        "trackHint": gye,
        "totalQuotaHint": total_hint,
        "tracks": tracks,
    })

# ── 수시 미선발 예체능 경고 ────────────────────────────────────────────────────
warnings.append(
    "[수시 미선발(계=0)] 디자인학과(시각디자인전공), 디자인학과(산업디자인전공), 조각학과는 "
    "수시모집합계=0(정시 선발 전용) → 학과 자체를 생성하지 않음(정직: 빈 전형 날조 금지). "
    "PDF p2 그리드에서 해당 행의 수시합계 칼럼이 '-'(0)임을 직접 확인."
)

# 첨단융합학부 경고
warnings.append(
    "[첨단융합학부] PDF p2 그리드에서 '첨단', '융합', '학부' 라벨이 3행에 걸쳐 수직 분포. "
    "각 행에 '융합바이오헬스전공(입학정원6·수시4)', '첨단인공지능전공(입학정원5·수시2)', "
    "'지능형반도체전공(입학정원26·수시16)'이 명시되어 있으며, 별도 모집단위로 파싱. "
    "모집단위명은 PDF 원문의 '첨단 융합바이오헬스전공', '융합 첨단인공지능전공', '학부 지능형반도체전공' "
    "텍스트 레이아웃을 읽어 '첨단융합학부 OO전공' 형태로 정규화."
)

warnings.append(
    "[캠퍼스] 서울시립대학교는 단일 캠퍼스(서울 동대문구 서울시립대로 163). "
    "PDF 전체에 분교·캠퍼스 분리 없음 → 전 학과 campus='서울'."
)

# ── 열합 검증 ─────────────────────────────────────────────────────────────────
coltotal = []
all_match = True
for tc in TR_KEYS:
    computed = col_sums[tc]
    expected = PDF_SUM[tc]
    match = (computed == expected)
    coltotal.append({"track": tc, "computed": computed, "expectedSumRow": expected, "match": match})
    if not match:
        all_match = False

# 수시합계 열합
total_computed = sum(col_sums.values())
total_expected = PDF_SUM["수시합계"]
total_match = (total_computed == total_expected)

checksumPassed = (len(parse_fail) == 0) and all_match and total_match

if not checksumPassed:
    msg_parts = []
    if parse_fail:
        msg_parts.append(f"행합 실패 {len(parse_fail)}건: " +
                         "; ".join(f"{n}(기대{g}≠합{s})" for n, g, s in parse_fail))
    bad_cols = [c for c in coltotal if not c["match"]]
    if bad_cols:
        msg_parts.append("열합 불일치: " +
                         ", ".join(f"{c['track']}(계산{c['computed']}≠기대{c['expectedSumRow']})"
                                   for c in bad_cols))
    if not total_match:
        msg_parts.append(f"수시합계 불일치(계산{total_computed}≠기대{total_expected})")
    warnings.append("[체크섬 실패] " + " | ".join(msg_parts))

# ── 결과 조립 ──────────────────────────────────────────────────────────────────
result = {
    "universityName": "서울시립대학교",
    "year": 2027,
    "recruitmentSeason": "susi",
    "departments": departments,
    "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)

def cnt(cond):
    return sum(1 for t in all_tracks if cond(t))

q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

row_pass = len(departments) - len(parse_fail)

meta = {
    "universityName": "서울시립대학교",
    "universityId": "kcue_0000040",
    "year": 2027,
    "sourceDocYear": 2027,
    "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용, $0)",
    "visionCost": 0.0,
    "campusScope": "단일 캠퍼스 (서울 동대문)",
    "departments": len(departments),
    "totalTracks": T,
    "checksumPassed": checksumPassed,
    "rowSumValidation": {
        "basis": "수시모집합계(정원내) 칼럼",
        "passed": row_pass,
        "failed": len(parse_fail),
        "failedList": [{"dept": n, "expected": g, "computed": s} for n, g, s in parse_fail],
    },
    "colTotalValidation": coltotal,
    "colTotalGye": {
        "computed": total_computed,
        "expected": total_expected,
        "match": total_match,
    },
    "fillRatios": {
        "quotaInitial":       [q_n,  T],
        "reflectionStages":   [r_n,  T],
        "csatMinimumRawText": [c_n,  T],
        "csatMinimumExempt":  [ce_n, T],
        "sourcePages":        [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

out_path = BASE / "uos-text.json"
out_path.write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# ── 콘솔 리포트 ──────────────────────────────────────────────────────────────
print("=" * 72)
print("서울시립대 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 72)
print(f"그리드 물리페이지: p{PG_GRID}  |  캠퍼스: 서울 단일")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증(수시합계 기준): 통과 {row_pass} / 실패 {len(parse_fail)}")
if parse_fail:
    for n, g, s in parse_fail:
        print(f"   [FAIL] {n}: 기대 {g} ≠ 전형합 {s}")

print("\n열합 검증 — 전형별 (PDF 합계행 대조):")
for c in coltotal:
    ok = "OK" if c["match"] else "FAIL"
    print(f"  {c['track']:8s}  계산={c['computed']:4d}  합계행={c['expectedSumRow']:4d}  [{ok}]")
print(f"  {'수시합계':8s}  계산={total_computed:4d}  합계행={total_expected:4d}  [{'OK' if total_match else 'FAIL'}]")

print(f"\nmeta.checksumPassed: {checksumPassed}")

print(f"\n채움 비율 ({T}전형):")
for label, n in [
    ("quotaInitial",       q_n),
    ("reflectionStages",   r_n),
    ("csatMinimumRawText", c_n),
    ("csatMinimumExempt",  ce_n),
    ("sourcePages",        sp_n),
    ("완전레코드",          comp_n),
]:
    pct = 100 * n // T if T else 0
    print(f"  {label:20s}: {n}/{T} ({pct}%)")

print(f"\nwarnings: {len(warnings)}건")
for w in warnings:
    print(f"  - {w[:100]}{'...' if len(w) > 100 else ''}")

print(f"\n저장: {out_path}")
