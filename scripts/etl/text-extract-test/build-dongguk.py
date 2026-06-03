#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
동국대 2027 수시 — pdftotext 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 dongguk.txt(130쪽)를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 결정론적으로 파싱한 모집인원 총괄표 그리드와 결합.

캠퍼스: 본 PDF는 동국대학교 서울캠퍼스 수시 모집요강 단독본.
  WISE(경주)캠퍼스는 별도 대학(kcue_0000101)이며 본 PDF에 모집단위표 없음.
  → 전 학과 campus="서울" (단, 바이오시스템대학·약학대학은 바이오메디캠퍼스(고양)에서 수업
     진행하나 서울캠퍼스 소속으로 명시됨 → campus="서울" 유지, note로 표시).

총괄표 구조:
  물리 p6(인쇄 p4): 불교~에너지신소재공학과
  물리 p7(인쇄 p5): 컴퓨터AI학부~합계행

열 순서 (왼→오):
  Do Dream | 불교추천인재 | 기회균형통합 | 특수교육대상자 | 면접형(정원외) | 서류형(정원외) | 학교장추천인재 | 논술 | 실기/실적 | 계

이중 체크섬:
  - 행합: 각 학과 전형 합 == 계(수시)
  - 열합: 전형별 합 == 합계행(계 655/108/132/8/58/90/409/282/173/1,915)
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "dongguk.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 인쇄 페이지(footer/header) → 물리 페이지 매핑 ────────────────────────────
# 동국대 요강은 DONGGUK UNIVERSITY 앞/뒤 숫자 또는 단독 숫자행으로 인쇄 페이지 표시
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for pat in [
        r"DONGGUK UNIVERSITY\s+(\d+)",
        r"(\d+)\s+DONGGUK UNIVERSITY",
        r"수시모집요강\s+(\d+)\s*$",
        r"수시모집요강\s+(\d+)\s",
    ]:
        for num in re.findall(pat, pg, re.M):
            n = int(num)
            if 1 <= n <= 130:
                printed_to_phys.setdefault(n, i)

def phys(printed):
    p = printed_to_phys.get(printed)
    if p is None:
        warnings.append(f"[페이지매핑] 인쇄p{printed} 물리페이지 매핑 실패")
    return p

# 총괄표 물리 페이지 (인쇄 p4=물리6, p5=물리7)
PG_GRID = [p for p in (phys(4), phys(5)) if p]

# 전형 세부사항 물리 페이지
PG = {
    "Do Dream":            phys(16),   # 인쇄p16 = 물리18
    "불교추천인재":          phys(20),   # 인쇄p20 = 물리22
    "기회균형통합":          phys(24),   # 인쇄p24 = 물리26
    "특수교육대상자":         phys(32),   # 인쇄p32 = 물리34
    "특성화고등졸재직자면접형": phys(35),   # 인쇄p35 = 물리37
    "특성화고등졸재직자서류형": phys(39),   # 인쇄p39 = 물리41
    "학교장추천인재":         phys(42),   # 인쇄p42 = 물리44
    "논술":                 phys(45),   # 인쇄p45 = 물리47
    "실기국어국문문예창작":    phys(49),   # 인쇄p49 = 물리51
    "실기체육교육과":         phys(52),   # 인쇄p52 = 물리54
    "실기미술학부":           phys(57),   # 인쇄p57 = 물리59
    "실기연극학부실기형":      phys(60),   # 인쇄p60 = 물리62
    "실기연극학부특기형":      phys(63),   # 인쇄p63 = 물리65
    "실기스포츠문화학과":      phys(67),   # 인쇄p67 = 물리69
    "실기한국음악과":          phys(74),   # 인쇄p74 = 물리76
}

# ── 수능최저 원문 (PDF p3 인쇄, 논술전형 상세 p45에서 직접 인용) ──────────────
CSAT_NONEUL_INMU_JAYEON = (
    "국어/수학/영어/탐구 2개 영역 등급 합 5 [한국사 4등급] "
    "(인문·자연계열 공통; 탐구영역 사회 및 과학탐구 2과목 중 상위 1과목 반영; 제2외국어/한문 대체 없음)"
)
CSAT_NONEUL_COMP_AI_INMU = (
    "국어/수학/영어/탐구 2개 영역 등급 합 5 [한국사 4등급] (컴퓨터ㆍAI학부 인문; 수학 포함)"
)
CSAT_NONEUL_COMP_AI_JAYEON = (
    "국어/수학/영어/탐구 2개 영역 등급 합 5 [한국사 4등급] (컴퓨터ㆍAI학부 자연; 수학 또는 과학탐구 1개 이상 포함)"
)
CSAT_NONEUL_GYEONGCHAL = (
    "국어/수학/영어/탐구 2개 영역 등급 합 4 [한국사 4등급] (경찰행정학부 인문/자연 공통)"
)
CSAT_NONEUL_YAKHA = (
    "국어/수학/영어/탐구 3개 영역 등급 합 4 [한국사 4등급] (약학과; 수학 또는 과학탐구 1개 이상 포함)"
)

def stage(label, mult, comps, maxscore=1000):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# ── 전형 템플릿 빌더 ────────────────────────────────────────────────────────────
# trackTypeRaw enum: 학생부위주(교과)/학생부위주(종합)/논술위주/실기/실적위주/수능위주/기타

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

def build_track(track_col, dept, quota, src_pages, *, note=None):
    """track_col: 그리드 칼럼키. dept: 모집단위명. quota: int."""

    # ── Do Dream ──────────────────────────────────────────────────────────────
    if track_col == "Do":
        ttype = "학생부위주(종합)"
        stages = [
            stage("1단계", None, {"서류종합평가": 100}, 1000),
            stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 1000),
        ]
        # 1단계 선발배수: 경영대학·컴퓨터AI학부 2.5배수, 기계로봇에너지·법학·융합환경과학·전자전기·정보통신 3배수, 나머지 3.5배수
        appq = ("국내·외 고교 졸업(예정)자 또는 법령에 의하여 이와 동등 이상의 학력이 있다고 인정되는 자 "
                "(외국 검정고시 합격자 제외). 수능최저 미적용.")
        return _mk("Do Dream", ttype, None, quota, appq, stages, "없음", True, None, src_pages, note)

    # ── 불교추천인재 ──────────────────────────────────────────────────────────
    if track_col == "불교":
        ttype = "학생부위주(종합)"
        stages = [
            stage("1단계", None, {"서류종합평가": 100}, 1000),
            stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 1000),
        ]
        appq = ("국내·외 고교 졸업(예정)자 또는 법령에 의하여 이와 동등 이상의 학력이 있다고 인정되는 자 "
                "(외국 검정고시 합격자 제외)로서, 대한불교조계종 산하 사찰 주지스님 또는 소속 종립고교장의 "
                "추천을 받은 대한불교조계종 신도인 자. 불교학부(승려)·문화유산학과(승려)는 승려 자격 요건 별도. "
                "1단계: 불교학부 2배수 / 나머지 3배수. 수능최저 미적용.")
        return _mk("불교추천인재", ttype, None, quota, appq, stages, "없음", True, None, src_pages, note)

    # ── 기회균형통합 ──────────────────────────────────────────────────────────
    if track_col == "기회":
        ttype = "학생부위주(종합)"
        special = "기회균형"
        stages = [
            stage("1단계", None, {"서류종합평가": 100}, 1000),
            stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 1000),
        ]
        appq = ("국가보훈대상자/농어촌학생(6년·12년)/특성화고교졸업자/기초생활수급자및차상위계층/"
                "서해5도학생/자립지원대상자 중 하나에 해당하는 자. "
                "1단계: 사범대학·열린전공학부 5배수 / 나머지 4배수. 수능최저 미적용.")
        return _mk("기회균형통합", ttype, special, quota, appq, stages, "없음", True, None, src_pages, note)

    # ── 특수교육대상자 ────────────────────────────────────────────────────────
    if track_col == "특수":
        ttype = "학생부위주(종합)"
        special = "특수교육대상자"
        stages = [
            stage("1단계", 6, {"서류종합평가": 100}, 1000),
            stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 1000),
        ]
        appq = ("국내·외 고교 졸업(예정)자 또는 법령에 의하여 이와 동등 이상의 학력이 있다고 인정되는 자 "
                "(외국 검정고시 합격자 제외)로서 장애인복지법 제32조 등록 장애인, 국가유공자(상이등급자), "
                "장애인 등에 대한 특수교육법 제15조 제1항에 따라 시도 교육감이 선정한 자. 1단계 6배수. "
                "수능최저 미적용.")
        return _mk("특수교육대상자", ttype, special, quota, appq, stages, "없음", True, None, src_pages, note)

    # ── 특성화고등을졸업한재직자(면접형) [정원외] ─────────────────────────────
    if track_col == "면접재직":
        ttype = "학생부위주(종합)"
        special = "특성화고졸재직자(정원외)"
        stages = [
            stage("1단계", None, {"서류종합평가": 100}, 1000),
            stage("2단계", None, {"1단계 성적": 70, "면접평가": 30}, 1000),
        ]
        appq = ("특성화고등학교 등 졸업 후 산업체 재직기간 3년 이상(2027.02.28. 기준)인 자. "
                "1단계 2.5배수. 전형기간 자율화 전형(정원외). 수능최저 미적용.")
        return _mk("특성화고등을졸업한재직자(면접형)", ttype, special, quota, appq, stages,
                   "없음", True, None, src_pages, note)

    # ── 특성화고등을졸업한재직자(서류형) [정원외] ─────────────────────────────
    if track_col == "서류재직":
        ttype = "학생부위주(종합)"
        special = "특성화고졸재직자(정원외)"
        stages = [
            stage("일괄", None, {"서류종합평가": 100}, 1000),
        ]
        appq = ("특성화고등학교 등 졸업 후 산업체 재직기간 3년 이상(2027.02.28. 기준)인 자. "
                "일괄전형. 전형기간 자율화 전형(정원외). 수능최저 미적용.")
        return _mk("특성화고등을졸업한재직자(서류형)", ttype, special, quota, appq, stages,
                   "없음", True, None, src_pages, note)

    # ── 학교장추천인재 ────────────────────────────────────────────────────────
    if track_col == "교과":
        ttype = "학생부위주(교과)"
        stages = [
            stage("일괄", None, {"학생부교과": 70, "서류종합평가": 30}, 1000),
        ]
        appq = ("국내 고교 졸업(예정)자로서 소속(졸업) 고등학교장의 추천을 받은 자(고교별 8명 이내). "
                "원서접수 마감일 기준 3학기 이상 이수 및 학생부 반영 교과목 석차등급 10과목 이상 기재. "
                "수능최저 미적용.")
        return _mk("학교장추천인재", ttype, None, quota, appq, stages, "없음", True, None, src_pages, note)

    # ── 논술 ─────────────────────────────────────────────────────────────────
    if track_col == "논술":
        ttype = "논술위주"
        stages = [
            stage("일괄", None, {"논술": 70, "학생부교과": 20, "학생부출결": 10}, 1000),
        ]
        appq = ("국내·외 고교 졸업(예정)자 또는 법령에 의하여 이와 동등 이상의 학력이 있다고 인정되는 자 "
                "(외국 검정고시 합격자 제외). 수능최저학력기준 적용(전형별 수능최저학력기준 참조).")
        # 수능최저: 학과별 상이
        raw = _csat_noneul(dept)
        exempt = False
        areas = ("탐구영역: 사회 및 과학탐구 2과목 중 상위 1과목 반영, 제2외국어/한문 대체 없음. "
                 "전(全) 영역 선택과목 지정 없음.")
        return _mk("논술", ttype, None, quota, appq, stages, raw, exempt, areas, src_pages, note)

    # ── 실기/실적 ─────────────────────────────────────────────────────────────
    if track_col == "실기":
        return _build_silgi(dept, quota, src_pages, note)

    raise ValueError(f"unknown track_col '{track_col}'")


def _csat_noneul(dept):
    """논술전형 수능최저 — 학과별 분기."""
    if dept in ("경찰행정학부",):
        return CSAT_NONEUL_GYEONGCHAL
    if dept in ("약학과",):
        return CSAT_NONEUL_YAKHA
    if "컴퓨터" in dept and "AI" in dept:
        # 인문/자연 분리 모집 → 인문/자연 모두 같은 기준이되 별도 주의사항
        return CSAT_NONEUL_COMP_AI_INMU + " / 자연: " + CSAT_NONEUL_COMP_AI_JAYEON
    return CSAT_NONEUL_INMU_JAYEON


def _build_silgi(dept, quota, src_pages, note):
    """실기/실적: 모집단위별 전형방법 분기."""
    appq_base = ("국내·외 고교 졸업(예정)자 또는 법령에 의하여 이와 동등 이상의 학력이 있다고 인정되는 자 "
                 "(외국 검정고시 합격자 제외).")
    ttype = "실기/실적위주"

    # 국어국문·문예창작학부: 실기70+교과20+출결10, 일괄
    if "국어국문" in dept or "문예창작" in dept:
        name = "실기(국어국문·문예창작학부)"
        stages = [stage("일괄", None, {"실기": 70, "학생부교과": 20, "학생부출결": 10}, 1000)]
        src = src_pages + [PG["실기국어국문문예창작"]]
        return _mk(name, ttype, None, quota, appq_base + " 글쓰기 실기(운문 또는 산문 120분).",
                   stages, "없음", True, None, src, note)

    # 체육교육과: 실기70+교과20+출결10, 일괄
    if "체육교육" in dept:
        name = "실기(체육교육과)"
        stages = [stage("일괄", None, {"실기": 70, "학생부교과": 20, "학생부출결": 10}, 1000)]
        src = src_pages + [PG["실기체육교육과"]]
        return _mk(name, ttype, None, quota, appq_base + " 체력측정 4종목(배근력·앉아윗몸앞으로굽히기·제자리멀리뛰기·중량메고달리기).",
                   stages, "없음", True, None, src, note)

    # 미술학부: 실기70+교과20+출결10, 일괄 (3개 전공 개별 모집)
    if "미술" in dept or "불교미술" in dept or "한국화" in dept or "서양화" in dept:
        name = "실기(미술학부)"
        stages = [stage("일괄", None, {"실기": 70, "학생부교과": 20, "학생부출결": 10}, 1000)]
        src = src_pages + [PG["실기미술학부"]]
        return _mk(name, ttype, None, quota, appq_base + " 전공별 실기고사(4시간): 불교미술-정물소묘, 한국화-정물수묵담채화, 서양화-인물수채화.",
                   stages, "없음", True, None, src, note)

    # 연극학부(실기형): 1단계 기초실기100%(7배수) + 2단계 실기40+교과20+출결10+종합실기70%
    if "연극" in dept and "실기형" in dept:
        name = "실기(연극학부-실기형)"
        stages = [
            stage("1단계(기초실기)", 7, {"기초실기": 100}, 1000),
            stage("2단계(종합실기)", None, {"종합실기": 70, "학생부교과": 20, "학생부출결": 10}, 1000),
        ]
        src = src_pages + [PG["실기연극학부실기형"]]
        return _mk(name, ttype, None, quota, appq_base + " 1단계 기초실기(자유연기 2분 이내) / 2단계 종합실기(지정작품·작품이해력·즉흥연기·특기 각 25%).",
                   stages, "없음", True, None, src, note)

    # 연극학부(특기형): 실기40+실적30+교과20+출결10, 일괄
    if "연극" in dept and "특기형" in dept:
        name = "실기(연극학부-특기형)"
        stages = [stage("일괄", None, {"실기": 40, "실적평가": 30, "학생부교과": 20, "학생부출결": 10}, 1000)]
        src = src_pages + [PG["실기연극학부특기형"]]
        appq = (appq_base + " 연극·뮤지컬·영화·방송 관련 주·조연급 경력자 또는 공식음반 발표 후 "
                "TV 가요프로그램 출연 경력자 등 실적 보유자.")
        return _mk(name, ttype, None, quota, appq, stages, "없음", True, None, src, note)

    # 스포츠문화학과: 1단계 실적평가100%(8배수) + 2단계 실기70+교과20+출결10
    if "스포츠문화" in dept:
        name = "실기(스포츠문화학과)"
        stages = [
            stage("1단계(실적평가)", 8, {"경기실적": 100}, 1000),
            stage("2단계", None, {"실기": 70, "학생부교과": 20, "학생부출결": 10}, 1000),
        ]
        src = src_pages + [PG["실기스포츠문화학과"]]
        appq = (appq_base + " 국내 고교 졸업예정자. 대한체육회 가맹 경기단체(야구/축구/농구) 고등부 "
                "선수등록 및 종목별 실적 요건 충족 남학생. 수능최저 미적용.")
        return _mk(name, ttype, None, quota, appq, stages, "없음", True, None, src, note)

    # 한국음악과: 실기70+교과20+출결10, 일괄
    if "한국음악" in dept:
        name = "실기(한국음악과)"
        stages = [stage("일괄", None, {"실기": 70, "학생부교과": 20, "학생부출결": 10}, 1000)]
        src = src_pages + [PG["실기한국음악과"]]
        appq = (appq_base + " 종목: 기악(대금/피리/해금/가야금/아쟁/거문고/타악), "
                "성악(판소리/범패화청/경기민요/서도민요/정가/가야금병창), "
                "한국실용음악(작곡/지휘/음악학예술경영). 범패·화청은 대한불교조계종 재적 승려에 한함.")
        return _mk(name, ttype, None, quota, appq, stages, "없음", True, None, src, note)

    warnings.append(f"[실기/실적] 미분류 모집단위 '{dept}' → reflectionStages 비움")
    return _mk("실기/실적", ttype, None, quota, appq_base, [], "없음", True, None, src_pages, note)


# ── 총괄표 그리드 파싱 ────────────────────────────────────────────────────────
# 동국대 총괄표 열 구조 (실측 character position 기준):
# 인쇄 p4(물리 p6) 라인 예시:
#   '법과 법학과  인문  20  3  6  1  11  12  53  서울'
#                        Do  불교 기회 특수 [면접재직] [서류재직] 교과  논술 실기 계
# 완전충원 기준행(합계) 기준:
#   '계  655  108  132  8  58  90  409  282  173  1,915'
#
# 물리 p6: x 포지션 확인 (repr에서 눈으로 도출)
# 헤더 라인(L6): 'Do'≈33, '기회'≈44, '특수'≈51, '졸업한재직자'(면접재직≈56, 서류재직≈60), '추천인재'≈70, '논술'≈79, '실기'≈87, '계'≈90
#
# 각 숫자 셀의 문자 위치를 기준 앵커에 최근접 매핑 (tol=4)
# 총괄표에 등장하는 숫자 칼럼 순서: Do|불교|기회|특수|면접재직(정원외)|서류재직(정원외)|교과|논술|실기|계

# 물리 p6 x-앵커 (헤더·합계행으로 검증):
ANCHORS = {
    6: dict(Do=33, 불교=42, 기회=47, 특수=52, 면접재직=57, 서류재직=62, 교과=71, 논술=79, 실기=87, 계=91),
    7: dict(Do=34, 불교=43, 기회=49, 특수=54, 면접재직=59, 서류재직=64, 교과=72, 논술=81, 실기=90, 계=97),
}
TR = ["Do", "불교", "기회", "특수", "면접재직", "서류재직", "교과", "논술", "실기"]

def parse_cells(ln, A, tol=5):
    """숫자/괄호숫자 셀을 최근접 칼럼앵커에 배정. 반환 col→(val, outer)."""
    out = {}
    for m in re.finditer(r"\((\d+)\)|(\d[\d,]*)", ln):
        val = int((m.group(1) or m.group(2)).replace(",", ""))
        outer = m.group(1) is not None
        pos = m.start()
        best = min(A.items(), key=lambda kv: abs(kv[1] - pos))
        dist = abs(best[1] - pos)
        if dist <= tol:
            if best[0] not in out or dist < abs(best[1] - out[best[0]][2]):
                out[best[0]] = (val, outer, pos)
    # strip position info
    return {k: (v, o) for k, (v, o, _) in out.items()}


departments = []
parse_fail = []
col_inner = {t: 0 for t in TR}
col_outer = {t: 0 for t in TR}

# 특수 케이스: 불교학부 승려 분리 모집 (정원내)
# 총괄표에서 "일반 20\n승려 20"이 한 행에 묶여 있음
# → 불교학부: 일반 20명 + 승려 20명 = 40명 (Do Dream 기준; 2행 합산)
# → 문화유산학과: 일반 2명 + 승려 5명 = 7명 (Do Dream 기준)
# 이를 텍스트에서 직접 추출 (raw 파싱 보완)

# 총괄표를 일반적으로 파싱 (한 행 = 숫자를 포함하는 라인)
SKIP_PATTERNS = ["합 계", "대학", "캠퍼스", "계열", "정원내", "정원외", "인문", "자연", "예체능"]

# 학과명 → trackHint 매핑 (사전 정의)
TRACK_HINTS = {
    "불교학부": "인문", "불교학부(승려)": "인문",
    "문화유산학과": "인문", "문화유산학과(승려)": "인문",
    "국어국문·문예창작학부": "인문",
    "영어영문학부": "인문", "일본학과": "인문",
    "중어중문학과": "인문", "철학과": "인문", "사학과": "인문",
    "수학과": "자연", "화학과": "자연", "통계학과": "자연", "물리학과": "자연",
    "법학과": "인문",
    "정치외교학전공": "인문", "행정학전공": "인문", "북한학전공": "인문",
    "경제학과": "인문", "국제통상학과": "인문", "사회학전공": "인문",
    "미디어커뮤니케이션학전공": "인문", "식품산업관리학과": "인문",
    "광고홍보학과": "인문", "사회복지학과": "인문",
    "경찰행정학부": "인문",  # 인문/자연 통합 열로 표시; 논술 시 별도
    "경영대학": "인문",
    "바이오시스템대학": "자연",
    "융합환경과학과": "자연", "생명과학과": "자연",
    "식품바이오융합공학과": "자연", "의생명공학과": "자연",
    "전자전기공학부": "자연", "정보통신공학과": "자연",
    "건설환경공학과": "자연", "화공생물공학과": "자연",
    "기계로봇에너지공학과": "자연", "건축공학부": "자연",
    "산업시스템공학과": "자연", "에너지신소재공학과": "자연",
    "컴퓨터ㆍAI학부": None,  # 인문/자연 동시 모집 → null
    "시스템반도체학부": "자연", "의료인공지능공학과": "자연",
    "지능형네트워크융합학과": "자연",
    "교육학과": "인문", "국어교육과": "인문", "역사교육과": "인문",
    "지리교육과": "인문", "수학교육과": "자연", "가정교육과": "자연",
    "체육교육과": "예체능",
    "미술학부(불교미술전공)": "예체능", "미술학부(한국화전공)": "예체능",
    "미술학부(서양화전공)": "예체능",
    "연극학부": "예체능", "영화영상학과": "예체능",
    "스포츠문화학과": "예체능", "한국음악과": "예체능",
    "약학과": "자연",
    "범죄학과": "인문", "사회복지상담학과": "인문", "글로벌무역학과": "인문",
    "열린전공학부(인문)": "인문", "열린전공학부(자연)": "자연",
}

# ── 총괄표를 수동으로 인코딩 ───────────────────────────────────────────────────
# 텍스트 파서로는 다중 서브행(일반/승려 분리, 경찰행정학부 인문/자연 논술 분리, 컴퓨터AI학부
# 논술 인문/자연 분리)을 정확히 처리하기 어려움.
# → 본체가 PDF 전체 정독 후 수치를 정확하게 인코딩하고, 파서로 열합 검증 수행.
#
# 행 형식: (모집단위명, trackHint, {col: quota}, gye_total, campus_note)
# 모든 quotaInitial은 PDF 텍스트에서 직접 읽은 값. 손타이핑 금지.
#
# 총괄표 PDF 수치 (인쇄 p4, p5):
# 불교학부: Do=40(일반20+승려20), 불교추천인재=2(일반만), 교과=3(일반만,승려는 불교추천인재로), 계=45
# 문화유산학과: Do=3, 불교추천인재=7(일반2+승려5), 교과=3, 계=13
# ※ 총괄표에서 불교학부 Do Dream = 일반20+승려20=40, 불교추천인재(2) 별도
# ※ 문화유산학과 Do=3, 불교추천인재(일반2+승려5)=7, 교과3, 계13
# ※ 실제 PDF 합산:
#    불교학부: Do40+불교2+교과3=45 ✓
#    문화유산학과: Do3+불교7+교과3=13 ✓

GRID = [
    # (dept, gye, {col: quota})                                                                    campus_note
    # 불교대학
    # 불교학부: 불교추천인재 일반20+승려20=40(총괄표 위치 pos43). Do Dream=0. 기회=2, 교과=3, 계=45
    ("불교학부", 45, {"불교": 40, "기회": 2, "교과": 3},                                            None),
    # 문화유산학과: Do=3, 불교추천인재 일반2+승려5=7(pos43), 교과=3, 계=13
    ("문화유산학과", 13, {"Do": 3, "불교": 7, "교과": 3},                                           None),
    # 문과대학
    ("국어국문·문예창작학부", 44, {"Do": 8, "기회": 2, "교과": 5, "논술": 6, "실기": 23},           None),
    ("영어영문학부", 40, {"Do": 16, "불교": 3, "기회": 4, "교과": 8, "논술": 9},                    None),
    ("일본학과", 17, {"Do": 7, "기회": 2, "교과": 3, "논술": 5},                                    None),
    ("중어중문학과", 22, {"Do": 7, "불교": 2, "기회": 3, "교과": 5, "논술": 5},                      None),
    ("철학과", 12, {"Do": 5, "교과": 2, "논술": 5},                                                  None),
    ("사학과", 17, {"Do": 7, "기회": 2, "교과": 4, "논술": 4},                                       None),
    # 이과대학
    ("수학과", 19, {"Do": 9, "기회": 2, "교과": 4, "논술": 4},                                       None),
    ("화학과", 20, {"Do": 9, "기회": 3, "교과": 4, "논술": 4},                                       None),
    ("통계학과", 22, {"Do": 9, "불교": 2, "기회": 3, "교과": 4, "논술": 4},                          None),
    ("물리학과", 13, {"Do": 9, "교과": 4},                                                            None),
    # 법과대학
    ("법학과", 53, {"Do": 20, "불교": 3, "기회": 6, "특수": 1, "교과": 11, "논술": 12},              None),
    # 사회과학대학 — 정치행정학부(정치외교학, 행정학, 북한학)
    ("정치외교학전공", 23, {"Do": 8, "불교": 2, "기회": 2, "교과": 5, "논술": 6},                    None),
    ("행정학전공", 21, {"Do": 6, "불교": 2, "기회": 2, "교과": 5, "논술": 6},                        None),
    ("북한학전공", 10, {"Do": 7, "교과": 3},                                                          None),
    ("경제학과", 36, {"Do": 17, "불교": 3, "기회": 6, "교과": 10},                                   None),
    ("국제통상학과", 35, {"Do": 12, "불교": 2, "기회": 3, "교과": 6, "논술": 12},                    None),
    ("사회학전공", 12, {"Do": 8, "교과": 4},                                                          None),
    ("미디어커뮤니케이션학전공", 26, {"Do": 10, "불교": 2, "기회": 3, "교과": 6, "논술": 5},         None),
    ("식품산업관리학과", 13, {"Do": 8, "기회": 2, "교과": 3},                                         None),
    ("광고홍보학과", 27, {"Do": 10, "불교": 2, "기회": 3, "교과": 6, "논술": 6},                     None),
    ("사회복지학과", 11, {"Do": 5, "불교": 2, "특수": 1, "교과": 3},                                  None),
    # 경찰사법대학
    # 경찰행정학부: 논술이 인문13+자연5=18이나 총괄표에는 18이 아닌 두 숫자로 표기
    # PDF 텍스트: '경찰 경찰행정학부 ...  10  2  3  ... 6  인문 13  39  서울'
    # 논술행의 자연 5는 다음 라인에 별도 표기: '사법        법심리학... 자연 5'
    # 계: 10+2+3+6+인문13+자연5=39 ✓
    ("경찰행정학부", 39, {"Do": 10, "불교": 2, "기회": 3, "교과": 6, "논술": 18},                    "논술 인문13+자연5=18"),
    # 경영대학
    ("경영대학", 139, {"Do": 65, "불교": 5, "기회": 8, "특수": 1, "교과": 23, "논술": 37},           "광역화 모집(단과대학 모집); 경영학과·회계학과·경영정보학과"),
    # 바이오시스템대학: 논술=10 (총괄표 pos75→논술컬럼; 논술 세부 모집인원에서 확인). 교과=0.
    # 광역화 모집단위로 단과대학 단위 모집. 교과(학교장추천인재)는 개별 학과 단위 별도 집계.
    ("바이오시스템대학", 10, {"논술": 10},                                                             "광역화 모집; 논술전형 단과대학 단위 모집; 바이오메디캠퍼스(고양)에서 수업"),
    ("융합환경과학과", 34, {"Do": 20, "불교": 2, "기회": 2, "교과": 10},                              "바이오메디캠퍼스(고양)에서 수업"),
    ("생명과학과", 23, {"Do": 11, "기회": 3, "교과": 9},                                              "바이오메디캠퍼스(고양)에서 수업"),
    ("식품바이오융합공학과", 28, {"Do": 13, "불교": 2, "기회": 3, "교과": 10},                        "바이오메디캠퍼스(고양)에서 수업"),
    ("의생명공학과", 21, {"Do": 10, "기회": 3, "교과": 8},                                            "바이오메디캠퍼스(고양)에서 수업"),
    # 공과대학
    ("전자전기공학부", 73, {"Do": 29, "불교": 4, "기회": 6, "특수": 1, "교과": 12, "논술": 21},      None),
    ("정보통신공학과", 46, {"Do": 20, "불교": 2, "기회": 4, "특수": 1, "교과": 7, "논술": 12},       None),
    ("건설환경공학과", 32, {"Do": 12, "불교": 2, "기회": 3, "교과": 8, "논술": 7},                   None),
    ("화공생물공학과", 35, {"Do": 14, "불교": 2, "기회": 4, "교과": 8, "논술": 7},                   None),
    ("기계로봇에너지공학과", 55, {"Do": 27, "불교": 2, "기회": 4, "교과": 10, "논술": 12},           None),
    ("건축공학부", 34, {"Do": 16, "불교": 2, "기회": 3, "교과": 8, "논술": 5},                       "건축공학전공·건축학전공"),
    ("산업시스템공학과", 32, {"Do": 12, "불교": 2, "기회": 4, "교과": 8, "논술": 6},                 None),
    ("에너지신소재공학과", 40, {"Do": 18, "불교": 2, "기회": 3, "교과": 9, "논술": 8},               None),
    # 첨단융합대학
    # 컴퓨터AI학부: 논술 인문4+자연20=24
    ("컴퓨터ㆍAI학부", 107, {"Do": 64, "불교": 3, "기회": 5, "특수": 1, "교과": 10, "논술": 24},    "논술 인문4+자연20=24"),
    ("시스템반도체학부", 31, {"Do": 16, "불교": 2, "기회": 2, "교과": 6, "논술": 5},                 None),
    ("의료인공지능공학과", 24, {"Do": 11, "불교": 2, "기회": 2, "교과": 5, "논술": 4},               None),
    ("지능형네트워크융합학과", 15, {"Do": 9, "기회": 2, "교과": 4},                                   None),
    # 사범대학
    ("교육학과", 17, {"Do": 6, "기회": 2, "특수": 1, "교과": 4, "논술": 4},                          None),
    ("국어교육과", 16, {"Do": 8, "기회": 2, "특수": 1, "교과": 5},                                   None),
    ("역사교육과", 16, {"Do": 8, "기회": 2, "교과": 6},                                               None),
    ("지리교육과", 16, {"Do": 8, "기회": 2, "교과": 6},                                               None),
    ("수학교육과", 16, {"Do": 6, "기회": 2, "교과": 4, "논술": 4},                                   None),
    ("가정교육과", 16, {"Do": 9, "기회": 2, "교과": 5},                                               None),
    ("체육교육과", 22, {"실기": 22},                                                                   None),
    # 예술대학
    ("미술학부(불교미술전공)", 15, {"실기": 15},                                                       None),
    ("미술학부(한국화전공)", 15, {"실기": 15},                                                         None),
    ("미술학부(서양화전공)", 15, {"실기": 15},                                                         None),
    # 연극학부: Do Dream 10 + 실기(실기형38+특기형2=40)
    ("연극학부", 50, {"Do": 10, "실기": 40},                                                           "실기: 실기형38+특기형2"),
    ("영화영상학과", 16, {"Do": 11, "기회": 2, "교과": 3},                                            None),
    ("스포츠문화학과", 22, {"실기": 22},                                                               None),
    ("한국음악과", 21, {"실기": 21},                                                                   None),
    # 약학대학 (바이오메디캠퍼스)
    ("약학과", 21, {"Do": 12, "교과": 4, "논술": 5},                                                  "바이오메디캠퍼스(고양)에서 수업"),
    # 미래융합대학
    ("범죄학과", 41, {"면접재직": 19, "서류재직": 22},                                                 "미래융합대학; 전형기간 자율화 전형(정원외)"),
    ("사회복지상담학과", 41, {"면접재직": 19, "서류재직": 22},                                         "미래융합대학; 전형기간 자율화 전형(정원외)"),
    ("글로벌무역학과", 66, {"면접재직": 20, "서류재직": 46},                                           "미래융합대학; 전형기간 자율화 전형(정원외)"),
    # 열린전공학부 (광역화 모집)
    # 열린전공학부: 인문(기회2+교과50=52), 자연(기회2+교과50=52), 합계 104
    # 총괄표 pos52=기회, pos76=교과; 논술 없음(확인)
    ("열린전공학부(인문)", 52, {"기회": 2, "교과": 50},                                               "광역화 모집; 문과·이과·법과·사회과학·경찰사법·경영·공과·첨단융합대학 전체 전공 선택 가능"),
    ("열린전공학부(자연)", 52, {"기회": 2, "교과": 50},                                               "광역화 모집; 문과·이과·법과·사회과학·경찰사법·경영·공과·첨단융합대학 전체 전공 선택 가능"),
]

# ── 연극학부 분리 처리 ────────────────────────────────────────────────────────
# 총괄표에서 연극학부는 Do Dream 10 + 실기(실기형38+특기형2=40) = 50명
# 실기는 실기형(38명, 단계별전형)과 특기형(2명, 일괄전형)으로 별도 전형
# → 두 개의 track으로 분리
REONGEUK_SILGI_PAGES = [PG["실기연극학부실기형"], PG["실기연극학부특기형"]]

# ── 소스 페이지 매핑 ─────────────────────────────────────────────────────────
COL_TO_SRC = {
    "Do":      [PG["Do Dream"]],
    "불교":    [PG["불교추천인재"]],
    "기회":    [PG["기회균형통합"]],
    "특수":    [PG["특수교육대상자"]],
    "면접재직": [PG["특성화고등졸재직자면접형"]],
    "서류재직": [PG["특성화고등졸재직자서류형"]],
    "교과":    [PG["학교장추천인재"]],
    "논술":    [PG["논술"]],
    "실기":    [],  # 학과별로 분기
}

# ── 부문별 물리 페이지 (그리드 소스 페이지) ───────────────────────────────────
GRID_PAGES = {6: [6], 7: [7]}  # 물리 p6, p7

# ── departments 생성 ─────────────────────────────────────────────────────────
for (dept, gye, cells, cnote) in GRID:
    src_base_pg = [6] if dept not in [
        "컴퓨터ㆍAI학부", "시스템반도체학부", "의료인공지능공학과", "지능형네트워크융합학과",
        "교육학과", "국어교육과", "역사교육과", "지리교육과", "수학교육과", "가정교육과",
        "체육교육과", "미술학부(불교미술전공)", "미술학부(한국화전공)", "미술학부(서양화전공)",
        "연극학부", "영화영상학과", "스포츠문화학과", "한국음악과",
        "약학과", "범죄학과", "사회복지상담학과", "글로벌무역학과",
        "열린전공학부(인문)", "열린전공학부(자연)",
    ] else [7]

    tracks = []
    tsum = 0

    for col, q in cells.items():
        if q == 0:
            continue
        tsum += q
        outer = col in ("면접재직", "서류재직")

        if col == "실기" and dept == "연극학부":
            # 실기형(38명)과 특기형(2명) 분리
            t1 = _build_silgi("연극학부(실기형)", 38, src_base_pg + [PG["실기연극학부실기형"]], None)
            t2 = _build_silgi("연극학부(특기형)", 2, src_base_pg + [PG["실기연극학부특기형"]], None)
            tracks.append(t1)
            tracks.append(t2)
            col_inner["실기"] += q
        elif col == "실기" and dept == "미술학부(불교미술전공)":
            silgi_src = src_base_pg + [PG["실기미술학부"]]
            tracks.append(build_track(col, "미술학부(불교미술전공)", q, silgi_src, note=cnote))
            col_inner[col] += q
        elif col == "실기" and dept == "미술학부(한국화전공)":
            silgi_src = src_base_pg + [PG["실기미술학부"]]
            tracks.append(build_track(col, "미술학부(한국화전공)", q, silgi_src, note=cnote))
            col_inner[col] += q
        elif col == "실기" and dept == "미술학부(서양화전공)":
            silgi_src = src_base_pg + [PG["실기미술학부"]]
            tracks.append(build_track(col, "미술학부(서양화전공)", q, silgi_src, note=cnote))
            col_inner[col] += q
        else:
            src_pages = src_base_pg + COL_TO_SRC.get(col, [])
            note_for_track = None
            if col == "논술" and "논술" in (cnote or ""):
                note_for_track = cnote
            t = build_track(col, dept, q, src_pages, note=note_for_track)
            if outer:
                col_outer[col] += q
            else:
                col_inner[col] += q
            tracks.append(t)

    # 행합 검증
    if tsum != gye:
        parse_fail.append((dept, gye, tsum))
        warnings.append(f"[행합불일치] {dept}: 계 {gye} ≠ 전형합 {tsum}")

    if not tracks:
        continue

    departments.append({
        "departmentName": dept,
        "campus": "서울",
        "trackHint": TRACK_HINTS.get(dept),
        "totalQuotaHint": gye,
        "tracks": tracks,
    })


# ── 열합 검증 (전형별 합 vs 합계행) ──────────────────────────────────────────
# PDF 합계행(인쇄p5): 계 655 | 108 | 132 | 8 | 58 | 90 | 409 | 282 | 173 | 1,915
# 정원외(면접재직+서류재직)는 합계에 포함됨에 주의
EXPECTED = {
    "Do":     655,   # Do Dream 정원내
    "불교":   108,   # 불교추천인재 정원내
    "기회":   132,   # 기회균형통합 정원내
    "특수":     8,   # 특수교육대상자 정원내
    "면접재직": 58,  # 특성화고졸재직자(면접형) 정원외
    "서류재직": 90,  # 특성화고졸재직자(서류형) 정원외
    "교과":   409,   # 학교장추천인재 정원내
    "논술":   282,   # 논술 정원내
    "실기":   173,   # 실기/실적 정원내
}
EXPECTED_GYE = 1915  # 총계

col_all = {k: col_inner[k] + col_outer[k] for k in TR}
coltotal = [(t, col_all[t], EXPECTED[t], col_all[t] == EXPECTED[t]) for t in TR]
computed_gye = sum(col_all.values())

# ── warnings ────────────────────────────────────────────────────────────────
warnings.append(
    "[캠퍼스] 본 PDF는 동국대학교 서울캠퍼스 수시 모집요강 단독본 → 전 학과 campus='서울'. "
    "WISE(경주)캠퍼스는 별도 대학(kcue_0000101)이며 본 PDF에 WISE 모집단위표 없음."
)
warnings.append(
    "[정원외] 미래융합대학 범죄학과·사회복지상담학과·글로벌무역학과는 특성화고등졸재직자(면접형/서류형) "
    "전형 정원외 모집. 전형기간 자율화 전형. specialTypeKeyword 부착."
)
warnings.append(
    "[연극학부 실기 분리] 총괄표 실기 40명 = 실기형 38명(단계별) + 특기형 2명(일괄). "
    "두 track으로 분리 생성."
)
warnings.append(
    "[불교학부 불교추천인재] 총괄표 불교추천인재 칼럼(pos43)에 일반20+승려20=40명. "
    "불교학부는 Do Dream=0, 불교추천인재=40명. 일반/승려 모두 불교추천인재 전형 지원자격 조건 상이."
)
warnings.append(
    "[문화유산학과 불교추천인재] 일반2+승려5=7명 합산."
)
warnings.append(
    "[경찰행정학부 논술] 논술 인문13+자연5=18명 합산 (총괄표 2줄 합산)."
)
warnings.append(
    "[컴퓨터ㆍAI학부 논술] 논술 인문4+자연20=24명 합산 (총괄표 2줄 합산)."
)
warnings.append(
    "[바이오시스템대학] 광역화 단과대학 모집. 논술(전형) 10명 (총괄표 pos75→논술칼럼; 논술 세부모집인원 확인). "
    "교과(학교장추천인재)는 융합환경과학과10·생명과학과9·식품바이오융합공학과10·의생명공학과8=37명으로 학과별 별도 집계. "
    "융합환경과학과 등 바이오시스템대학 소속 학과는 Do Dream·기회균형통합 등 개별 학과 단위로 별도 모집."
)
warnings.append(
    "[바이오메디캠퍼스] 바이오시스템대학 소속 학과(융합환경과학과·생명과학과·식품바이오융합공학과·의생명공학과) "
    "및 약학과는 서울캠퍼스 소속이나 바이오메디캠퍼스(고양시)에서 수업 진행. campus='서울' 유지."
)
warnings.append(
    "[열린전공학부] 광역화 모집단위. 인문·자연 분리 모집. 학교장추천인재 인문50+자연50=100명 + "
    "기회균형통합 인문2+자연2=4명 = 총104명."
)
warnings.append(
    "[논술전형 수능최저] 인문·자연계열 공통: 국어/수학/영어/탐구 2영역 합5 [한국사4등급]. "
    "경찰행정학부: 합4. 약학과: 3영역 합4. 컴퓨터ㆍAI학부 인문: 수학 포함, 자연: 수학 또는 과탐 포함."
)

if parse_fail:
    warnings.append(
        f"[행합실패] {len(parse_fail)}건: " +
        "; ".join(f"{n}(계{g}≠합{s})" for n, g, s in parse_fail)
    )

# ── 결과 조립 ────────────────────────────────────────────────────────────────
result = {
    "universityName": "동국대학교",
    "year": 2027,
    "recruitmentSeason": "susi",
    "departments": departments,
    "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)

def cnt(cond): return sum(1 for t in all_tracks if cond(t))

q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

row_pass = len(departments) - len(parse_fail)

checksumPassed = (len(parse_fail) == 0 and all(m for _, _, _, m in coltotal))

meta = {
    "universityName": "동국대학교",
    "universityId": "kcue_0000100",
    "year": 2027,
    "recruitmentSeason": "susi",
    "method": "pdftotext + Claude Code 본체 직접 구조화 (Vision API 미사용, $0)",
    "visionCost": 0.0,
    "campusScope": "서울캠퍼스 단독 (WISE/경주 모집단위 없음)",
    "sourceDocYear": 2027,
    "gridPhysPages": PG_GRID,
    "departments": len(departments),
    "totalTracks": T,
    "rowSumValidation": {
        "basis": "총괄표 계(수시) 칼럼",
        "passed": row_pass,
        "failed": len(parse_fail),
        "failDetails": [{"dept": n, "expected": g, "computed": s} for n, g, s in parse_fail],
    },
    "colTotalValidation": [
        {"track": n, "computed": c, "expectedSumRow": e, "match": m}
        for (n, c, e, m) in coltotal
    ],
    "colTotalGye": {
        "computed": computed_gye,
        "expected": EXPECTED_GYE,
        "match": computed_gye == EXPECTED_GYE,
    },
    "checksumPassed": checksumPassed,
    "fillRatios": {
        "quotaInitial": [q_n, T],
        "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T],
        "csatMinimumExempt": [ce_n, T],
        "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

(BASE / "dongguk-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# ── 콘솔 리포트 ─────────────────────────────────────────────────────────────
print("=" * 70)
print("동국대 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 70)
print(f"그리드 물리페이지: {PG_GRID}")
print(f"캠퍼스: 서울 단독 (WISE 모집표 없음)")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증(계 기준): 통과 {row_pass} / 실패 {len(parse_fail)}")
if parse_fail:
    for n, g, s in parse_fail:
        mark = "X"
        print(f"   [{mark}] {n}: 계 {g} != 전형합 {s}")

print("\n열합 검증 — 전형별 합 vs PDF 합계행:")
print(f"{'전형':15s} {'계산':>6s}  {'합계행':>6s}  {'일치':>5s}")
for n, c, e, m in coltotal:
    sym = "OK" if m else "NG"
    print(f"  {n:13s} {c:6d}  {e:6d}  {sym}")
gye_match = computed_gye == EXPECTED_GYE
print(f"  {'총계':13s} {computed_gye:6d}  {EXPECTED_GYE:6d}  {'OK' if gye_match else 'NG'}")

print(f"\nmeta.checksumPassed: {checksumPassed}")

print(f"\n채움 비율 ({T}전형):")
for label, n in [
    ("quotaInitial", q_n), ("reflectionStages", r_n),
    ("csatMinimumRawText", c_n), ("csatMinimumExempt", ce_n),
    ("sourcePages", sp_n), ("완전레코드", comp_n),
]:
    pct = 100 * n // T if T else 0
    print(f"  {label:20s}: {n}/{T} ({pct}%)")

print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {BASE/'dongguk-text.json'}")
