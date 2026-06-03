#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
이화여자대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 ewha.txt(50쪽)를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 결정론적으로 인코딩한 모집인원 총괄표 데이터
(인쇄 p7~8 = 물리 p6~7)와 결합한다.

캠퍼스: 이화여자대학교 서울캠퍼스 단독본. 모든 학과 campus="서울".
지원자격: 이화는 여자대학.

정직성 / 체크섬:
  - 모집인원 총괄표 (인쇄 p7·p8)의 모든 수시 데이터를 Claude Code 본체가 정독 후
    행별로 직접 인코딩. 숫자 날조 없음. 인코딩 근거: 물리 p6·p7 원문 텍스트.
  - 행합(row): 학과별 전형 quota 합 == totalQuotaHint (자기기입).
    이화 그리드에는 '계' 칼럼 없음 → totalQuotaHint = 전형합 자동계산.
  - 열합(col): 전형별 합산 vs PDF 합계행 (377/909/209/164/16/297/81/39) 교차 검증.
  - checksumPassed: 행합 실패 0 AND 열합 전부 match.

특이 구조:
  - 융합콘텐츠학과: 그리드에서 3줄에 걸쳐 분리 표기
      "신산업" 라인(미래서류13·고른1) + "융합콘텐츠학과" 명칭라인 + "융합대학" 라인(고른2·논술6)
      → 미래서류13, 고른기회3(1+2), 논술6 합산, 계열None(인문174/자연149 통합선발)
  - 전자전기공학전공: 3줄 분리 ("융합전자" / 숫자행 / "반도체공학부 공학전공 자연")
  - 의예과/간호학부/뇌·인지과학부: 자연·인문 행 분리, 자연 행만 수시 인원
  - 미래산업약학전공: 인문·자연 통합, 미래인재면접 11명만
  - 음악대학(건반악기과/관현악과/성악과/작곡과): 수시 0 → 미생성
  - 조형예술학부(동양화/서양화/조소/도자), 섬유·패션학부(섬유예술/패션디자인): 수시 0 → 미생성
  - 인공지능데이터사이언스학부: 수시 0 → 미생성
  - 국제학부: p6에서 미래인재서류11+미래인재면접43

sourceDocYear = 2027 (본문 "2027학년도 이화여자대학교 수시모집요강" 독립 확인).
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "ewha.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 인쇄 페이지 → 물리 페이지 매핑 ───────────────────────────────────────────
# 이화 PDF footer: "EWHA WOMANS UNIVERSITY  NN" (홀수 물리 페이지)
#                  "NN  2027학년도 이화여자대학교 수시모집요강" (짝수 물리 페이지 상단)
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for m in re.finditer(r"EWHA WOMANS UNIVERSITY\s+(\d+)", pg):
        n = int(m.group(1))
        printed_to_phys.setdefault(n, i)
    m2 = re.search(r"^(\d{2})\s+2027학년도 이화여자대학교 수시모집요강", pg, re.M)
    if m2:
        n2 = int(m2.group(1))
        printed_to_phys.setdefault(n2, i)

def phys(printed):
    p = printed_to_phys.get(printed)
    if p is None:
        warnings.append(f"[페이지매핑] 인쇄p{printed} 물리페이지 매핑 실패")
    return p

# 핵심 물리 페이지
PG_GRID = [p for p in (phys(7), phys(8)) if p]
PG = {
    "고교추천":     phys(14),  # 학생부교과(고교추천전형) 상세
    "미래인재서류": phys(16),  # 학생부종합(미래인재전형-서류형)
    "미래인재면접": phys(19),  # 학생부종합(미래인재전형-면접형) — 인쇄p20
    "고른기회":     phys(21),  # 학생부종합(고른기회전형)
    "사회기여자":   phys(26),  # 학생부종합(사회기여자전형)
    "논술":         phys(29),  # 논술(논술전형)
    "예체능실기":   phys(32),  # 실기/실적(예체능실기전형)
    "예체능서류":   phys(35),  # 학생부종합(예체능서류전형)
}

# ── 수능최저 원문 (PDF 각 전형 '대학수학능력시험 최저학력기준' 절 직접 인용) ───
CSAT_GYOGWA     = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 2개 영역 등급 합 5 이내 "
                   "[탐구: 응시 과목 중 상위 1개 과목 등급 반영]")
CSAT_GYOGWA_AREAS = ("인문계열은 국어 영역, 자연계열은 수학 영역(확률과통계, 미적분, 기하 중 택1) "
                     "응시 필수. 제2외국어/한문은 탐구영역으로 인정 불가")

CSAT_MIRAESR_HUM     = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 국어 포함 2개 영역 등급 합 5 이내 "
                        "[탐구: 응시 과목 중 상위 1과목]")
CSAT_MIRAESR_HUM_INT = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 국어 포함 2개 영역 등급 합 5 이내 "
                        "및 영어 2등급 이내 [국제학부 추가 조건]")
CSAT_MIRAESR_NAT     = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 수학 포함 2개 영역 등급 합 5 이내 "
                        "[탐구: 응시 과목 중 상위 1과목]")
CSAT_MIRAESR_MED     = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 4개 영역 등급 합 5 이내 [의예과]")
CSAT_MIRAESR_PHARM   = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 4개 영역 등급 합 6 이내 [약학전공]")
CSAT_MIRAESR_SCR     = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 3개 영역 등급 합 5 이내 [스크랜튼학부]")
CSAT_MIRAESR_AREAS   = ("인문계열(국제학부 포함)은 국어 영역, 자연계열(의예과, 약학전공 포함)은 "
                        "수학 영역(확률과통계, 미적분, 기하 중 택1) 응시 필수. 제2외국어/한문 불인정")

CSAT_NONSL_HUM   = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 국어 포함 2개 영역 등급 합 5 이내 "
                    "[탐구: 응시 과목 중 상위 1과목]")
CSAT_NONSL_NAT   = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 수학 포함 2개 영역 등급 합 5 이내 "
                    "[탐구: 응시 과목 중 상위 1과목]")
CSAT_NONSL_MED   = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 4개 영역 등급 합 5 이내 [의예과]")
CSAT_NONSL_PHARM = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 4개 영역 등급 합 6 이내 [약학전공]")
CSAT_NONSL_SCR   = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 3개 영역 등급 합 5 이내 [스크랜튼학부]")
CSAT_NONSL_AREAS = ("인문계열은 국어 영역, 자연계열(의예과, 약학전공 포함)은 "
                    "수학 영역(확률과통계, 미적분, 기하 중 택1) 응시 필수. 제2외국어/한문 불인정")

CSAT_YESUB_DESIGN = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 2개 영역 등급 합 7 이내 "
                     "[탐구: 응시 과목 중 상위 1과목]")
CSAT_YESUB_SPORTS = ("국어, 수학, 영어, 탐구(사회/과학) 4개 영역 중 3개 영역 등급 합 9 이내 "
                     "[탐구: 응시 과목 중 상위 1과목]")
CSAT_YESUB_AREAS  = "제2외국어/한문은 탐구영역으로 인정하지 않음"


def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}


# ── 전형 템플릿 빌더 ──────────────────────────────────────────────────────────
TR = ["고교추천", "미래인재서류", "미래인재면접", "고른기회", "사회기여자", "논술",
      "예체능실기", "예체능서류"]

def build_track(track_col, dept, quota, src_pages, *, note=None, gye=None):
    if track_col == "고교추천":
        ttype = "학생부위주(교과)"
        stages = [stage("일괄합산", None, {"학생부교과": 100}, 1000)]
        appq = ("2026년 2월 이후 국내 고등학교 졸업자(2027년 2월 졸업예정자 포함). "
                "초·중등교육법 제2조 정규 고등학교 졸업(예정)자에 한함(영재학교·특성화고 등 제외). "
                "학교장의 추천을 받은 자(고교별 최대 20명). "
                "3학년 1학기까지 국내 고교 교육과정 5학기 이상 성적 취득자. "
                "학교폭력 관련 기재 사항이 있는 경우 지원 불가.")
        return _mk("학생부교과(고교추천전형)", ttype, None, quota, appq, stages,
                   CSAT_GYOGWA, False, CSAT_GYOGWA_AREAS, src_pages, note)

    if track_col == "미래인재서류":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        appq = ("고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령에 의하여 "
                "고등학교 졸업자와 동등한 학력이 있다고 인정된 자.")
        if dept == "의예과":
            cr = CSAT_MIRAESR_MED
        elif dept == "약학전공":
            cr = CSAT_MIRAESR_PHARM
        elif dept == "스크랜튼학부":
            cr = CSAT_MIRAESR_SCR
        elif dept == "국제학부":
            cr = CSAT_MIRAESR_HUM_INT
        elif gye == "자연":
            cr = CSAT_MIRAESR_NAT
        else:
            cr = CSAT_MIRAESR_HUM
        return _mk("학생부종합(미래인재전형-서류형)", "학생부위주(종합)", None, quota, appq, stages,
                   cr, False, CSAT_MIRAESR_AREAS, src_pages, note)

    if track_col == "미래인재면접":
        stages = [stage("1단계(5배수)", 5, {"서류": 100}, 700),
                  stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 1000)]
        appq = ("고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령에 의하여 "
                "고등학교 졸업자와 동등한 학력이 있다고 인정된 자.")
        return _mk("학생부종합(미래인재전형-면접형)", "학생부위주(종합)", None, quota, appq, stages,
                   "적용하지 않음", True, None, src_pages, note)

    if track_col == "고른기회":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        appq = ("고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령에 의하여 동등 학력 인정자. "
                "지원자격(택1): ① 국가보훈대상자(교육지원 대상자) "
                "② 기초생활수급(권)자·차상위계층·한부모가족 지원대상자 "
                "③ 농·어촌학생(읍·면·도서벽지 고교 6년 또는 초·중·고 12년 이수) "
                "④ 북한이탈주민 또는 제3국 출생 북한이탈주민 자녀.")
        return _mk("학생부종합(고른기회전형)", "학생부위주(종합)", "기회균형", quota, appq, stages,
                   "적용하지 않음", True, None, src_pages, note)

    if track_col == "사회기여자":
        stages = [stage("일괄합산", None, {"서류": 100}, 1000)]
        appq = ("고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령에 의하여 동등 학력 인정자. "
                "지원자격(택1): ① 민주화운동관련자 및 그 자녀 ② 직업군인 자녀(국방부장관 추천) "
                "③ 다문화가정 자녀(대한민국 국적자, 결혼 전 외국 국적 친모·친부) "
                "④ 해외 파견 선교사 자녀(2017.1.1. 이후 통산 5년 이상 해외 선교 재직).")
        return _mk("학생부종합(사회기여자전형)", "학생부위주(종합)", "사회기여자", quota, appq, stages,
                   "적용하지 않음", True, None, src_pages, note)

    if track_col == "논술":
        stages = [stage("일괄합산", None, {"논술": 100}, 1000)]
        appq = ("고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령에 의하여 "
                "고등학교 졸업자와 동등한 학력이 있다고 인정된 자. "
                "논술고사 100분, 2015 개정 교육과정 기준.")
        if dept == "의예과":
            cr = CSAT_NONSL_MED; ar = CSAT_NONSL_AREAS
        elif dept == "약학전공":
            cr = CSAT_NONSL_PHARM; ar = CSAT_NONSL_AREAS
        elif dept == "스크랜튼학부":
            cr = CSAT_NONSL_SCR; ar = CSAT_NONSL_AREAS
        elif gye == "자연":
            cr = CSAT_NONSL_NAT; ar = CSAT_NONSL_AREAS
        else:
            cr = CSAT_NONSL_HUM; ar = CSAT_NONSL_AREAS
        return _mk("논술(논술전형)", "논술위주", None, quota, appq, stages,
                   cr, False, ar, src_pages, note)

    if track_col == "예체능실기":
        return _build_yeche_silgi(dept, quota, src_pages, note)

    if track_col == "예체능서류":
        return _build_yeche_seoryu(dept, quota, src_pages, note)

    raise ValueError(f"unknown track_col '{track_col}'")


def _mk(name, ttype, special, quota, appq, stages, raw, exempt, areas, src, note):
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


def _build_yeche_silgi(dept, quota, src_pages, note):
    appq = ("고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령에 의하여 동등 학력 인정자. "
            "3학년 1학기까지 국내 고교 교육과정 통산 3학기 이상 성적 취득자.")
    stages = [stage("일괄합산", None, {"학생부교과": 20, "실기": 80}, 1000)]
    src = src_pages + [p for p in [PG["예체능실기"]] if p]
    if dept == "한국음악과":
        n = (note + " | " if note else "") + (
            "악기·전공별 실기고사 내용 상이(가야금·거문고·대금·피리·해금·아쟁·타악기·정가·판소리·"
            "가야금병창·경·서도소리·이론·작곡). 학생부 교과 반영: 상위 10과목(진로선택 최대 2과목)")
    elif dept == "무용과":
        n = (note + " | " if note else "") + (
            "한국무용·발레·현대무용 중 택1(2분 내외). 학생부 교과 반영: 상위 10과목(진로선택 최대 2과목)")
    else:
        warnings.append(f"[예체능실기] 미분류 '{dept}'")
        n = note
    return _mk("실기/실적(예체능실기전형)", "실기/실적위주", None, quota, appq, stages,
               "적용하지 않음", True, None, src, n)


def _build_yeche_seoryu(dept, quota, src_pages, note):
    stages = [stage("1단계(4배수)", 4, {"서류": 100}, 800),
              stage("2단계", None, {"1단계 성적": 80, "면접": 20}, 1000)]
    appq = ("고등학교 졸업자(2027년 2월 졸업예정자 포함) 또는 법령에 의하여 "
            "고등학교 졸업자와 동등한 학력이 있다고 인정된 자.")
    src = src_pages + [p for p in [PG["예체능서류"]] if p]
    if dept == "디자인학부":
        cr = CSAT_YESUB_DESIGN; ar = CSAT_YESUB_AREAS
        n = (note + " | " if note else "") + "서류 평가: 포괄적 학업역량·교내 조형예술 활동 우수성·기초소양·발전가능성"
    elif dept == "체육과학부":
        cr = CSAT_YESUB_SPORTS; ar = CSAT_YESUB_AREAS
        n = (note + " | " if note else "") + "서류 평가: 학업역량·학교체육·스포츠클럽 활동 우수성·체육인재 기초소양·발전가능성"
    else:
        warnings.append(f"[예체능서류] 미분류 '{dept}'")
        cr = None; ar = None; n = note
    return _mk("학생부종합(예체능서류전형)", "학생부위주(종합)", None, quota, appq, stages,
               cr, False, ar, src, n)


# ── 전형별 합계 (열합 검증용) ─────────────────────────────────────────────────
col_sum = dict.fromkeys(TR, 0)

# ── 모집인원 데이터 (Claude Code 본체가 물리 p6·p7 원문에서 직접 읽은 값) ────────
# 형식: (dept_name, gye, {track_col: quota}, [extra_source_pages_if_different])
# source_pages 기본값: p6 데이터 → [phys(7)], p7 데이터 → [phys(8)]
# extra 없으면 [] (기본 전형 상세 페이지만 추가)

# ── 인쇄 p7 (물리 p6) 데이터 ────────────────────────────────────────────────
# 인문과학대학 / 사회과학대학 / 경영대학 / 신산업융합대학(일부) / 자연과학대학 / 공과대학(일부)
# 인공지능대학(일부) / 스크랜튼대학(일부)
P6_DATA = [
    # (dept_name, gye, {col: quota})
    # ─ 인문과학대학 ─
    ("국어국문학과", "인문",
     {"고교추천": 10, "미래인재서류": 33, "미래인재면접": 4, "고른기회": 4, "사회기여자": 1, "논술": 10}),
    ("중어중문학과", "인문",
     {"고교추천": 8, "미래인재서류": 35, "미래인재면접": 5, "고른기회": 6, "사회기여자": 1, "논술": 7}),
    ("불어불문학과", "인문",
     {"미래인재서류": 21, "미래인재면접": 10, "고른기회": 3, "논술": 8}),
    ("독어독문학과", "인문",
     {"미래인재서류": 13, "미래인재면접": 7, "고른기회": 3, "논술": 5}),
    ("사학과", "인문",
     {"미래인재서류": 15, "미래인재면접": 3, "고른기회": 3, "논술": 8}),
    ("철학과", "인문",
     {"미래인재서류": 16, "고른기회": 3, "논술": 9}),
    ("기독교학과", "인문",
     {"미래인재서류": 5, "미래인재면접": 6, "고른기회": 2, "논술": 7}),
    ("영어영문학부", "인문",
     {"고교추천": 9, "미래인재서류": 49, "미래인재면접": 5, "고른기회": 7, "사회기여자": 1, "논술": 9}),
    # ─ 사회과학대학 ─
    ("정치외교학과", "인문",
     {"고교추천": 11, "미래인재서류": 12, "고른기회": 3, "논술": 6}),
    ("행정학과", "인문",
     {"고교추천": 10, "미래인재서류": 12, "고른기회": 3, "논술": 6}),
    ("경제학과", "인문",
     {"고교추천": 11, "미래인재서류": 22, "미래인재면접": 3, "고른기회": 4, "사회기여자": 1, "논술": 10}),
    ("문헌정보학과", "인문",
     {"미래인재서류": 11, "고른기회": 3, "논술": 6}),
    ("사회학과", "인문",
     {"고교추천": 8, "미래인재서류": 10, "고른기회": 3, "논술": 4}),
    ("사회복지학과", "인문",
     {"미래인재서류": 11, "고른기회": 3, "논술": 6}),
    ("심리학과", "인문",
     {"고교추천": 11, "미래인재서류": 12, "고른기회": 3, "논술": 6}),
    ("소비자학과", "인문",
     {"미래인재서류": 11, "고른기회": 3, "논술": 7}),
    ("커뮤니케이션·미디어학부", "인문",
     {"고교추천": 15, "미래인재서류": 35, "고른기회": 4, "사회기여자": 1, "논술": 8}),
    # ─ 경영대학 ─
    ("경영학부", "인문",
     {"고교추천": 18, "미래인재서류": 40, "미래인재면접": 6, "고른기회": 8, "사회기여자": 1, "논술": 19}),
    # ─ 신산업융합대학 (일부) ─
    ("의류산업학과", "인문",
     {"고교추천": 9, "미래인재서류": 15, "미래인재면접": 3, "고른기회": 3, "논술": 8}),
    ("국제사무학과", "인문",
     {"고교추천": 5, "미래인재서류": 6, "미래인재면접": 3, "고른기회": 3, "논술": 5}),
    # 융합콘텐츠학과: 인문 행(미래서류13·고른기회1) + 자연 행(고른기회2·논술6) 합산
    # 근거: 물리 p6 L67("신산업" 행) + L69("융합대학" 행) 원문
    # 계열 힌트: 인문174/자연149 통합 → null
    ("융합콘텐츠학과", None,
     {"미래인재서류": 13, "고른기회": 3, "논술": 6}),
    ("식품영양학과", "자연",
     {"고교추천": 6, "미래인재서류": 16, "미래인재면접": 5, "고른기회": 3, "논술": 6}),
    ("융합보건학과", "자연",
     {"미래인재서류": 15, "고른기회": 2, "논술": 7}),
    # ─ 자연과학대학 ─
    ("수학과", "자연",
     {"고교추천": 10, "미래인재서류": 15, "고른기회": 3, "논술": 5}),
    ("통계학과", "자연",
     {"고교추천": 8, "미래인재서류": 18, "미래인재면접": 3, "고른기회": 3, "논술": 6}),
    ("물리학과", "자연",
     {"미래인재서류": 15, "고른기회": 2, "논술": 6}),
    ("화학·나노과학과", "자연",
     {"고교추천": 10, "미래인재서류": 27, "미래인재면접": 7, "고른기회": 4, "사회기여자": 1, "논술": 11}),
    ("생명과학과", "자연",
     {"고교추천": 10, "미래인재서류": 27, "미래인재면접": 7, "고른기회": 3, "사회기여자": 1, "논술": 11}),
    # ─ 공과대학 (일부, p6 소재) ─
    # 전자전기공학전공: 물리 p6 L84-86, 3줄 분리 표기
    # 근거: L85 "16 24 - 4 - 7 -" → 고교추천=16, 미래서류=24, 고른=4, 논술=7
    ("전자전기공학전공", "자연",
     {"고교추천": 16, "미래인재서류": 24, "고른기회": 4, "논술": 7}),
    ("식품생명공학과", "자연",
     {"고교추천": 9, "미래인재서류": 11, "고른기회": 3, "논술": 4}),
    ("화공신소재공학과", "자연",
     {"고교추천": 13, "미래인재서류": 20, "미래인재면접": 4, "고른기회": 4, "사회기여자": 1, "논술": 6}),
    ("건축학과", "자연",
     {"고교추천": 6, "미래인재서류": 11, "고른기회": 4, "논술": 6}),
    ("건축도시시스템공학과", "자연",
     {"고교추천": 7, "미래인재서류": 14, "고른기회": 2, "논술": 4}),
    ("환경공학과", "자연",
     {"고교추천": 5, "미래인재서류": 19, "미래인재면접": 3, "고른기회": 4, "논술": 4}),
    ("기후에너지시스템공학과", "자연",
     {"고교추천": 8, "미래인재서류": 17, "고른기회": 3, "논술": 4}),
    ("휴먼기계바이오공학과", "자연",
     {"고교추천": 12, "미래인재서류": 28, "미래인재면접": 3, "고른기회": 2, "사회기여자": 2, "논술": 6}),
    # ─ 인공지능대학 (p6 소재) ─
    ("컴퓨터공학과", "자연",
     {"고교추천": 14, "미래인재서류": 25, "미래인재면접": 3, "고른기회": 4, "사회기여자": 1, "논술": 6}),
    ("사이버보안학과", "자연",
     {"고교추천": 6, "미래인재서류": 12, "미래인재면접": 3, "고른기회": 3, "논술": 4}),
    # ─ 스크랜튼대학 (p6 소재) ─
    ("스크랜튼학부", None,  # 계열구분없음
     {"미래인재서류": 21, "미래인재면접": 6, "논술": 13}),
    # 국제학부: 물리 p6 마지막 행 (미래서류=11, 미래면접=43)
    ("국제학부", "인문",
     {"미래인재서류": 11, "미래인재면접": 43}),
]

# ── 인쇄 p8 (물리 p7) 데이터 ────────────────────────────────────────────────
P7_DATA = [
    # (dept_name, gye, {col: quota})
    # ─ 공과대학 / 융합전자반도체공학부 (p7 소재) ─
    ("지능형반도체공학전공", "자연",
     {"고교추천": 6, "미래인재서류": 7, "미래인재면접": 3, "고른기회": 4, "사회기여자": 1, "논술": 3}),
    # ─ 사범대학 ─
    ("교육학과", "인문",
     {"고교추천": 6, "미래인재서류": 7, "고른기회": 2}),
    ("유아교육과", "인문",
     {"고교추천": 6, "미래인재서류": 6, "고른기회": 2}),
    ("초등교육과", "인문",
     {"고교추천": 9, "미래인재서류": 12, "고른기회": 2}),
    ("교육공학과", "인문",
     {"고교추천": 5, "미래인재서류": 10, "고른기회": 2}),
    ("특수교육과", "인문",
     {"고교추천": 9, "미래인재서류": 9, "고른기회": 2}),
    ("영어교육과", "인문",
     {"고교추천": 5, "미래인재서류": 12, "고른기회": 2}),
    # 사회과교육과 — 3개 전공 독립 모집 (PDF 표기 그대로)
    ("역사교육전공", "인문",
     {"고교추천": 5, "미래인재서류": 6, "고른기회": 1}),
    ("사회교육전공", "인문",
     {"고교추천": 5, "미래인재서류": 6, "고른기회": 1}),
    ("지리교육전공", "인문",
     {"고교추천": 5, "미래인재서류": 6, "고른기회": 1}),
    ("국어교육과", "인문",
     {"고교추천": 5, "미래인재서류": 8, "고른기회": 2}),
    ("과학교육과", "자연",
     {"고교추천": 16, "미래인재서류": 19, "미래인재면접": 5, "고른기회": 3, "사회기여자": 1}),
    ("수학교육과", "자연",
     {"고교추천": 5, "미래인재서류": 4, "미래인재면접": 3, "고른기회": 2}),
    # ─ 의과대학 ─ (자연 행만, 인문 행 수시 없음)
    ("의예과", "자연",
     {"미래인재서류": 9, "미래인재면접": 9, "논술": 5}),
    # ─ 간호대학 ─ (자연 행만, 인문 행 수시 없음)
    # 근거: 물리 p7 L33 "자연   16   16   9    3    1    4"
    ("간호학부", "자연",
     {"고교추천": 16, "미래인재서류": 16, "미래인재면접": 9, "고른기회": 3, "사회기여자": 1, "논술": 4}),
    # ─ 약학대학 ─
    ("약학전공", "자연",
     {"미래인재서류": 9, "미래인재면접": 12, "고른기회": 1, "논술": 5}),
    # 미래산업약학전공: 자연 표기, 미래인재면접 11명
    # 계열 힌트: None (인문·자연 혼재 표기이나 자연 행만 인원 → 자연으로 설정)
    ("미래산업약학전공", "자연",
     {"미래인재면접": 11}),
    # ─ 스크랜튼대학 ─ (뇌·인지과학부: 자연 행만)
    ("뇌·인지과학부", "자연",
     {"미래인재서류": 7, "미래인재면접": 3}),
    # ─ 인공지능대학 (p7 소재) ─
    ("인공지능학과", "자연",
     {"고교추천": 9, "미래인재서류": 13, "미래인재면접": 12, "고른기회": 4, "사회기여자": 1, "논술": 4}),
    # ─ 음악대학 ─ (한국음악과·무용과만 수시)
    ("한국음악과", "예체능",
     {"예체능실기": 43}),
    ("무용과", "예체능",
     {"예체능실기": 38}),
    # ─ 조형예술대학 ─ (디자인학부만 수시)
    ("디자인학부", "예체능",
     {"예체능서류": 24}),
    # ─ 신산업융합대학 ─ (체육과학부)
    ("체육과학부", "예체능",
     {"예체능서류": 15}),
]

# ── 학과 데이터 조립 ────────────────────────────────────────────────────────
departments = []
parse_fail = []

def add_dept(dept_name, gye, cells, src_page):
    tracks = []
    tsum = 0
    for t in TR:
        if t not in cells:
            continue
        v = cells[t]
        if v == 0:
            continue
        tsum += v
        col_sum[t] += v
        src = [src_page]
        if t in PG and PG[t]:
            src.append(PG[t])
        tracks.append(build_track(t, dept_name, v, src, gye=gye))
    if not tracks:
        return
    departments.append({
        "departmentName": dept_name,
        "campus": "서울",
        "trackHint": gye,
        "totalQuotaHint": tsum,
        "tracks": tracks,
    })

pi6 = phys(7)
pi7 = phys(8)

for dept_name, gye, cells in P6_DATA:
    add_dept(dept_name, gye, cells, pi6)

for dept_name, gye, cells in P7_DATA:
    add_dept(dept_name, gye, cells, pi7)

# ── 행합 검증 ─────────────────────────────────────────────────────────────────
row_pass = len(departments) - len(parse_fail)

# ── 열합 검증 ────────────────────────────────────────────────────────────────
# PDF 합계행 (인쇄 p8): 377 909 209 164 16 297 81 39
EXPECTED_COL = {
    "고교추천":       377,
    "미래인재서류":   909,
    "미래인재면접":   209,
    "고른기회":       164,
    "사회기여자":      16,
    "논술":           297,
    "예체능실기":      81,
    "예체능서류":      39,
}
EXPECTED_TOTAL = 2092  # 수시 소계(정원 내) — PDF 명시 "수시 소계(정원 내) 2,092"

coltotal = [(t, col_sum[t], EXPECTED_COL[t], col_sum[t] == EXPECTED_COL[t]) for t in TR]
total_computed = sum(col_sum.values())

checksumPassed = (
    len(parse_fail) == 0
    and all(m for _, _, _, m in coltotal)
    and total_computed == EXPECTED_TOTAL
)

# ── warnings 추가 ─────────────────────────────────────────────────────────────
warnings.append("[캠퍼스] 이화여자대학교 서울캠퍼스 단독 → 전 학과 campus='서울'. 여자대학.")
warnings.append("[수시 미선발] 음악대학 건반악기과·관현악과·성악과·작곡과, 조형예술학부(동양화·서양화·조소·도자전공), "
                "섬유·패션학부(섬유예술·패션디자인전공), 인공지능데이터사이언스학부(인문 계열 정시만): "
                "수시 모집인원 0 → 학과 미생성(정직).")
warnings.append("[의예과/간호학부/뇌·인지과학부] PDF 표에 자연/인문 2행 분리. 인문 행 수시 인원 없음 → 자연 행만 적재.")
warnings.append("[미래산업약학전공] 미래인재면접 11명. 계열: 자연 행 표기(인문·자연 혼재 표기이나 실질 자연 선발). "
                "csatMinimumExempt=true(면접형은 수능최저 미적용).")
warnings.append("[융합콘텐츠학과] PDF 표에서 인문 행(미래서류13·고른기회1)과 자연 행(고른기회2·논술6)이 3줄에 걸쳐 분리 표기. "
                "합산: 미래서류13·고른기회3·논술6. 계열 힌트 null(인문174/자연149 통합선발 주석).")
warnings.append("[인공지능학과] PDF 표에서 '인공지능' 학과로 표기(인공지능대학 소속). 모집단위명='인공지능학과'로 인코딩.")
warnings.append("[전자전기공학전공] PDF 표에서 3줄 분리 표기(융합전자/숫자행/반도체공학부공학전공). 자연 계열 확인.")
warnings.append("[국제학부] PDF 표에서 인문 계열, 미래인재서류11+미래인재면접43. 면접전형 43명은 스크랜튼대학 국제학부 전용.")
warnings.append("[수능최저 고교추천] 인문·자연 동일 기준(4개 영역 중 2개 등급합 5 이내). 단일 csatMinimumRawText 사용.")
warnings.append("[약학전공 수능최저] 미래인재서류: 4개 영역 등급합 6 이내. 논술: 4개 영역 등급합 6 이내.")
warnings.append("[디자인학부 수능최저] 예체능서류: 4개 영역 중 2개 등급합 7 이내. [체육과학부] 4개 영역 중 3개 등급합 9 이내.")
if parse_fail:
    warnings.append(f"[행합실패] {len(parse_fail)}건: " + "; ".join(str(x) for x in parse_fail))
if not checksumPassed:
    reasons = []
    if parse_fail:
        reasons.append(f"행합실패 {len(parse_fail)}건")
    col_fails = [(t, g, e) for t, g, e, m in coltotal if not m]
    if col_fails:
        reasons.append("열합불일치: " + ", ".join(f"{t}(계산{g}≠기대{e})" for t, g, e in col_fails))
    if total_computed != EXPECTED_TOTAL:
        reasons.append(f"총합불일치(계산{total_computed}≠기대{EXPECTED_TOTAL})")
    warnings.append("[체크섬실패] " + "; ".join(reasons))

# ── 결과 조립 ─────────────────────────────────────────────────────────────────
result = {
    "universityName": "이화여자대학교",
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

meta = {
    "universityName": "이화여자대학교",
    "universityId": "kcue_0000163",
    "year": 2027,
    "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0,
    "campusScope": "서울캠퍼스 단독 (단일 캠퍼스, 여자대학)",
    "sourceDocYear": 2027,
    "departments": len(departments),
    "totalTracks": T,
    "rowSumValidation": {
        "basis": "전형 quota 합 (이화 그리드에 '계' 칼럼 없음 — 자기기입, central-verify.py 교차 검증)",
        "passed": row_pass,
        "failed": len(parse_fail),
    },
    "colTotalValidation": [
        {"track": n, "computed": g, "expectedSumRow": e, "match": m}
        for n, g, e, m in coltotal
    ],
    "colTotalGye": {
        "computed": total_computed,
        "expectedSuriNae": EXPECTED_TOTAL,
        "match": total_computed == EXPECTED_TOTAL,
    },
    "checksumPassed": checksumPassed,
    "fillRatios": {
        "quotaInitial":       [q_n, T],
        "reflectionStages":   [r_n, T],
        "csatMinimumRawText": [c_n, T],
        "csatMinimumExempt":  [ce_n, T],
        "sourcePages":        [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

(BASE / "ewha-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# ── 콘솔 리포트 ───────────────────────────────────────────────────────────────
print("=" * 72)
print("이화여자대학교 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 72)
print(f"그리드 물리페이지: {PG_GRID}")
print(f"캠퍼스: 서울 단독 (여자대학, 단일 캠퍼스)")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증: 통과 {row_pass} / 실패 {len(parse_fail)}")
if parse_fail:
    for x in parse_fail:
        print(f"   FAIL {x}")

print(f"\n열합 검증 (전형별 합 vs PDF 합계행 377/909/209/164/16/297/81/39):")
for n, g, e, m in coltotal:
    print(f"  {n:18s} 계산={g:4d}  합계행={e:4d}  {'OK' if m else 'FAIL'}")
print(f"  {'수시 총합(정원내)':18s} 계산={total_computed:4d}  합계행={EXPECTED_TOTAL:4d}  "
      f"{'OK' if total_computed==EXPECTED_TOTAL else 'FAIL'}")
print(f"\nchecksumPassed: {checksumPassed}")

print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n),
                 ("csatMinimumRawText", c_n), ("csatMinimumExempt", ce_n),
                 ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    print(f"  {label:22s}: {n}/{T} ({100*n//T if T else 0}%)")

print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {BASE / 'ewha-text.json'}")

# ── 상세 열합 디버그 (FAIL 시) ───────────────────────────────────────────────
if not checksumPassed:
    print("\n[디버그] 전형별 누적 합계:")
    for t in TR:
        print(f"  {t:18s}: 계산={col_sum[t]:4d}  기대={EXPECTED_COL[t]:4d}  "
              f"{'OK' if col_sum[t]==EXPECTED_COL[t] else 'FAIL diff='+str(col_sum[t]-EXPECTED_COL[t])}")
