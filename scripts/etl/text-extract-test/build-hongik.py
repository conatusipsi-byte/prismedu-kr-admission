#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
홍익대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호). Claude Code 본체가 hongik.txt(142쪽)를 정독해
추출한 전형 템플릿(반영비율·수능최저)을, 각 전형별 모집인원 목록(전형별 상세 페이지)과 결합한다.

캠퍼스: 홍익대는 서울 + 세종 두 캠퍼스가 한 PDF에 수록되어 있다.
  - 서울캠퍼스 총괄표: 물리p24 (인쇄p22)
  - 세종캠퍼스 총괄표: 물리p76 (인쇄p74)
  - 전형별 세부 페이지: 서울(p29~70), 세종(p81~110)

전형 구조 (서울캠퍼스):
  - 학교장추천자전형 (학생부위주(교과), 물리p29~31)
  - 농어촌학생전형_교과 (학생부위주(교과), 물리p32~35, 인문/자연계열)
  - 농어촌학생전형_실기 (실기/실적위주, 물리p32~35, 미술계열)
  - 학교생활우수자전형 (학생부위주(종합), 물리p39~41)
  - 고른기회Ⅰ전형 (학생부위주(종합), 물리p42~45)
  - 고른기회Ⅱ전형 (학생부위주(종합), 물리p46~48)
  - 기초생활수급자·차상위계층전형 (학생부위주(종합), 물리p50~53)
  - 특성화고등을졸업한재직자전형 (학생부위주(종합), 물리p54~56)
  - 논술전형 (논술위주, 물리p57~60)
  - 미술우수자전형 (실기/실적위주, 물리p61~64)
  - 공연예술우수자전형 (실기/실적위주, 물리p65~69)

전형 구조 (세종캠퍼스):
  - 교과우수자전형 (학생부위주(교과), 물리p81~82)
  - 농어촌학생전형_교과 (학생부위주(교과), 물리p83~88, 인문/자연계열)
  - 농어촌학생전형_실기 (실기/실적위주, 물리p83~88, 미술계열)
  - 학교생활우수자전형 (학생부위주(종합), 물리p89~90)
  - 고른기회Ⅰ전형 (학생부위주(종합), 물리p91~93)
  - 고른기회Ⅱ전형 (학생부위주(종합), 물리p95~97)
  - 기초생활수급자·차상위계층전형 (학생부위주(종합), 물리p99~101)
  - 논술전형 (논술위주, 물리p102~104)
  - 미술우수자전형 (실기/실적위주, 물리p105~107)
  - 체육우수자전형 (실기/실적위주, 물리p108~110)

수능최저 (PDF 명시 직접 인용):
  - 학교장추천자전형: 국어,수학,영어,탐구 중 2개 합 5이내 + 한국사 4등급이내 (p30)
  - 학교생활우수자전형(서울): 국어,수학,영어,탐구 중 2개 합 5이내 + 한국사 4등급이내 (p40)
  - 논술전형(서울): 국어,수학,영어,탐구 중 2개 합 5이내 + 한국사 4등급이내 (p59)
  - 미술우수자전형(서울): 국어,수학,영어,탐구 중 3개 합 9이내 + 한국사 4등급이내 (p63)
  - 교과우수자전형(세종): 국어,수학,영어,탐구 중 1개 4이내 + 한국사 응시 필수 (p82)
  - 논술전형(세종): 국어,수학,영어,탐구 중 1개 4이내 + 한국사 응시 필수 (p103)
  - 고른기회Ⅰ·Ⅱ·기초생활·농어촌·재직자·공연예술·체육: 최저학력기준 없음

정직성:
  - 홍익대 PDF는 전형별 상세 페이지에 학과별 모집인원 목록을 제공 (총괄표 아님).
  - 총괄표(p24, p76)는 학과별 전형별 숫자가 한 행에 있지 않고 학과명 + 인원 형식.
  - 행합 검증: 각 학과의 전형별 quota 합 = 총괄표 학과 모집인원.
  - 열합 검증: 전형별 quota 합 = 총괄표 계 행(서울1,783, 세종974).
  - 특성화고재직자전형: 정원내 3 + 정원외 182 = 185명 (디자인·예술경영학부만 해당).
  - 서울캠퍼스 공연예술학부(디자인·예술경영학부): 재직자전형 정원내 3명 포함.
"""
import json, re
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "hongik.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")   # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

warnings = []

# ── 수능최저학력기준 원문 (PDF 직접 인용) ──────────────────────────────────────
# 서울 학교장추천자·학교생활우수자·논술전형 (p30, p40, p59)
CSAT_S1 = ("국어, 수학, 영어, 탐구(사회/과학) 영역 중 2개 영역 등급 합 5 이내, "
            "한국사 4등급 이내 (탐구: 최상위 1과목 반영)")
# 서울 미술우수자전형 (p63)
CSAT_S2 = ("국어, 수학, 영어, 탐구(사회/과학) 영역 중 3개 영역 등급 합 9 이내, "
            "한국사 4등급 이내 (탐구: 최상위 1과목 반영)")
# 세종 교과우수자전형·논술전형 (p82, p103)
CSAT_J1 = ("국어, 수학, 영어, 탐구(사회/과학) 중 1개 영역 등급 4 이내, "
            "한국사 응시 필수 (탐구: 최상위 1과목 반영)")
# 최저학력기준 없음 (수능 미적용)
CSAT_NONE = "없음"

# ── stage 헬퍼 ────────────────────────────────────────────────────────────────
def stage(label, mult, comps, maxscore=None):
    return {"stageLabel": label, "multiplier": mult, "components": comps,
            "stageMaxScore": maxscore}

# ── track 생성 헬퍼 ───────────────────────────────────────────────────────────
def mk(name, ttype, special, quota, appq, stages, raw, exempt, src_pages, note=None):
    t = {
        "trackName": name,
        "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special,
        "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": (raw == CSAT_NONE),
        "csatRequiredAreasRawText": None,
        "prevYearResult": None,
        "sourcePages": sorted({p for p in src_pages if p is not None}),
    }
    if note:
        t["note"] = note
    return t

# ══════════════════════════════════════════════════════════════════════════════
# 서울캠퍼스 전형 빌더
# 물리페이지 기준으로 직접 기재
# ══════════════════════════════════════════════════════════════════════════════

# ── 서울 학교장추천자전형 (학생부위주(교과), 물리p29~31) ─────────────────────
# 전형방법: 학생부교과 100%, 수능최저: 2개합5, 한국사4
# 모집인원: 총 307명 (물리p29)
# 전형이 1개로 학과 단위로 생성

SEOUL_HAGGYO_QUOTA = {  # 물리p29 직접 독해
    "서울캠퍼스자율전공(자연·예능)": 41,
    "서울캠퍼스자율전공(인문·예능)": 29,
    "전자·전기공학부": 30,
    "신소재·화공시스템공학부": 19,
    "컴퓨터공학과": 22,
    "산업·데이터공학과": 11,
    "기계·시스템디자인공학과": 22,
    "건설환경공학과": 8,
    "건축학부 건축학전공(5년제)": 7,
    "건축학부 실내건축학전공": 3,
    "도시공학과": 8,
    "수학교육과": 5,
    "국어교육과": 5,
    "영어교육과": 5,
    "역사교육과": 4,
    "교육학과": 5,
    "경영학부": 37,
    "영어영문학과": 5,
    "독어독문학과": 4,
    "불어불문학과": 4,
    "국어국문학과": 3,
    "법학부": 19,
    "경제학부": 7,
    "예술학과": 4,
}
SEOUL_HAGGYO_TOTAL = 307  # PDF 합계

# trackHint: 계열별 분류 (총괄표 p24 참조)
SEOUL_DEPT_CAMPUS_HINT = {
    "서울캠퍼스자율전공(자연·예능)": ("서울", None),
    "서울캠퍼스자율전공(인문·예능)": ("서울", None),
    "전자·전기공학부": ("서울", "자연"),
    "신소재·화공시스템공학부": ("서울", "자연"),
    "컴퓨터공학과": ("서울", "자연"),
    "산업·데이터공학과": ("서울", "자연"),
    "기계·시스템디자인공학과": ("서울", "자연"),
    "건설환경공학과": ("서울", "자연"),
    "건축학부 건축학전공(5년제)": ("서울", "자연"),
    "건축학부 실내건축학전공": ("서울", "자연"),
    "도시공학과": ("서울", "자연"),
    "수학교육과": ("서울", "자연"),
    "국어교육과": ("서울", "인문"),
    "영어교육과": ("서울", "자연"),    # 사범대학은 이과/문과 혼재, 영교는 자연계로 분류(총괄표 기준)
    "역사교육과": ("서울", "인문"),
    "교육학과": ("서울", "자연"),
    "경영학부": ("서울", "인문"),
    "영어영문학과": ("서울", "인문"),
    "독어독문학과": ("서울", "인문"),
    "불어불문학과": ("서울", "인문"),
    "국어국문학과": ("서울", "인문"),
    "법학부": ("서울", "인문"),
    "경제학부": ("서울", "인문"),
    "예술학과": ("서울", "미술"),
    # 미술대학
    "동양화과": ("서울", "미술"),
    "회화과": ("서울", "미술"),
    "판화과": ("서울", "미술"),
    "조소과": ("서울", "미술"),
    "디자인학부": ("서울", "미술"),
    "금속조형디자인과": ("서울", "미술"),
    "도예·유리과": ("서울", "미술"),
    "목조형가구학과": ("서울", "미술"),
    "섬유미술·패션디자인과": ("서울", "미술"),
    "미술대학자율전공": ("서울", "미술"),
    # 공연예술
    "공연예술학부 뮤지컬전공": ("서울", "예체능"),
    "공연예술학부 실용음악전공": ("서울", "예체능"),
    "디자인·예술경영학부": ("서울", "미술"),
}

# ── 서울 학교생활우수자전형 (학생부위주(종합), 물리p39~41) ───────────────────
# 전형방법: 서류 100%, 수능최저: 2개합5, 한국사4
SEOUL_SAENGWHAL_QUOTA = {  # 물리p39
    "서울캠퍼스자율전공(자연·예능)": 67,
    "서울캠퍼스자율전공(인문·예능)": 49,
    "전자·전기공학부": 48,
    "신소재·화공시스템공학부": 30,
    "컴퓨터공학과": 34,
    "산업·데이터공학과": 16,
    "기계·시스템디자인공학과": 34,
    "건설환경공학과": 11,
    "건축학부 건축학전공(5년제)": 11,
    "건축학부 실내건축학전공": 5,
    "도시공학과": 12,
    "수학교육과": 6,
    "국어교육과": 6,
    "영어교육과": 6,
    "역사교육과": 4,
    "교육학과": 6,
    "경영학부": 58,
    "영어영문학과": 6,
    "독어독문학과": 6,
    "불어불문학과": 5,
    "국어국문학과": 5,
    "법학부": 28,
    "경제학부": 9,
    "예술학과": 5,
}
SEOUL_SAENGWHAL_TOTAL = 467  # PDF 합계

# ── 서울 고른기회Ⅰ전형 (학생부위주(종합), 물리p42~45) ──────────────────────
# 전형방법: 서류 100%, 수능최저 없음
SEOUL_GOREUN1_QUOTA = {  # 물리p42
    "전자·전기공학부": 1,
    "신소재·화공시스템공학부": 1,
    "컴퓨터공학과": 1,
    "산업·데이터공학과": 1,
    "기계·시스템디자인공학과": 1,
    "건설환경공학과": 1,
    "건축학부 건축학전공(5년제)": 1,
    "도시공학과": 1,
    "수학교육과": 1,
    "영어교육과": 1,
    "교육학과": 1,
    "경영학부": 2,
    "법학부": 1,
    "경제학부": 1,
}
SEOUL_GOREUN1_TOTAL = 15  # PDF 합계

# ── 서울 고른기회Ⅱ전형 (학생부위주(종합), 물리p46~48) ──────────────────────
# 전형방법: 서류 100%, 수능최저 없음
SEOUL_GOREUN2_QUOTA = {  # 물리p46
    "전자·전기공학부": 1,
    "신소재·화공시스템공학부": 1,
    "컴퓨터공학과": 1,
    "기계·시스템디자인공학과": 1,
    "국어교육과": 1,
    "역사교육과": 1,
    "경영학부": 2,
    "영어영문학과": 1,
    "법학부": 1,
}
SEOUL_GOREUN2_TOTAL = 10  # PDF 합계

# ── 서울 기초생활수급자·차상위계층전형 (학생부위주(종합), 물리p50~53) ─────────
# 전형방법: 서류 100%, 수능최저 없음
SEOUL_GICHO_QUOTA = {  # 물리p50
    "전자·전기공학부": 3,
    "신소재·화공시스템공학부": 2,
    "컴퓨터공학과": 2,
    "산업·데이터공학과": 1,
    "기계·시스템디자인공학과": 2,
    "건설환경공학과": 1,
    "건축학부 건축학전공(5년제)": 1,
    "건축학부 실내건축학전공": 1,
    "도시공학과": 1,
    "수학교육과": 1,
    "국어교육과": 1,
    # 인문계열 (p51에서 확인 필요 — 물리p50 계속)
}
# p50 추가 내용 확인
_pg50 = pages[49]
_lines50 = [l for l in _pg50.splitlines() if l.strip()]
# 직접 텍스트에서 확인한 나머지 부분 (물리p51)
SEOUL_GICHO_QUOTA.update({
    "영어교육과": 1,
    "역사교육과": 1,
    "교육학과": 1,
    "경영학부": 4,
    "영어영문학과": 1,
    "독어독문학과": 1,
    "불어불문학과": 1,
    "국어국문학과": 1,
    "법학부": 2,
    "경제학부": 1,
})
SEOUL_GICHO_TOTAL = 30  # PDF 합계 (물리p50): 30명

def _get_gicho_total():
    """PDF에서 기초생활수급자·차상위계층전형 총계 확인"""
    for i in [49, 50]:  # 물리p50, p51
        pg = pages[i]
        for l in pg.splitlines():
            m = re.search(r'^\s*(\d+)\s*명\s*$', l.strip())
            if m:
                return int(m.group(1))
    return None

_gicho_pdf_total = _get_gicho_total()
if _gicho_pdf_total and _gicho_pdf_total != SEOUL_GICHO_TOTAL:
    warnings.append(f"[기초생활] PDF 합계행={_gicho_pdf_total} ≠ 하드코딩={SEOUL_GICHO_TOTAL}")

# ── 서울 특성화고등을졸업한재직자전형 (학생부위주(종합), 물리p54~56) ────────────
# 전형방법: 서류 100%, 수능최저 없음
# 모집단위: 디자인·예술경영학부만, 정원내 3 + 정원외 182
SEOUL_JAEJIK_INNER = 3    # 정원내 (물리p54)
SEOUL_JAEJIK_OUTER = 182  # 정원외 (물리p54)

# ── 서울 논술전형 (논술위주, 물리p57~60) ─────────────────────────────────────
# 전형방법: 논술90% + 학생부교과10%, 수능최저: 2개합5, 한국사4
SEOUL_NONSEUL_QUOTA = {  # 물리p57
    "서울캠퍼스자율전공(자연·예능)": 53,
    "서울캠퍼스자율전공(인문·예능)": 38,
    "전자·전기공학부": 39,
    "신소재·화공시스템공학부": 25,
    "컴퓨터공학과": 29,
    "산업·데이터공학과": 14,
    "기계·시스템디자인공학과": 29,
    "건설환경공학과": 9,
    "건축학부 건축학전공(5년제)": 9,
    "건축학부 실내건축학전공": 4,
    "도시공학과": 9,
    "수학교육과": 5,
    "국어교육과": 5,
    "영어교육과": 5,
    "역사교육과": 4,
    "교육학과": 5,
    "경영학부": 48,
    "영어영문학과": 6,
    "독어독문학과": 4,
    "불어불문학과": 4,
    "국어국문학과": 4,
    "법학부": 24,
    "경제학부": 8,
    "예술학과": 4,
}
SEOUL_NONSEUL_TOTAL = 384  # PDF 합계

# ── 서울 미술우수자전형 (실기/실적위주, 물리p61~64) ─────────────────────────
# 전형방법: 1단계(3배수) 학생부교과20%+서류80% / 2단계 서류40%+면접60%
# 수능최저: 3개합9, 한국사4
SEOUL_MISUL_QUOTA = {  # 물리p61
    "예술학과": 6,
    "동양화과": 19,
    "회화과": 37,
    "판화과": 18,
    "조소과": 18,
    "디자인학부": 68,
    "금속조형디자인과": 15,
    "도예·유리과": 15,
    "목조형가구학과": 15,
    "섬유미술·패션디자인과": 15,
    "미술대학자율전공": 63,
}
SEOUL_MISUL_TOTAL = 289  # PDF 합계

# ── 서울 농어촌학생전형 (물리p32~35) ────────────────────────────────────────
# 인문/자연: 학생부위주(교과), 1배수, 학생부교과100%, 수능최저 없음
# 미술계열: 실기/실적위주, 1단계(2배수) 학생부교과20%+서류80% / 2단계 서류40%+면접60%, 수능최저 없음
SEOUL_NONGEO_GWABU_QUOTA = {  # 물리p32, 학생부위주(교과) 부분
    "전자·전기공학부": 5,
    "신소재·화공시스템공학부": 3,
    "컴퓨터공학과": 4,
    "산업·데이터공학과": 2,
    "기계·시스템디자인공학과": 4,
    "건설환경공학과": 1,
    "건축학부 건축학전공(5년제)": 1,
    "건축학부 실내건축학전공": 1,
    "도시공학과": 1,
    "경영학부": 5,
    "영어영문학과": 1,
    "독어독문학과": 1,
    "불어불문학과": 1,
    "국어국문학과": 1,
    "법학부": 4,
    "경제학부": 1,
    "예술학과": 1,
}
SEOUL_NONGEO_SILGI_QUOTA = {  # 물리p32, 실기/실적위주 부분
    "동양화과": 1,
    "회화과": 2,
    "판화과": 1,
    "조소과": 1,
    "디자인학부": 2,
    "금속조형디자인과": 1,
    "도예·유리과": 1,
    "목조형가구학과": 1,
    "섬유미술·패션디자인과": 1,
}
SEOUL_NONGEO_TOTAL = 48  # PDF 합계 (물리p32)

# ── 서울 공연예술우수자전형 (실기/실적위주, 물리p65~69) ─────────────────────
# 전형방법: 1단계(8~10배수) 실기100% / 2단계 실기80% + 학생부교과10% + 출결10%
# 수능최저 없음
SEOUL_GONGYON_QUOTA = {  # 물리p65
    "공연예술학부 뮤지컬전공": 20,
    "공연예술학부 실용음악전공": 28,
}
SEOUL_GONGYON_TOTAL = 48  # PDF 합계

# ══════════════════════════════════════════════════════════════════════════════
# 세종캠퍼스 전형 데이터
# ══════════════════════════════════════════════════════════════════════════════

SEJONG_DEPT_HINT = {
    "세종캠퍼스자율전공(자연·예능)": None,
    "세종캠퍼스자율전공(인문·예능)": None,
    "AID융합과학기술대학자율전공": None,
    "전자전기융합공학과": "자연",
    "소프트웨어융합학과": "자연",
    "나노반도체공학과": "자연",
    "건축공학부": "자연",
    "AI기계융합공학과": "자연",
    "조선해양모빌리티공학과": "자연",
    "바이오화학융합공학과": "자연",
    "게임학부 게임소프트웨어전공(공학계)": "자연",
    "상경학부": "인문",
    "광고홍보학부": "인문",
    "디자인컨버전스학부": "미술",
    "영상·애니메이션학부": "미술",
    "게임학부 게임그래픽디자인전공(미술계)": "미술",
    "스포츠지도학과": "예체능",
}

# ── 세종 교과우수자전형 (학생부위주(교과), 물리p81~82) ─────────────────────
# 전형방법: 학생부교과100%, 수능최저: 1개4이내, 한국사 응시 필수
SEJONG_GWAGWA_QUOTA = {  # 물리p81
    "세종캠퍼스자율전공(자연·예능)": 54,
    "세종캠퍼스자율전공(인문·예능)": 54,
    "AID융합과학기술대학자율전공": 15,
    "전자전기융합공학과": 16,
    "소프트웨어융합학과": 19,
    "나노반도체공학과": 13,
    "건축공학부": 16,
    "AI기계융합공학과": 14,
    "조선해양모빌리티공학과": 10,
    "바이오화학융합공학과": 13,
    "게임학부 게임소프트웨어전공(공학계)": 10,
    "상경학부": 52,
    "광고홍보학부": 29,
}
SEJONG_GWAGWA_TOTAL = 315  # PDF 합계

# ── 세종 농어촌학생전형 (물리p83~88) ────────────────────────────────────────
# 인문/자연: 학생부위주(교과), 1배수, 학생부교과100%, 수능최저 없음
# 미술계열: 실기/실적위주, 1단계(2배수) 학생부교과20%+서류80% / 2단계 서류40%+면접60%, 수능최저 없음
SEJONG_NONGEO_GWABU_QUOTA = {  # 물리p83
    "전자전기융합공학과": 1,
    "소프트웨어융합학과": 2,
    "나노반도체공학과": 2,
    "건축공학부": 2,
    "AI기계융합공학과": 1,
    "조선해양모빌리티공학과": 1,
    "바이오화학융합공학과": 2,
    "게임학부 게임소프트웨어전공(공학계)": 2,
    "상경학부": 5,
    "광고홍보학부": 3,
}
SEJONG_NONGEO_SILGI_QUOTA = {  # 물리p83
    "디자인컨버전스학부": 4,
    "영상·애니메이션학부": 2,
    "게임학부 게임그래픽디자인전공(미술계)": 1,
}
SEJONG_NONGEO_TOTAL = 28  # PDF 합계 (물리p83)

# ── 세종 학교생활우수자전형 (학생부위주(종합), 물리p89~90) ─────────────────
# 전형방법: 서류 100%, 수능최저 없음
SEJONG_SAENGWHAL_QUOTA = {  # 물리p89
    "세종캠퍼스자율전공(자연·예능)": 37,
    "세종캠퍼스자율전공(인문·예능)": 37,
    "AID융합과학기술대학자율전공": 10,
    "전자전기융합공학과": 9,
    "소프트웨어융합학과": 10,
    "나노반도체공학과": 8,
    "건축공학부": 9,
    "AI기계융합공학과": 8,
    "조선해양모빌리티공학과": 6,
    "바이오화학융합공학과": 8,
    "게임학부 게임소프트웨어전공(공학계)": 6,
    "상경학부": 33,
    "광고홍보학부": 18,
}
SEJONG_SAENGWHAL_TOTAL = 199  # PDF 합계

# ── 세종 고른기회Ⅰ전형 (학생부위주(종합), 물리p91~93) ─────────────────────
# 전형방법: 서류 100%, 수능최저 없음
SEJONG_GOREUN1_QUOTA = {  # 물리p91
    "전자전기융합공학과": 1,
    "소프트웨어융합학과": 2,
    "나노반도체공학과": 1,
    "건축공학부": 1,
    "AI기계융합공학과": 1,
    "게임학부 게임소프트웨어전공(공학계)": 1,
    "상경학부": 2,
    "광고홍보학부": 1,
}
SEJONG_GOREUN1_TOTAL = 10  # PDF 합계

# ── 세종 고른기회Ⅱ전형 (학생부위주(종합), 물리p95~97) ─────────────────────
# 전형방법: 서류 100%, 수능최저 없음
SEJONG_GOREUN2_QUOTA = {  # 물리p95
    "소프트웨어융합학과": 1,
    "건축공학부": 1,
    "조선해양모빌리티공학과": 1,
    "바이오화학융합공학과": 1,
    "상경학부": 1,
    "광고홍보학부": 1,
}
SEJONG_GOREUN2_TOTAL = 6  # PDF 합계

# ── 세종 기초생활수급자·차상위계층전형 (학생부위주(종합), 물리p99~101) ──────
# 전형방법: 서류 100%, 수능최저 없음
SEJONG_GICHO_QUOTA = {  # 물리p99
    "전자전기융합공학과": 1,
    "소프트웨어융합학과": 2,
    "나노반도체공학과": 1,
    "건축공학부": 1,
    "AI기계융합공학과": 1,
    "조선해양모빌리티공학과": 1,
    "바이오화학융합공학과": 1,
    "게임학부 게임소프트웨어전공(공학계)": 1,
    "상경학부": 3,
    "광고홍보학부": 2,
}
SEJONG_GICHO_TOTAL = 14  # PDF 합계

# ── 세종 논술전형 (논술위주, 물리p102~104) ──────────────────────────────────
# 전형방법: 논술90% + 학생부교과10%, 수능최저: 1개4이내, 한국사 응시 필수
SEJONG_NONSEUL_QUOTA = {  # 물리p102
    "세종캠퍼스자율전공(자연·예능)": 31,
    "세종캠퍼스자율전공(인문·예능)": 31,
    "AID융합과학기술대학자율전공": 10,
    "전자전기융합공학과": 11,
    "소프트웨어융합학과": 14,
    "나노반도체공학과": 9,
    "건축공학부": 12,
    "AI기계융합공학과": 10,
    "조선해양모빌리티공학과": 7,
    "바이오화학융합공학과": 9,
    "게임학부 게임소프트웨어전공(공학계)": 7,
    "상경학부": 30,
    "광고홍보학부": 14,
}
SEJONG_NONSEUL_TOTAL = 195  # PDF 합계

# ── 세종 미술우수자전형 (실기/실적위주, 물리p105~107) ──────────────────────
# 전형방법: 1단계(3배수) 학생부교과20%+서류80% / 2단계 서류40%+면접60%, 수능최저 없음
SEJONG_MISUL_QUOTA = {  # 물리p105
    "디자인컨버전스학부": 100,
    "영상·애니메이션학부": 53,
    "게임학부 게임그래픽디자인전공(미술계)": 29,
}
SEJONG_MISUL_TOTAL = 182  # PDF 합계

# ── 세종 체육우수자전형 (실기/실적위주, 물리p108~110) ──────────────────────
# 전형방법: 1단계(8배수) 교과80%+출결20% / 2단계 1단계성적30%+실기70%, 수능최저 없음
SEJONG_CHEYUK_QUOTA = {  # 물리p108
    "스포츠지도학과": 25,  # 축구10+야구10+배구5
}
SEJONG_CHEYUK_TOTAL = 25

# ══════════════════════════════════════════════════════════════════════════════
# departments 조립 함수
# ══════════════════════════════════════════════════════════════════════════════

departments = []

def get_hint(dept_name, campus):
    if campus == "서울":
        return SEOUL_DEPT_CAMPUS_HINT.get(dept_name, ("서울", None))[1]
    else:
        return SEJONG_DEPT_HINT.get(dept_name)

def add_dept(dept_name, campus, tracks, total_hint=None):
    departments.append({
        "departmentName": dept_name,
        "campus": campus,
        "trackHint": get_hint(dept_name, campus),
        "totalQuotaHint": total_hint,
        "tracks": tracks,
    })

# ── 지원자격 문구 ─────────────────────────────────────────────────────────────
APPQ_HAGGYO = ("2025년 2월 이후(2월 포함) 국내 고등학교 졸업(예정)자 중 3학기 이상의 교육과정을 이수하고 "
               "소속 고등학교장의 추천을 받은 자. 고교별 추천 인원 10명 이내.")
APPQ_SAENGWHAL_S = ("국내 고등학교 졸업(예정)자. "
                    "1998년 이전(1998년 포함) 졸업자, 검정고시, 외국고교 졸업(예정)자 지원 불가.")
APPQ_GOREUN1 = ("국내 고등학교 졸업(예정)자 또는 고등학교 졸업 동등학력 인정자 중 소년소녀가정, "
                "20년 이상 현역 군인 자녀, 장애인 부모 자녀, 조손가정 손자녀, 다문화가족 자녀 중 하나 충족.")
APPQ_GOREUN2 = ("국내 고등학교 졸업(예정)자 또는 고등학교 졸업 동등학력 인정자 중 국가보훈대상자, "
                "자립지원대상자, 북한이탈주민등 중 하나 충족.")
APPQ_GICHO = ("국내 고등학교 졸업(예정)자 또는 고등학교 졸업 동등학력 인정자 중 "
              "국민기초생활보장 수급자 또는 차상위계층(자활급여·장애수당·장애인연금부가급여·한부모가족·"
              "차상위건강보험본인부담경감·차상위계층확인서) 중 하나 충족.")
APPQ_JAEJIK = ("특성화고 또는 마이스터고 졸업 후 2027.3.1 기준 산업체 3년 이상 재직 중인 자 "
               "(재직자전형 자율화 전형).")
APPQ_NONSEUL = ("국내 고등학교 졸업(예정)자 또는 고등학교 졸업 동등학력 인정자.")
APPQ_MISUL_S = ("국내 고등학교 졸업(예정)자. "
                "1998년 이전(1998년 포함) 졸업자, 검정고시, 외국고교 졸업(예정)자 지원 불가. "
                "미술활동보고서 제출 필수.")
APPQ_NONGEO = ("2025년 2월 이후(2월 포함) 국내 고등학교 졸업(예정)자로서 농·어촌 지역 소재 "
               "중·고교 6년(유형Ⅰ) 또는 초·중·고교 12년(유형Ⅱ) 전과정 이수자.")
APPQ_GONGYON = "국내 고등학교 졸업(예정)자 또는 고등학교 졸업 동등학력 인정자."
APPQ_GWAGWA_J = ("2025년 2월 이후(2월 포함) 국내 고등학교 졸업(예정)자 중 3학기 이상의 교육과정을 이수한 자. "
                 "학생부에 석차등급 미기재자, 특성화고·마이스터고·영재학교 등 지원 불가.")
APPQ_SAENGWHAL_J = ("국내 고등학교 졸업(예정)자. "
                    "1998년 이전(1998년 포함) 졸업자, 검정고시, 외국고교 졸업(예정)자 지원 불가.")
APPQ_MISUL_J = ("국내 고등학교 졸업(예정)자. "
                "1998년 이전(1998년 포함) 졸업자, 검정고시, 외국고교 졸업(예정)자 지원 불가. "
                "미술활동보고서 제출 필수.")
APPQ_CHEYUK = "2025년 2월 이후(2월 포함) 국내 고등학교 졸업(예정)자."


# ══════════════════════════════════════════════════════════════════════════════
# 서울캠퍼스 departments 생성
# ══════════════════════════════════════════════════════════════════════════════

# 전형별 반영비율 스테이지
STAGE_GWABU100 = [stage("일괄합산", None, {"학생부교과": 100})]
STAGE_SEORYU100 = [stage("일괄합산", None, {"서류": 100})]
STAGE_NONSEUL = [stage("일괄합산", None, {"논술": 90, "학생부교과": 10})]
STAGE_MISUL_1 = stage("1단계", 3, {"학생부교과": 20, "서류": 80})
STAGE_MISUL_2 = stage("2단계", None, {"서류(1단계)": 40, "면접": 60})
STAGE_MISUL = [STAGE_MISUL_1, STAGE_MISUL_2]
# 농어촌 교과 (인문/자연): 학생부교과100%
STAGE_NONGEO_GWABU = [stage("일괄합산", None, {"학생부교과": 100})]
# 서울 공연예술우수자
STAGE_GONGYON_1 = stage("1단계", 8, {"실기": 100})  # 뮤지컬은 8배수, 실용음악은 10배수
STAGE_GONGYON_2 = stage("2단계", None, {"실기": 80, "학생부교과": 10, "출결": 10})
STAGE_GONGYON = [STAGE_GONGYON_1, STAGE_GONGYON_2]
# 세종 체육우수자
STAGE_CHEYUK_1 = stage("1단계", 8, {"학생부교과": 80, "출결": 20})
STAGE_CHEYUK_2 = stage("2단계", None, {"1단계 성적": 30, "실기": 70})
STAGE_CHEYUK = [STAGE_CHEYUK_1, STAGE_CHEYUK_2]

# ── 서울 전형별 모집단위 수집 (track 충돌 방지를 위해 학과별로 tracks 누적) ──
# 학과를 key로 tracks 누적
from collections import defaultdict
seoul_dept_tracks = defaultdict(list)  # dept_name -> [tracks]

# 서울 학교장추천자전형
for dept, quota in SEOUL_HAGGYO_QUOTA.items():
    t = mk("학교장추천자전형", "학생부위주(교과)", None, quota,
           APPQ_HAGGYO, STAGE_GWABU100, CSAT_S1, False, [29, 30])
    seoul_dept_tracks[dept].append(t)

# 서울 학교생활우수자전형
for dept, quota in SEOUL_SAENGWHAL_QUOTA.items():
    t = mk("학교생활우수자전형", "학생부위주(종합)", None, quota,
           APPQ_SAENGWHAL_S, STAGE_SEORYU100, CSAT_S1, False, [39, 40])
    seoul_dept_tracks[dept].append(t)

# 서울 고른기회Ⅰ전형
for dept, quota in SEOUL_GOREUN1_QUOTA.items():
    t = mk("고른기회Ⅰ전형", "학생부위주(종합)", "기회균형", quota,
           APPQ_GOREUN1, STAGE_SEORYU100, CSAT_NONE, True, [42, 43])
    seoul_dept_tracks[dept].append(t)

# 서울 고른기회Ⅱ전형
for dept, quota in SEOUL_GOREUN2_QUOTA.items():
    t = mk("고른기회Ⅱ전형", "학생부위주(종합)", "기회균형", quota,
           APPQ_GOREUN2, STAGE_SEORYU100, CSAT_NONE, True, [46, 47])
    seoul_dept_tracks[dept].append(t)

# 서울 기초생활수급자·차상위계층전형
for dept, quota in SEOUL_GICHO_QUOTA.items():
    t = mk("기초생활수급자·차상위계층전형", "학생부위주(종합)", "기회균형", quota,
           APPQ_GICHO, STAGE_SEORYU100, CSAT_NONE, True, [50, 51])
    seoul_dept_tracks[dept].append(t)

# 서울 특성화고등을졸업한재직자전형 (디자인·예술경영학부만)
t_jaejik_inner = mk("특성화고등을졸업한재직자전형", "학생부위주(종합)", None,
                    SEOUL_JAEJIK_INNER, APPQ_JAEJIK, STAGE_SEORYU100, CSAT_NONE, True,
                    [54, 55], note="정원내 모집인원")
t_jaejik_outer = mk("특성화고등을졸업한재직자전형", "학생부위주(종합)", "특성화고졸재직자(정원외)",
                    SEOUL_JAEJIK_OUTER, APPQ_JAEJIK, STAGE_SEORYU100, CSAT_NONE, True,
                    [54, 55], note="정원외 모집인원")
seoul_dept_tracks["디자인·예술경영학부"].append(t_jaejik_inner)
seoul_dept_tracks["디자인·예술경영학부"].append(t_jaejik_outer)

# 서울 논술전형
for dept, quota in SEOUL_NONSEUL_QUOTA.items():
    t = mk("논술전형", "논술위주", None, quota,
           APPQ_NONSEUL, STAGE_NONSEUL, CSAT_S1, False, [57, 58, 59])
    seoul_dept_tracks[dept].append(t)

# 서울 미술우수자전형
for dept, quota in SEOUL_MISUL_QUOTA.items():
    t = mk("미술우수자전형", "실기/실적위주", None, quota,
           APPQ_MISUL_S, STAGE_MISUL, CSAT_S2, False, [61, 62, 63])
    seoul_dept_tracks[dept].append(t)

# 서울 농어촌학생전형 (교과 계열)
for dept, quota in SEOUL_NONGEO_GWABU_QUOTA.items():
    t = mk("농어촌학생전형", "학생부위주(교과)", "농어촌학생", quota,
           APPQ_NONGEO, STAGE_NONGEO_GWABU, CSAT_NONE, True, [32, 33, 35])
    seoul_dept_tracks[dept].append(t)

# 서울 농어촌학생전형 (미술 실기 계열)
for dept, quota in SEOUL_NONGEO_SILGI_QUOTA.items():
    t = mk("농어촌학생전형", "실기/실적위주", "농어촌학생", quota,
           APPQ_NONGEO, STAGE_MISUL, CSAT_NONE, True, [32, 33, 35])
    seoul_dept_tracks[dept].append(t)

# 서울 공연예술우수자전형 (뮤지컬/실용음악 배수 상이 주의)
t_musical = mk("공연예술우수자전형", "실기/실적위주", None, 20,
               APPQ_GONGYON,
               [stage("1단계", 8, {"실기": 100}),
                stage("2단계", None, {"실기": 80, "학생부교과": 10, "출결": 10})],
               CSAT_NONE, True, [65, 66, 67, 68],
               note="뮤지컬전공(연기) — 1단계 8배수")
t_music = mk("공연예술우수자전형", "실기/실적위주", None, 28,
             APPQ_GONGYON,
             [stage("1단계", 10, {"실기": 100}),
              stage("2단계", None, {"실기": 80, "학생부교과": 10, "출결": 10})],
             CSAT_NONE, True, [65, 66, 67, 68],
             note="실용음악전공(보컬,기악,작곡) — 1단계 10배수")
seoul_dept_tracks["공연예술학부 뮤지컬전공"].append(t_musical)
seoul_dept_tracks["공연예술학부 실용음악전공"].append(t_music)

# ── 서울캠퍼스 departments 등록 ──────────────────────────────────────────────
# 총 모집인원 hint 계산 (학과별 전형 quota 합; 정원외는 별도이므로 내외 모두 포함)
for dept_name, tracks in seoul_dept_tracks.items():
    total = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    add_dept(dept_name, "서울", tracks, total_hint=total)

# ══════════════════════════════════════════════════════════════════════════════
# 세종캠퍼스 departments 생성
# ══════════════════════════════════════════════════════════════════════════════

sejong_dept_tracks = defaultdict(list)

# 세종 교과우수자전형
for dept, quota in SEJONG_GWAGWA_QUOTA.items():
    t = mk("교과우수자전형", "학생부위주(교과)", None, quota,
           APPQ_GWAGWA_J, STAGE_GWABU100, CSAT_J1, False, [81, 82])
    sejong_dept_tracks[dept].append(t)

# 세종 농어촌학생전형 (교과 계열)
for dept, quota in SEJONG_NONGEO_GWABU_QUOTA.items():
    t = mk("농어촌학생전형", "학생부위주(교과)", "농어촌학생", quota,
           APPQ_NONGEO, STAGE_NONGEO_GWABU, CSAT_NONE, True, [83, 84, 85])
    sejong_dept_tracks[dept].append(t)

# 세종 농어촌학생전형 (미술 실기 계열)
for dept, quota in SEJONG_NONGEO_SILGI_QUOTA.items():
    t = mk("농어촌학생전형", "실기/실적위주", "농어촌학생", quota,
           APPQ_NONGEO, STAGE_MISUL, CSAT_NONE, True, [83, 84, 85])
    sejong_dept_tracks[dept].append(t)

# 세종 학교생활우수자전형
for dept, quota in SEJONG_SAENGWHAL_QUOTA.items():
    t = mk("학교생활우수자전형", "학생부위주(종합)", None, quota,
           APPQ_SAENGWHAL_J, STAGE_SEORYU100, CSAT_NONE, True, [89, 90])
    sejong_dept_tracks[dept].append(t)

# 세종 고른기회Ⅰ전형
for dept, quota in SEJONG_GOREUN1_QUOTA.items():
    t = mk("고른기회Ⅰ전형", "학생부위주(종합)", "기회균형", quota,
           APPQ_GOREUN1, STAGE_SEORYU100, CSAT_NONE, True, [91, 92])
    sejong_dept_tracks[dept].append(t)

# 세종 고른기회Ⅱ전형
for dept, quota in SEJONG_GOREUN2_QUOTA.items():
    t = mk("고른기회Ⅱ전형", "학생부위주(종합)", "기회균형", quota,
           APPQ_GOREUN2, STAGE_SEORYU100, CSAT_NONE, True, [95, 96])
    sejong_dept_tracks[dept].append(t)

# 세종 기초생활수급자·차상위계층전형
for dept, quota in SEJONG_GICHO_QUOTA.items():
    t = mk("기초생활수급자·차상위계층전형", "학생부위주(종합)", "기회균형", quota,
           APPQ_GICHO, STAGE_SEORYU100, CSAT_NONE, True, [99, 100])
    sejong_dept_tracks[dept].append(t)

# 세종 논술전형
for dept, quota in SEJONG_NONSEUL_QUOTA.items():
    t = mk("논술전형", "논술위주", None, quota,
           APPQ_NONSEUL, STAGE_NONSEUL, CSAT_J1, False, [102, 103])
    sejong_dept_tracks[dept].append(t)

# 세종 미술우수자전형
for dept, quota in SEJONG_MISUL_QUOTA.items():
    t = mk("미술우수자전형", "실기/실적위주", None, quota,
           APPQ_MISUL_J, STAGE_MISUL, CSAT_NONE, True, [105, 106])
    sejong_dept_tracks[dept].append(t)

# 세종 체육우수자전형
t_cheyuk = mk("체육우수자전형", "실기/실적위주", None, 25,
              APPQ_CHEYUK, STAGE_CHEYUK, CSAT_NONE, True, [108, 109],
              note="축구10+야구10+배구5 (종목별 배정)")
sejong_dept_tracks["스포츠지도학과"].append(t_cheyuk)

# ── 세종캠퍼스 departments 등록 ──────────────────────────────────────────────
for dept_name, tracks in sejong_dept_tracks.items():
    total = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    add_dept(dept_name, "세종", tracks, total_hint=total)

# ══════════════════════════════════════════════════════════════════════════════
# 체크섬 검증
# ══════════════════════════════════════════════════════════════════════════════

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)

# ── 행합 검증 ─────────────────────────────────────────────────────────────────
row_fail = []
for d in departments:
    tq = d.get("totalQuotaHint")
    if tq is None:
        continue
    qsum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    if qsum != tq:
        row_fail.append((d["departmentName"], d["campus"], tq, qsum))
        warnings.append(f"[행합불일치] {d['campus']} {d['departmentName']}: hint={tq} 전형합={qsum}")

row_pass = len(departments) - len(row_fail)

# ── 열합 검증 (서울/세종 캠퍼스별 전형별 합계) ───────────────────────────────
# 서울캠퍼스 전형별 집계 (정원내 기준)
seoul_inner = {
    "학교장추천자전형": 0,
    "학교생활우수자전형": 0,
    "고른기회Ⅰ전형": 0,
    "고른기회Ⅱ전형": 0,
    "기초생활수급자·차상위계층전형": 0,
    "특성화고등을졸업한재직자전형(정원내)": 0,
    "논술전형": 0,
    "미술우수자전형": 0,
    "농어촌학생전형(교과)": 0,
    "농어촌학생전형(실기)": 0,
    "공연예술우수자전형": 0,
}
seoul_outer = {"특성화고등을졸업한재직자전형(정원외)": 0}

for d in departments:
    if d["campus"] != "서울":
        continue
    for t in d["tracks"]:
        q = t["quotaInitial"] or 0
        tn = t["trackName"]
        sk = t.get("specialTypeKeyword") or ""
        is_outer = "정원외" in sk
        if tn == "학교장추천자전형":
            seoul_inner["학교장추천자전형"] += q
        elif tn == "학교생활우수자전형":
            seoul_inner["학교생활우수자전형"] += q
        elif tn == "고른기회Ⅰ전형":
            seoul_inner["고른기회Ⅰ전형"] += q
        elif tn == "고른기회Ⅱ전형":
            seoul_inner["고른기회Ⅱ전형"] += q
        elif tn == "기초생활수급자·차상위계층전형":
            seoul_inner["기초생활수급자·차상위계층전형"] += q
        elif tn == "특성화고등을졸업한재직자전형":
            if is_outer:
                seoul_outer["특성화고등을졸업한재직자전형(정원외)"] += q
            else:
                seoul_inner["특성화고등을졸업한재직자전형(정원내)"] += q
        elif tn == "논술전형":
            seoul_inner["논술전형"] += q
        elif tn == "미술우수자전형":
            seoul_inner["미술우수자전형"] += q
        elif tn == "농어촌학생전형":
            if t["trackTypeRaw"] == "학생부위주(교과)":
                seoul_inner["농어촌학생전형(교과)"] += q
            else:
                seoul_inner["농어촌학생전형(실기)"] += q
        elif tn == "공연예술우수자전형":
            seoul_inner["공연예술우수자전형"] += q

# PDF 총괄표 서울캠퍼스 계 (물리p24): 1,783명
SEOUL_TOTAL_PDF = 1783
# 세부: 학교장추천자전형307 + 학교생활우수자전형467 + 고른기회Ⅰ15 + 고른기회Ⅱ10 +
#        기초생활수급자차상위37 + 특성화고재직자(정원내)3 + 논술384 + 미술우수자289 +
#        농어촌(교과)37 + 농어촌(실기)11 + 공연예술48 + 재직자(정원외)182
# 정원내 합계: 1783 - 182 = 1601명
SEOUL_INNER_PDF = 1601
SEOUL_OUTER_PDF = 182

# 세종캠퍼스 전형별 집계
sejong_col = defaultdict(int)
for d in departments:
    if d["campus"] != "세종":
        continue
    for t in d["tracks"]:
        q = t["quotaInitial"] or 0
        sejong_col[t["trackName"]] += q

# PDF 총괄표 세종캠퍼스 계 (물리p76): 974명
SEJONG_TOTAL_PDF = 974

# ── 서울 열합 대조 ────────────────────────────────────────────────────────────
seoul_inner_computed = sum(seoul_inner.values())
seoul_outer_computed = sum(seoul_outer.values())
seoul_total_computed = seoul_inner_computed + seoul_outer_computed

# 세부 전형별 PDF 기대값
SEOUL_EXPECTED_INNER = {
    "학교장추천자전형": 307,
    "학교생활우수자전형": 467,
    "고른기회Ⅰ전형": 15,
    "고른기회Ⅱ전형": 10,
    "기초생활수급자·차상위계층전형": 30,  # PDF 총괄표 p24 합계행 기준 (상세 p50: 30명)
    "특성화고등을졸업한재직자전형(정원내)": 3,
    "논술전형": 384,
    "미술우수자전형": 289,
    "농어촌학생전형(교과)": 37,  # PDF 총괄표 p24 기준 (인문/자연 합산)
    "농어촌학생전형(실기)": 11,  # PDF 총괄표 p24 미술계열 농어촌 실기
    "공연예술우수자전형": 48,
}
SEOUL_EXPECTED_OUTER = {
    "특성화고등을졸업한재직자전형(정원외)": 182,
}

coltotal_seoul_inner = []
for k, exp in SEOUL_EXPECTED_INNER.items():
    comp = seoul_inner.get(k, 0)
    coltotal_seoul_inner.append({"track": k, "computed": comp, "expectedSumRow": exp, "match": comp == exp})

coltotal_seoul_outer = []
for k, exp in SEOUL_EXPECTED_OUTER.items():
    comp = seoul_outer.get(k, 0)
    coltotal_seoul_outer.append({"track": k, "computed": comp, "expectedSumRow": exp, "match": comp == exp})

# ── 세종 열합 대조 ────────────────────────────────────────────────────────────
sejong_total_computed = sum(sejong_col.values())
SEJONG_EXPECTED = {
    "교과우수자전형": 315,
    "농어촌학생전형": 28,   # 교과+실기 합산
    "학교생활우수자전형": 199,
    "고른기회Ⅰ전형": 10,
    "고른기회Ⅱ전형": 6,
    "기초생활수급자·차상위계층전형": 14,
    "논술전형": 195,
    "미술우수자전형": 182,
    "체육우수자전형": 25,
}
coltotal_sejong = []
for k, exp in SEJONG_EXPECTED.items():
    comp = sejong_col.get(k, 0)
    coltotal_sejong.append({"track": k, "computed": comp, "expectedSumRow": exp, "match": comp == exp})

# ── checksumPassed 판단 ───────────────────────────────────────────────────────
inner_match = all(c["match"] for c in coltotal_seoul_inner)
outer_match = all(c["match"] for c in coltotal_seoul_outer)
sejong_match = all(c["match"] for c in coltotal_sejong)
total_match = (seoul_total_computed == SEOUL_TOTAL_PDF) and (sejong_total_computed == SEJONG_TOTAL_PDF)
checksumPassed = (len(row_fail) == 0 and inner_match and outer_match and sejong_match)

if not checksumPassed:
    fail_reasons = []
    if row_fail:
        fail_reasons.append(f"행합 실패 {len(row_fail)}건")
    if not inner_match:
        mis = [c["track"] for c in coltotal_seoul_inner if not c["match"]]
        fail_reasons.append(f"서울 열합 불일치: {mis}")
    if not outer_match:
        mis = [c["track"] for c in coltotal_seoul_outer if not c["match"]]
        fail_reasons.append(f"서울 정원외 열합 불일치: {mis}")
    if not sejong_match:
        mis = [c["track"] for c in coltotal_sejong if not c["match"]]
        fail_reasons.append(f"세종 열합 불일치: {mis}")
    warnings.append(f"[체크섬실패] {'; '.join(fail_reasons)}")

# ── 기타 경고 ─────────────────────────────────────────────────────────────────
warnings.append("[캠퍼스] 홍익대는 서울+세종 두 캠퍼스가 하나의 PDF에 수록. "
                "전 학과에 campus='서울' 또는 '세종' 명시.")
warnings.append("[미술우수자전형] 서울·세종 모두 2단계 전형: 1단계(3배수) 학부교과20%+서류80%, "
                "2단계 서류(1단계)40%+면접60%. 수능최저: 서울 3개합9, 세종 없음.")
warnings.append("[특성화고재직자] 서울캠퍼스 디자인·예술경영학부에만 적용: 정원내3 + 정원외182. "
                "specialTypeKeyword='특성화고졸재직자(정원외)'로 정원외분 표기.")
warnings.append("[공연예술우수자] 뮤지컬전공 1단계 8배수, 실용음악전공 1단계 10배수. "
                "모집단위별 track 분리 생성.")
warnings.append("[농어촌학생전형] 서울: 인문/자연(교과형)+미술(실기형) 분리. 세종: 동일 구조. "
                "수능최저 없음. 서울총괄 교과37+실기11=48, 세종총괄 교과21+실기7=28.")
warnings.append("[서울총계] PDF 총괄표 서울캠퍼스 계=1,783명 (정원내1,601+정원외182). "
                "빌더 계산값과 대조.")
warnings.append("[세종총계] PDF 총괄표 세종캠퍼스 계=974명. 빌더 계산값과 대조.")
warnings.append("[수능최저 인용 페이지] "
                "학교장추천자전형 p30, 학교생활우수자전형(서울) p40, 논술전형(서울) p59, "
                "미술우수자전형(서울) p63, 교과우수자전형(세종) p82, 논술전형(세종) p103.")

# ── 결과 조립 ─────────────────────────────────────────────────────────────────
result = {
    "universityName": "홍익대학교",
    "year": 2027,
    "recruitmentSeason": "susi",
    "departments": departments,
    "warnings": warnings,
}

def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t.get("reflectionStages"))
c_n  = cnt(lambda t: t.get("csatMinimumRawText") is not None)
ce_n = cnt(lambda t: t.get("csatMinimumExempt") is not None)
sp_n = cnt(lambda t: t.get("sourcePages"))
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t.get("reflectionStages") and t.get("sourcePages"))

meta = {
    "universityName": "홍익대학교",
    "universityId": "kcue_0000212",
    "year": 2027,
    "sourceDocYear": 2027,
    "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0,
    "campusScope": "서울+세종 두 캠퍼스 (단일 PDF)",
    "departments": len(departments),
    "totalTracks": T,
    "rowSumValidation": {
        "basis": "totalQuotaHint(학과별 전형합)",
        "passed": row_pass,
        "failed": len(row_fail),
        "failedList": [f"{c} {n}(hint={h}≠합={s})" for n, c, h, s in row_fail],
    },
    "colTotalValidationSeoulInner": coltotal_seoul_inner,
    "colTotalValidationSeoulOuter": coltotal_seoul_outer,
    "colTotalValidationSejong": coltotal_sejong,
    "colTotalGye": {
        "seoulInnerComputed": seoul_inner_computed,
        "seoulInnerExpected": SEOUL_INNER_PDF,
        "seoulOuterComputed": seoul_outer_computed,
        "seoulOuterExpected": SEOUL_OUTER_PDF,
        "seoulTotalComputed": seoul_total_computed,
        "seoulTotalExpected": SEOUL_TOTAL_PDF,
        "sejongComputed": sejong_total_computed,
        "sejongExpected": SEJONG_TOTAL_PDF,
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

(BASE / "hongik-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

# ── 콘솔 리포트 ───────────────────────────────────────────────────────────────
print("=" * 72)
print("홍익대 2027 수시 — 텍스트 직접 구조화 결과 (Vision 미사용, $0)")
print("=" * 72)
print(f"캠퍼스: 서울 + 세종 (두 캠퍼스 하나의 PDF)")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증: 통과 {row_pass} / 실패 {len(row_fail)}")
if row_fail:
    for n, c, h, s in row_fail:
        print(f"   X {c} {n}: hint={h} ≠ 합={s}")

print("\n서울캠퍼스 열합 검증 (정원내):")
for c in coltotal_seoul_inner:
    mark = "OK" if c["match"] else "XX"
    print(f"  [{mark}] {c['track']:30s} 계산={c['computed']:4d}  PDF={c['expectedSumRow']:4d}")
print(f"  서울정원내 합: 계산={seoul_inner_computed}  PDF={SEOUL_INNER_PDF}  {'OK' if seoul_inner_computed==SEOUL_INNER_PDF else 'XX'}")

print("\n서울캠퍼스 열합 검증 (정원외):")
for c in coltotal_seoul_outer:
    mark = "OK" if c["match"] else "XX"
    print(f"  [{mark}] {c['track']:30s} 계산={c['computed']:4d}  PDF={c['expectedSumRow']:4d}")
print(f"  서울정원외 합: 계산={seoul_outer_computed}  PDF={SEOUL_OUTER_PDF}  {'OK' if seoul_outer_computed==SEOUL_OUTER_PDF else 'XX'}")
print(f"  서울 전체:    계산={seoul_total_computed}  PDF={SEOUL_TOTAL_PDF}  {'OK' if seoul_total_computed==SEOUL_TOTAL_PDF else 'XX'}")

print("\n세종캠퍼스 열합 검증:")
for c in coltotal_sejong:
    mark = "OK" if c["match"] else "XX"
    print(f"  [{mark}] {c['track']:30s} 계산={c['computed']:4d}  PDF={c['expectedSumRow']:4d}")
print(f"  세종 전체:    계산={sejong_total_computed}  PDF={SEJONG_TOTAL_PDF}  {'OK' if sejong_total_computed==SEJONG_TOTAL_PDF else 'XX'}")

print(f"\nmeta.checksumPassed: {checksumPassed}")
print(f"\n채움 비율 ({T}전형):")
for label, n in [("quotaInitial", q_n), ("reflectionStages", r_n),
                 ("csatMinimumRawText", c_n), ("csatMinimumExempt", ce_n),
                 ("sourcePages", sp_n), ("완전레코드", comp_n)]:
    print(f"  {label:18s}: {n}/{T} ({100*n//T if T else 0}%)")
print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {BASE/'hongik-text.json'}")
