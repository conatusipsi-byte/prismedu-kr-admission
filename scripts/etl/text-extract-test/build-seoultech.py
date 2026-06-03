#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
서울과학기술대학교(SeoulTech) 2027 수시 — pdftotext -layout 텍스트(seoultech.txt)
→ AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 ($0). Claude Code 본체가 seoultech.txt(92쪽)를 정독해
전형 템플릿(반영비율·수능최저)을 인코딩하고, 전형별 모집인원 총괄표 2개
  · 인쇄 p9  (물리 p13): 정원내(고교추천·학우·창의·보훈·기회균등·평생) + 특성화고졸재직자(정원외)
  · 인쇄 p11 (물리 p15): 농어촌·특수교육·군위탁(정원외) + 논술·실기(정원내)
를 데이터행 토큰 파싱(결정론)으로 직접 추출·결합한다.

⚠️ DRAFT: 원본 PDF 파일명이 "…모집요강(안)" = 초안(draft). meta.draft=true,
   warnings에 확정본 아님 명시. 수치는 초안 기준으로 완전 추출.

캠퍼스: 단일(서울 노원구 공릉) — 지역인재 전형 없음(서울 소재, p79 거점 외). 전 학과 campus="서울".

전형 목록 (수시 12개; 군위탁 추천인원=고정인원 없음):
  [정원내]
   1. 고교추천전형              → 학생부위주(교과)  [수능최저 ○: 2개영역 합7]
   3. 학교생활우수자전형          → 학생부위주(종합)  [1단계 서류100%(3배수)→2단계 70%+면접30%]
   4. 창의융합인재전형            → 학생부위주(종합)
   5. 기회균형(국가보훈대상자)     → 학생부위주(종합)
   6. 기회균형(기회균등)         → 학생부위주(종합)
  11. 논술전형                 → 논술위주  [일괄 교과30%+논술70%, ST자유전공_자연]
  12. 실기전형                 → 실기/실적위주  [1단계 교과100%(8배수)→2단계 실기100%, 조형대학]
  [정원외]
   2. 기회균형(특성화고졸재직자)   → 학생부위주(교과)  [일괄 교과100%, 미래융합대학]
   7. 기회균형(농어촌학생)        → 학생부위주(종합)
   8. 기회균형(평생학습자)        → 학생부위주(종합)  ※ p13 헤더상 '정원내' 라벨이나 본문(p42)은 기회균형
   9. 기회균형(특수교육대상자)     → 학생부위주(종합)  [정원외 10명, 미래융합대학 내 상위10명, 학과별 미배분]
  10. 군위탁전형               → 학생부위주(종합)  [정원외, 추천인원 대상 → quotaInitial=null]

열합 검증 기준(PDF 합계행 직독):
  p13: 고교추천502, 특성화고졸재직자168, 학우496, 창의91, 보훈19, 기회균등86, 평생72
  p15: 농어촌68, 특수교육10, 군위탁0(추천인원), 논술162, 실기73
  수시 총원 = 정원내(502+496+91+19+86+162+73=1429) + 정원외(168+72+68+10+0=318) = 1,747 ✓
  ※ p13 헤더: 평생학습=정원내 라벨 → 정원내 1429에 포함. 특성화고졸재직자=정원외.
"""
import json
import re
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "seoultech.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

warnings = []

# ── 물리 페이지 상수 (본체가 seoultech.txt 직독 확인) ──────────────────────────
PG_GRID1 = 13   # 전형별 모집인원 총괄표 1 (정원내 + 특성화고졸재직자)
PG_GRID2 = 15   # 전형별 모집인원 총괄표 2 (농어촌·특수교육·군위탁·논술·실기)
PG_GRID_NOTE = 14  # 자유전공학부 수시 미선발 안내(그리드 사이)

# 전형별 세부안내(전형방법·수능최저) 물리 페이지
PG_고교추천   = 24
PG_재직자     = 27
PG_학우       = 30
PG_창의       = 32
PG_보훈       = 34
PG_기회균등   = 36
PG_농어촌     = 39
PG_평생       = 42
PG_특수교육   = 46
PG_군위탁     = 48
PG_논술       = 50
PG_실기       = 53
PG_학생부반영 = 52  # 학교생활기록부 반영방법(교과 산출)


def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}


# ── 수능최저 원문 (PDF 직접 인용) ──────────────────────────────────────────────
# 고교추천만 수능최저 적용 (p24). 나머지 전 전형 '없음'(p5 요약표 + 각 상세페이지 '없음').
CSAT_고교추천 = ("국어, 수학, 영어, 탐구(1과목) 중 2개 영역 등급 합 7등급 이내. "
                "전 모집단위 선택과목 제한 없음")
CSAT_고교추천_AREAS = "국어, 수학, 영어, 탐구(1과목). 선택과목 제한 없음"

# ── 종합전형 공통 반영비율(p30·32·34·36·39·42·46 모두 동일) ────────────────────
# 1단계 서류100% 1,000점(3배수) → 2단계 1단계성적70%(700) + 면접30%(300) 1,000점
JONGHAP_STAGES = [
    stage("1단계(3배수)", 3.0, {"서류평가": 1000}, 1000),
    stage("2단계", None, {"1단계성적": 700, "면접": 300}, 1000),
]
# 군위탁: 일괄합산 서류70%(700) + 면접30%(300) 1,000점 (p48)
GUNWITAK_STAGES = [stage("일괄합산", None, {"서류평가": 700, "면접": 300}, 1000)]
# 고교추천: 일괄합산 학생부(교과) 100% 1,000점 (p25)
GYOGWA_STAGES = [stage("일괄합산", None, {"학생부(교과)": 1000}, 1000)]
# 특성화고졸재직자: 일괄합산 학생부(교과) 100% (학생부교과전형, p6 전형방법표)
JAEJIK_STAGES = [stage("일괄합산", None, {"학생부(교과)": 1000}, 1000)]
# 논술: 일괄합산 학생부(교과)30%(300) + 논술70%(700) 1,000점 (p50)
NONSUL_STAGES = [stage("일괄합산", None, {"학생부(교과)": 300, "논술": 700}, 1000)]
# 실기: 1단계 학생부(교과)100% 1,000점(8배수) → 2단계 실기100% 1,000점 (p53)
SILGI_STAGES = [
    stage("1단계(8배수)", 8.0, {"학생부(교과)": 1000}, 1000),
    stage("2단계", None, {"실기": 1000}, 1000),
]


def _mk(name, ttype, special, quota, appq, stages, raw, exempt, areas, src, note=None):
    t = {
        "trackName": name, "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시", "specialTypeKeyword": special,
        "quotaInitial": quota, "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw, "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas, "prevYearResult": None,
        "sourcePages": sorted({p for p in src if p}),
    }
    if note:
        t["note"] = note
    return t


# ── 지원자격 원문 (각 상세페이지 직독, 요약) ──────────────────────────────────
APPQ_고교추천 = ("국내 정규 고등학교 2024년 12월 이후 졸업(예정)자로 소속 고등학교장의 추천을 받은 자. "
                "3개 학기 이상 국내 고교 성적 취득 + 3학년 1학기까지 반영 교과목 80단위 이상 성적 산출 가능자. "
                "특성화고·마이스터고·예술고·체육고·학력인정 평생교육시설·각종학교·방송통신고 졸업(예정)자 및 "
                "일반(종합)고 특성화과정 이수자·검정고시 출신자 지원 불가. 고교별 추천 인원 제한 없음")
APPQ_재직자 = ("산업체 근무 경력 3년 이상 재직자(고등교육법 시행령 제29조②14다목): 일반고 재학 중 1년 이상 "
              "직업교육훈련과정 이수 후 졸업한 자, 산업수요 맞춤형(마이스터)고 졸업자, 특성화고 등 졸업자, "
              "학력인정 평생교육시설 해당 교육과정 이수자. 정원외")
APPQ_학우 = ("국내 정규 고등학교 졸업(예정)자 또는 법령상 동등 이상 학력 인정자로 학교생활에 충실한 자")
APPQ_창의 = ("국내 정규 고등학교 졸업(예정)자 또는 법령상 동등 이상 학력 인정자로 창의적 융합 사고를 바탕으로 "
            "첨단 학문 분야에 관심과 역량을 갖춘 자")
APPQ_보훈 = ("국내 정규 고등학교 졸업(예정)자(또는 동등 이상 학력 인정자)로 국가보훈기본법 제3조2호 보훈대상자 중 "
            "국가보훈관계 법령에 따른 교육지원 대상자")
APPQ_기회균등 = ("국내외 정규 고등학교 졸업(예정)자(또는 동등 이상 학력 인정자)로 국민기초생활보장법 수급권자·수급자·"
                "차상위계층, 한부모가족지원법 지원대상자 중 해당자")
APPQ_농어촌 = ("국내 정규 고등학교 졸업(예정)자로 농어촌(도서·벽지 포함) 지역 고교 졸업(예정)자 중 "
              "유형1(6년: 본인·부모 농어촌 거주) 또는 유형2(12년: 본인 농어촌 거주) 해당자. 연속 연수만 인정")
APPQ_평생 = ("(가) 입학일(2027.3.1.) 기준 만 30세 이상인 국내 정규 고교 졸업(예정)자(또는 동등 이상 학력) 또는 "
            "(나) 산업체 근무 경력 3년 이상 재직자(특성화고·마이스터고 등 졸업자)")
APPQ_특수교육 = ("국내 정규 고등학교 졸업(예정)자(또는 동등 이상 학력 인정자)로 장애인복지법 제32조 장애인 등록자 "
                "또는 국가유공자법 제4조 상이등급자. 정원외")
APPQ_군위탁 = ("국내 정규 고등학교 졸업(예정)자(또는 동등 이상 학력 인정자)로 군위탁생 규정 제4조에 따라 국방부장관 "
              "군위탁생 임명 + 교육부장관 추천을 받은 자. 정원외")
APPQ_논술 = ("국내외 정규 고등학교 졸업(예정)자 또는 법령상 동등 이상 학력 인정자")
APPQ_실기 = ("국내외 정규 고등학교 졸업(예정)자 또는 법령상 동등 이상 학력 인정자")


# ════════════════════════════════════════════════════════════════════════════
# 1. 총괄표 데이터행 결정론 파싱 (모집단위명 + 숫자토큰, '-' = 0/미모집)
# ════════════════════════════════════════════════════════════════════════════
# 데이터행 식별: 한글 모집단위명 + (정확히 N개의 [숫자|'-'] 토큰).
# 모집단위명에는 단과대학(병합셀, 일부 행만)·계열(자연/인문/예체능)이 선행될 수 있음.
TOKEN = re.compile(r"[\d,]+|-")
GYEYEOL = {"자연", "인문", "예체능"}


def parse_grid(page_text, ncols, dept_names_seen):
    """page_text 데이터행 → {모집단위명: [col0..col(ncols-1)]} (수시합계 제외, '-'→0).
       ncols = 수시합계 뒤 전형 컬럼 수 (p13=7, p15=5)."""
    rows = {}
    skipped = []
    for ln in page_text.splitlines():
        s = ln.rstrip()
        if not s:
            continue
        # 헤더/합계/꼬리말/안내 라인 제외
        if any(k in s for k in ("합계", "구분", "모집단위", "정원내", "정원외", "학생부",
                                 "일반전형", "전형별 모집인원", "단과", "추천")):
            # '추천' 은 미래융합대학 군위탁 'O 추천 인원' 병합셀에만 등장 → 데이터행 아님
            continue
        if "2027학년도" in s:  # 페이지 꼬리말
            continue
        toks = TOKEN.findall(s)
        # 데이터행: 첫 토큰(수시합계) + ncols 전형 토큰 = ncols+1 개
        if len(toks) != ncols + 1:
            continue
        # 모집단위명 = 토큰 시작 전 문자열에서 계열어 제거
        first_num_pos = re.search(r"[\d]|(?<=\s)-(?=\s)|(?<=\s)-$", s)
        # 더 안전하게: 토큰 위치 기준 — 첫 토큰의 시작 인덱스
        m0 = TOKEN.search(s)
        name_raw = s[:m0.start()]
        toks2 = name_raw.split()
        # 계열어(자연/인문/예체능) + 단과대학명 제거 → 모집단위명만
        # 모집단위명은 마지막 토큰들(괄호 포함 가능). 계열어 위치 무관 제거.
        clean = [t for t in toks2 if t not in GYEYEOL]
        # 단과대학 병합셀 조각(공과대학/정보통신대학/…)이 선행할 수 있음 → 모집단위명 본체만 남김.
        # 모집단위명은 '학과/학부/전공)/ST.../MSDE/영어과' 패턴. 단과대학명은 '…대학'.
        clean = [t for t in clean if not t.endswith("대학")]
        name = " ".join(clean).strip()
        if not name:
            skipped.append(s.strip()[:30])
            continue
        cells = []
        for t in toks[1:]:
            cells.append(0 if t == "-" else int(t.replace(",", "")))
        susi_total = 0 if toks[0] == "-" else int(toks[0].replace(",", ""))
        rows[name] = {"susi_total": susi_total, "cells": cells}
    return rows, skipped


# p13: 7 전형 컬럼 — [고교추천, 특성화고졸재직자, 학우, 창의, 보훈, 기회균등, 평생]
G1, skip1 = parse_grid(pages[PG_GRID1 - 1], 7, set())
# p15: 5 전형 컬럼 — [농어촌, 특수교육, 군위탁, 논술, 실기]
G2, skip2 = parse_grid(pages[PG_GRID2 - 1], 5, set())

# p15 미래융합대학 블록은 특수교육(10, 병합셀)·군위탁('-' 추천인원) 컬럼이 일부 행에서
# 누락/병합되어 토큰 수가 6이 아니라 4가 됨 → parse_grid가 자동 제외(데이터 무손실:
# 그 학과들의 농어촌/논술/실기는 전부 0이고 특수교육·군위탁은 학과 미배분이므로).
# 특수교육 10·군위탁(추천인원)은 미래융합대학 단위 별도 전형으로 아래에서 생성.

# p13 컬럼 인덱스
C_고교추천, C_재직자, C_학우, C_창의, C_보훈, C_기회균등, C_평생 = range(7)
# p15 컬럼 인덱스
D_농어촌, D_특수교육, D_군위탁, D_논술, D_실기 = range(5)

# 계열(trackHint) — p13/p15 계열 컬럼 직독 매핑 (모집단위명 → 자연/인문/예체능)
GYE_OF = {}
for pg, nc in ((PG_GRID1, 7), (PG_GRID2, 5)):
    for ln in pages[pg - 1].splitlines():
        s = ln.rstrip()
        toks = TOKEN.findall(s)
        if len(toks) != nc + 1:
            continue
        m0 = TOKEN.search(s)
        if not m0:
            continue
        name_raw = s[:m0.start()].split()
        gy = next((t for t in name_raw if t in GYEYEOL), None)
        nm = " ".join(t for t in name_raw if t not in GYEYEOL and not t.endswith("대학")).strip()
        if nm and gy and nm not in GYE_OF:
            GYE_OF[nm] = "예체능" if gy == "예체능" else gy


# 단과대학 매핑 (p13/p15 병합셀 단과대학 라벨 — 그리드 등장순서 블록)
COLLEGE_BLOCKS = [
    ("공과대학", ["기계시스템공학부(지능형로봇전공)", "기계시스템공학부(미래자동차전공)", "기계공학과",
               "안전공학과", "신소재공학과", "건설시스템공학과", "건축학부(건축공학전공)",
               "건축학부(건축학전공)", "자유전공학부(공과대학)", "전기정보공학과", "전자공학과"]),
    # ↑ 전기정보·전자공학과는 표상 공과대학 행이나 PDF p9에서 정보통신대학 — 아래 정보통신대학으로 override
    ("정보통신대학", ["전기정보공학과", "전자공학과", "ICT융합공학과", "컴퓨터공학과", "자유전공학부(정보통신대학)"]),
    ("에너지바이오대학", ["화공생명공학과", "환경공학과", "식품생명공학과", "정밀화학과", "안경광학과",
                   "스포츠과학과", "바이오메디컬학과", "양자융합물리학과", "자유전공학부(에너지바이오대학)"]),
    ("조형대학", ["산업디자인학과", "시각디자인학과", "도예학과", "금속공예디자인학과", "조형예술학과"]),
    ("인문사회대학", ["행정학과", "영어영문학과", "문예창작학과", "자유전공학부(인문사회대학)"]),
    ("기술경영융합대학", ["산업공학부(산업정보시스템전공)_자연", "산업공학부(산업정보시스템전공)_인문",
                   "산업공학부(ITM전공)_자연", "산업공학부(ITM전공)_인문", "MSDE학과",
                   "경영학과(경영학전공)", "경영학과(글로벌테크노경영전공)_인문",
                   "경영학과(글로벌테크노경영전공)_자연", "자유전공학부(기술경영융합대학)"]),
    ("미래융합대학", ["융합기계공학과", "건설환경융합공학과", "헬스피트니스학과", "문화예술학과",
                "영어과", "벤처경영학과", "정보통신융합공학과", "자유전공학부(미래융합대학)"]),
    ("창의융합대학", ["인공지능응용학과", "지능형반도체공학과", "미래에너지학과", "자유전공학부(창의융합대학)"]),
    ("교양대학", ["ST자유전공학부_자연", "ST자유전공학부_인문"]),
]
COLLEGE_OF = {}
for col, depts in COLLEGE_BLOCKS:
    for d in depts:
        COLLEGE_OF[d] = col  # 마지막 매핑 우선 → 정보통신대학이 전기정보/전자 override

CAMPUS = "서울"  # 단일 캠퍼스 (노원구 공릉)


# ════════════════════════════════════════════════════════════════════════════
# 2. 학과(모집단위) 레코드 조립
# ════════════════════════════════════════════════════════════════════════════
# 전형별 (열키, 빌더 메타) — 정원내/정원외 구분은 p13/p15 헤더 라벨 직독.
SRC_GRID = [PG_GRID1, PG_GRID2, PG_GRID_NOTE]

# col_sums 추적 (열합 검증용)
col_sums = {k: 0 for k in [
    "고교추천", "특성화고졸재직자", "학교생활우수자", "창의융합인재", "국가보훈",
    "기회균등", "평생학습자", "농어촌학생", "특수교육대상자", "군위탁", "논술", "실기",
]}

departments = []
parse_fail = []
all_names = list(dict.fromkeys(list(G1.keys()) + list(G2.keys())))


def trackhint(name):
    return GYE_OF.get(name)


def college_of(name):
    return COLLEGE_OF.get(name)


def src(*extra):
    return sorted({p for p in (SRC_GRID + list(extra)) if p})


for name in all_names:
    g1 = G1.get(name, {}).get("cells", [0] * 7)
    g2 = G2.get(name, {}).get("cells", [0] * 5)
    # 수시합계(우선 p13, 없으면 p15)
    susi_total = G1.get(name, {}).get("susi_total")
    if susi_total is None:
        susi_total = G2.get(name, {}).get("susi_total")
    college = college_of(name)
    hint = trackhint(name)
    tracks = []

    def add(t, colkey, q):
        tracks.append(t)
        col_sums[colkey] += q

    q = g1[C_고교추천]
    if q > 0:
        add(_mk("고교추천전형", "학생부위주(교과)", None, q, APPQ_고교추천, GYOGWA_STAGES,
                CSAT_고교추천, False, CSAT_고교추천_AREAS, src(PG_고교추천, PG_학생부반영)),
            "고교추천", q)
    q = g1[C_재직자]
    if q > 0:
        add(_mk("기회균형전형(특성화고졸재직자)", "학생부위주(교과)", "특성화고졸재직자(정원외)", q,
                APPQ_재직자, JAEJIK_STAGES, "없음", True, "없음",
                src(PG_재직자, PG_학생부반영), "정원외 모집인원"),
            "특성화고졸재직자", q)
    q = g1[C_학우]
    if q > 0:
        add(_mk("학교생활우수자전형", "학생부위주(종합)", None, q, APPQ_학우, JONGHAP_STAGES,
                "없음", True, "없음", src(PG_학우)), "학교생활우수자", q)
    q = g1[C_창의]
    if q > 0:
        add(_mk("창의융합인재전형", "학생부위주(종합)", None, q, APPQ_창의, JONGHAP_STAGES,
                "없음", True, "없음", src(PG_창의)), "창의융합인재", q)
    q = g1[C_보훈]
    if q > 0:
        add(_mk("기회균형전형(국가보훈대상자)", "학생부위주(종합)", "국가보훈대상자", q, APPQ_보훈,
                JONGHAP_STAGES, "없음", True, "없음", src(PG_보훈)), "국가보훈", q)
    q = g1[C_기회균등]
    if q > 0:
        add(_mk("기회균형전형(기회균등)", "학생부위주(종합)", "기회균등(기초생활·차상위·한부모)", q,
                APPQ_기회균등, JONGHAP_STAGES, "없음", True, "없음", src(PG_기회균등)),
            "기회균등", q)
    q = g1[C_평생]
    if q > 0:
        # p13 헤더상 '정원내' 라벨. 본문(p42)은 기회균형(평생학습자). 정원외 키워드 미부착.
        add(_mk("기회균형전형(평생학습자)", "학생부위주(종합)", "평생학습자", q, APPQ_평생,
                JONGHAP_STAGES, "없음", True, "없음", src(PG_평생)), "평생학습자", q)
    q = g2[D_농어촌]
    if q > 0:
        add(_mk("기회균형전형(농어촌학생)", "학생부위주(종합)", "농어촌학생(정원외)", q, APPQ_농어촌,
                JONGHAP_STAGES, "없음", True, "없음", src(PG_농어촌), "정원외 모집인원"),
            "농어촌학생", q)
    q = g2[D_논술]
    if q > 0:
        add(_mk("논술전형", "논술위주", None, q, APPQ_논술, NONSUL_STAGES, "없음", True, "없음",
                src(PG_논술, PG_학생부반영)), "논술", q)
    q = g2[D_실기]
    if q > 0:
        add(_mk("실기전형", "실기/실적위주", None, q, APPQ_실기, SILGI_STAGES, "없음", True, "없음",
                src(PG_실기, PG_학생부반영)), "실기", q)

    if not tracks:
        continue

    # 행합 검증: Σ(quotaInitial) == 수시합계
    # 단, 특수교육(10)·군위탁(추천인원)은 학과 미배분(미래융합대학 단위 별도) → 해당 학과 수시합계엔
    #   포함 안 됨(p15 미래융합 블록 수시합계엔 본인 정원내전형이 없어 0행 → 미생성).
    tsum = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    if susi_total is not None and tsum != susi_total:
        parse_fail.append((name, susi_total, tsum))
        warnings.append(f"[행합불일치] {name}: 수시합계{susi_total} ≠ 전형합{tsum}")

    departments.append({
        "departmentName": name, "campus": CAMPUS,
        "trackHint": hint, "totalQuotaHint": susi_total,
        "tracks": tracks,
    })


# ── 특수교육대상자전형 (정원외, 미래융합대학 단위 별도 — 학과 미배분) ──────────────
# p46: 미래융합대학 내 10명, 학과별 상한 없이 최종 성적 상위 10명 선발.
t_특수 = _mk("기회균형전형(특수교육대상자)", "학생부위주(종합)", "특수교육대상자(정원외)", 10,
            APPQ_특수교육, JONGHAP_STAGES, "없음", True, "없음",
            src(PG_특수교육), "정원외. 미래융합대학 내 10명(학과별 미배분, 최종 성적 상위 10명 선발)")
departments.append({
    "departmentName": "[기회균형-특수교육대상자]미래융합대학", "campus": CAMPUS,
    "trackHint": None, "totalQuotaHint": 10, "tracks": [t_특수],
})
col_sums["특수교육대상자"] += 10

# ── 군위탁전형 (정원외, 추천인원 대상 → 고정인원 없음 → quotaInitial=null) ─────────
# p48: 미래융합대학 내 정원 제한 없이 교육부장관 추천 인원 대상 모집.
t_군위탁 = _mk("군위탁전형", "학생부위주(종합)", "군위탁(정원외)", None, APPQ_군위탁,
             GUNWITAK_STAGES, "없음", True, "없음", src(PG_군위탁),
             "정원외. 추천 인원 대상 모집(고정 모집인원 없음) → quotaInitial=null")
departments.append({
    "departmentName": "[군위탁]미래융합대학", "campus": CAMPUS,
    "trackHint": None, "totalQuotaHint": None, "tracks": [t_군위탁],
})
# 군위탁 열합: PDF 합계행=0(추천인원, %표기 -). col_sums["군위탁"]=0 유지.


# ════════════════════════════════════════════════════════════════════════════
# 3. 열합 검증 (전형별 계산 vs PDF 합계행 직독)
# ════════════════════════════════════════════════════════════════════════════
EXPECTED = {
    "고교추천": 502, "특성화고졸재직자": 168, "학교생활우수자": 496, "창의융합인재": 91,
    "국가보훈": 19, "기회균등": 86, "평생학습자": 72,
    "농어촌학생": 68, "특수교육대상자": 10, "군위탁": 0, "논술": 162, "실기": 73,
}
coltotal_result = []
all_match = True
for key, exp in EXPECTED.items():
    computed = col_sums.get(key, 0)
    m = (computed == exp)
    if not m:
        all_match = False
    coltotal_result.append({"track": key, "computed": computed,
                            "expectedSumRow": exp, "match": m})

# 수시 총원 열합(정원내+정원외). 군위탁 추천인원(가변)은 제외 → PDF 명시 1,747.
computed_total = sum(col_sums.values())  # 군위탁=0 포함
expected_total = 1747
total_match = (computed_total == expected_total)
if not total_match:
    all_match = False
    warnings.append(f"[열합총계] 계산={computed_total} vs PDF명시={expected_total} — 불일치")

checksum_passed = (len(parse_fail) == 0) and all_match

# ── 표준 warnings ────────────────────────────────────────────────────────────
warnings.append(
    "[DRAFT 초안] 원본 PDF 파일명이 '서울과학기술대학교 2027학년도 수시 신입생 모집요강(안)' — "
    "'(안)'은 초안(draft)으로 확정본이 아님. 본 추출물은 초안 기준이며, 7~9월 확정본 공고 시 "
    "수치·전형방법 변동 가능. meta.draft=true."
)
warnings.append(
    "[단일 캠퍼스 / 지역인재 없음] 서울과기대는 서울 노원구 공릉 단일 캠퍼스(p91). 지역인재 전형 없음 "
    "(서울 소재 — 지방대학 지역인재 대상 아님). 전 학과 campus='서울'."
)
warnings.append(
    "[자유전공학부 수시 미선발(공과/정보통신/에너지바이오/인문사회/기술경영)] p14 명시: 5개 단과대학 "
    "자유전공학부는 수시 미선발(정시 수능위주전형으로만 선발) → 총괄표 전 컬럼 '-' → 미생성. "
    "수시 선발 자유전공학부는 ST자유전공학부_자연(논술162)·_인문(학우18), 자유전공학부(미래융합대학)(평생72)·"
    "(창의융합대학)(학우25+고교추천25=50) 4개뿐."
)
warnings.append(
    "[평생학습자 정원내 라벨] p13 헤더상 '평생학습' 컬럼은 '정원내' 라벨(자유전공학부(미래융합대학) 72명). "
    "본문(p42)은 학생부종합 기회균형(평생학습자). 헤더 라벨대로 정원내 합(1,429)에 포함, "
    "specialTypeKeyword='평생학습자'(정원외 미표기). 특성화고졸재직자(168)는 p13 헤더 '정원외'."
)
warnings.append(
    "[특수교육대상자전형 학과 미배분] p46 정원외 10명을 미래융합대학 단위로 모집(학과별 상한 없이 최종 "
    "성적 상위 10명). p15 표에서도 '추천 인원' 병합셀로 10이 미래융합 블록 중앙 배치 → 특정 학과 귀속 "
    "불가. CAU 장애인전형 패턴과 동일하게 [기회균형-특수교육대상자]미래융합대학 단위 별도 레코드 1건 생성."
)
warnings.append(
    "[군위탁전형 고정인원 없음] p48 정원외, 미래융합대학 내 정원 제한 없이 교육부장관 추천 인원 대상 모집 "
    "→ quotaInitial=null + note. PDF 합계행도 '추천 인원'(%= -). 열합 군위탁=0(고정정원 없음)으로 처리, "
    "열합총계 1,747은 군위탁 제외 정원내+정원외 합."
)
warnings.append(
    "[학과 개편(p7)] 신설: 양자융합물리학과. 명칭변경: 스마트ICT융합공학과→ICT융합공학과, "
    "디자인학과(산업/시각디자인전공)→산업디자인학과·시각디자인학과, 산업공학과→산업공학부, "
    "미래에너지융합학과→미래에너지학과. 모집단위 분리: ST자유전공학부→_자연/_인문."
)
warnings.append(
    "[반영비율 배점 표기] 본교 전형요소 배점은 1,000점 만점 절대점수 표기(비율 100%/70%/30% 등). "
    "components 값은 PDF 원점수(예: 서류 1,000점, 면접 300점) 그대로 보존 → components 합이 100이 "
    "아니라 stageMaxScore(1,000)와 일치(검증기 정보용 경고는 무시)."
)

# ════════════════════════════════════════════════════════════════════════════
# 4. 결과 조립
# ════════════════════════════════════════════════════════════════════════════
result = {
    "universityName": "서울과학기술대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)


def cnt(f):
    return sum(1 for t in all_tracks if f(t))


q_n = cnt(lambda t: t["quotaInitial"] is not None)
r_n = cnt(lambda t: t["reflectionStages"])
c_n = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])
row_pass = len(departments) - len(parse_fail)

meta = {
    "universityName": "서울과학기술대학교", "universityId": "kcue_0000036",
    "year": 2027, "recruitmentSeason": "susi", "sourceDocYear": 2027,
    "draft": True,
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0,
    "campusScope": "단일 캠퍼스(서울 노원구 공릉)",
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "basis": "수시 합계 열",
        "passed": row_pass, "failed": len(parse_fail),
        "failedList": [f"{n}(계{g}≠합{s})" for (n, g, s) in parse_fail],
    },
    "colTotalValidation": coltotal_result,
    "colTotalGye": {"computed": computed_total, "expected": expected_total, "match": total_match},
    "checksumPassed": checksum_passed,
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T],
        "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

out_path = BASE / "seoultech-text.json"
out_path.write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# ════════════════════════════════════════════════════════════════════════════
# 5. 콘솔 리포트
# ════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("서울과학기술대학교 2027 수시 — 텍스트 직접 구조화 (Vision 미사용, $0)")
print("=" * 72)
print(f"⚠️ DRAFT(초안) — 원본 '모집요강(안)' / meta.draft={meta['draft']}")
print(f"그리드 물리페이지: p{PG_GRID1}, p{PG_GRID2}  |  캠퍼스: {CAMPUS} 단일")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증(수시합계 기준): 통과 {row_pass} / 실패 {len(parse_fail)}")
for n, g, s in parse_fail:
    print(f"   [실패] {n}: 수시합계 {g} != 전형합 {s}")
if skip1 or skip2:
    print(f"\n파싱 제외행(미래융합 병합셀 등): p13 {len(skip1)}, p15 {len(skip2)}")

print("\n열합 검증 (전형별 계산 vs PDF 합계행):")
for item in coltotal_result:
    flag = "OK" if item["match"] else "XX"
    print(f"  [{flag}] {item['track']:16s}  계산={item['computed']:4d}  PDF합계={item['expectedSumRow']:4d}")
print(f"  수시 총원: 계산={computed_total}  PDF명시={expected_total}  {'OK' if total_match else 'XX'}")

print(f"\nmeta.checksumPassed: {checksum_passed}")
print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n),
                 ("csatMinimumRawText", c_n), ("csatMinimumExempt", ce_n),
                 ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    pct = 100 * n // T if T else 0
    print(f"  {label:22s}: {n}/{T} ({pct}%)")

print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {out_path}")
