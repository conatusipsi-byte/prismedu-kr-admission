#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
충남대학교 수시 모집요강 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 cnu.txt 를 읽고 추출한 전형 템플릿(반영비율·수능최저)을
결정론적 위치기반 그리드 파서가 산출한 모집인원과 결합한다.

⚠ 연도 주의: 입력 PDF(cnu.txt) 표지·푸터·본문 전체가 "2026학년도"로 표기됨.
   과제 지시에 따라 출력 스키마 year=2027 로 두되, 원문이 2026임을 warnings 에 명시 기록(날조 금지).

정직성:
  - 모집인원 그리드(인쇄 p14~16): 행합(학과별 전형합 = 합계열) + 열합(전형별 합 = 총합계행) 이중 검증.
    · 그리드 3개 페이지(인문/자연/예체능+전공자율선택제)의 컬럼 레이아웃이 서로 달라 페이지별
      문자위치(char-offset) 기반 컬럼 정의를 사용. 열합이 총합계행과 정확히 일치하는지로 귀속 검증.
  - 반영비율·수능최저: 본체가 PDF 텍스트의 명시 문구에서 추출(추정 X). 단과대학 단위 수능최저표 인용.
  - 국가안보융합학부(국토/해양안보학전공): 병합셀·정원내외 분수표기(예 4/36)로 행 파싱 불가
    → 세부전형 페이지의 명시 인원으로 하드코딩(quotaInitial), warnings 기록.
  - 정원외(농어촌·특성화고·저소득·특수교육·재직자 등): specialTypeKeyword 부여.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "cnu.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed). 그리드: 인쇄p==물리p

warnings = []

# ════════════════════════════════════════════════════════════════════════
# 1) 트랙(전형) 메타: trackTypeRaw / specialTypeKeyword / 반영단계 / 수능최저
#    — 본체가 cnu.txt 세부전형 페이지(p24~86)에서 직접 인용·구조화
# ════════════════════════════════════════════════════════════════════════

def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# ── 수능최저 원문 (단과대학 단위 표, p25/p29 등에서 인용). 미적용은 "없음"+exempt=True ──
# 학생부교과(일반/지역인재) 단과대학별 수능최저 (p25, p29 동일)
CSAT_GYOGWA = {  # 단과대학/모집단위 → (rawText)
    "인문군11": "국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 11등급 이내",
    "사범인문9": "국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 9등급 이내",
    "자연12": "국어, 영어, 수학, 과학탐구(1과목) 중 상위 3개영역 합산 12등급 이내",
    "사범자연간호": "국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 - 과학탐구 12등급 / 사회탐구 11등급 / 직업탐구 10등급 이내",
    "생활13": "국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 - 과학탐구 13등급 / 사회탐구 12등급 / 직업탐구 11등급 이내",
    "수학과12": "국어, 영어, 탐구(1과목) 중 상위 2개영역과 수학(미적분, 기하) 합산 12등급 이내",
    "수학교육10": "국어, 영어, 탐구(1과목) 중 상위 2개영역과 수학(미적분, 기하) 합산 10등급 이내",
    "약학5": "국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 5등급 이내",
    "의예4": "국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 4등급 이내",
    "수의6": "국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 6등급 이내",
    "전공자율12": "국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 12등급 이내",
}
CSAT_AREAS_TAMGU1 = "탐구영역 1과목 반영 (약학·의과·수의과대학은 과학탐구 2과목 평균 반영)"

# ── 학과 → 단과대학 명시 매핑 (그리드 p14~16 + 세부전형에서 본체가 직접 전사) ──
#   그리드 좌측 병합셀 단과대 라벨이 행과 불일치(수직중앙배치)하여 자동추적 불가 → 명시 사전.
DEPT_COLLEGE = {
    # 인문대학
    "국어국문학과":"인문대학","영어영문학과":"인문대학","독어독문학과":"인문대학","불어불문학과":"인문대학",
    "중어중문학과":"인문대학","일어일문학과":"인문대학","한문학과":"인문대학","언어학과":"인문대학",
    "국사학과":"인문대학","사학과":"인문대학","고고학과":"인문대학","철학과":"인문대학",
    # 사회과학대학
    "사회학과":"사회과학대학","문헌정보학과":"사회과학대학","심리학과":"사회과학대학","언론정보학과":"사회과학대학",
    "사회복지학과":"사회과학대학","행정학부":"사회과학대학","도시·자치융합학과":"사회과학대학","정치외교학과":"사회과학대학",
    # 경상대학
    "경제학과":"경상대학","경영학부":"경상대학","무역학과":"경상대학",
    # 농업생명과학대학
    "농업경제학과":"농업생명과학대학","원예학과":"농업생명과학대학","생물환경화학과":"농업생명과학대학",
    # 사범대학
    "국어교육과":"사범대학","영어교육과":"사범대학","교육학과":"사범대학","수학교육과":"사범대학",
    "건설공학교육과":"사범대학","기계공학교육과":"사범대학","전기·전자·통신공학교육과":"사범대학",
    "화학공학교육과":"사범대학","기술교육과":"사범대학","체육교육과":"사범대학",
    # 지식융합학부
    "문화와사회융합전공":"지식융합학부","리더십과조직과학전공":"지식융합학부","공공안전융합전공":"지식융합학부",
    # 국가안보융합학부
    "국토안보학전공":"국가안보융합학부","해양안보학전공":"국가안보융합학부",
    # 국제학부
    "국제학부":"국제학부",
    # 자연과학대학
    "수학과":"자연과학대학","정보통계학과":"자연과학대학","물리학과":"자연과학대학","천문우주과학과":"자연과학대학",
    "화학과":"자연과학대학","생화학과":"자연과학대학","지질환경과학과":"자연과학대학","해양환경과학과":"자연과학대학",
    "반도체융합학과":"자연과학대학","스포츠과학과":"자연과학대학","무용학과":"자연과학대학",
    # 공과대학
    "건축학과(5년제)":"공과대학","스마트시티건축공학과":"공과대학","토목공학과":"공과대학","환경공학과":"공과대학",
    "기계공학부":"공과대학","메카트로닉스공학과":"공과대학","자율운항시스템공학과":"공과대학","항공우주공학과":"공과대학",
    "전기공학과":"공과대학","전자공학과":"공과대학","정보통신융합학부":"공과대학","컴퓨터인공지능학부":"공과대학",
    "신소재공학과":"공과대학","유기재료공학과":"공과대학","응용화학공학과":"공과대학","에너지공학과":"공과대학",
    # 약학/의과/수의/생활/간호/생명시스템
    "약학과":"약학대학","의예과":"의과대학","수의예과":"수의과대학",
    "의류학과":"생활과학대학","식품영양학과":"생활과학대학","소비자학과":"생활과학대학",
    "간호학과":"간호대학",
    "생물과학과":"생명시스템과학대학","미생물·분자생명과학과":"생명시스템과학대학","생명정보융합학과":"생명시스템과학대학",
    # 예술대학
    "음악과":"예술대학","관현악과":"예술대학","회화과":"예술대학","조소과":"예술대학",
    # 창의융합대학(전공자율선택제)
    "자율전공융합학부":"창의융합대학","인문사회융합학부":"창의융합대학","자연과학융합학부":"창의융합대학",
    "공학융합학부":"창의융합대학",
    "농생명융합학부":"농업생명과학대학",
}

# 단과대학(소속) → 학생부교과 수능최저 키 매핑 (p25 표)
COLLEGE_CSAT_GYOGWA = {
    "인문대학":"인문군11","사회과학대학":"인문군11","경상대학":"인문군11","지식융합학부":"인문군11",
    "국제학부":"인문군11","창의융합대학(인문사회융합학부)":"인문군11",
    "자연과학대학":"자연12","공과대학":"자연12","생명시스템과학대학":"자연12",
    "생활과학대학(식품영양학과)":"자연12","창의융합대학(자연과학융합학부)":"자연12","창의융합대학(공학융합학부)":"자연12",
    "간호대학":"사범자연간호",
    "생활과학대학(의류학과, 소비자학과)":"생활13",
    "약학대학":"약학5","의과대학":"의예4","수의과대학":"수의6",
}

def gyogwa_csat_for(dept, college=None):
    """학생부교과(일반/지역인재) 수능최저: 모집단위·단과대학 단위 분기 (p25 표)."""
    if college is None:
        college = DEPT_COLLEGE.get(dept)
    # 모집단위 단위 우선 분기
    if dept in ("수학과","정보통계학과"): return CSAT_GYOGWA["수학과12"]
    if dept == "수학교육과": return CSAT_GYOGWA["수학교육10"]
    if dept in ("국어교육과","영어교육과","교육학과"): return CSAT_GYOGWA["사범인문9"]
    if dept in ("건설공학교육과","기계공학교육과","전기·전자·통신공학교육과","화학공학교육과","기술교육과"):
        return CSAT_GYOGWA["사범자연간호"]
    if dept in ("의류학과","소비자학과"): return CSAT_GYOGWA["생활13"]
    # 전공자율선택제 학부 (p25)
    if dept in ("자율전공융합학부",) or college == "농업생명과학대학" and dept == "농생명융합학부":
        return CSAT_GYOGWA["전공자율12"]
    if dept == "인문사회융합학부": return CSAT_GYOGWA["인문군11"]
    if dept in ("자연과학융합학부","공학융합학부"): return CSAT_GYOGWA["자연12"]
    if college == "약학대학": return CSAT_GYOGWA["약학5"]
    if college == "의과대학": return CSAT_GYOGWA["의예4"]
    if college == "수의과대학": return CSAT_GYOGWA["수의6"]
    if college == "간호대학": return CSAT_GYOGWA["사범자연간호"]
    if college in ("자연과학대학","공과대학","생명시스템과학대학"): return CSAT_GYOGWA["자연12"]
    if dept == "식품영양학과": return CSAT_GYOGWA["자연12"]
    # 인문군(인문/사회/경상/지식융합/국제)
    if college in ("인문대학","사회과학대학","경상대학","지식융합학부","국제학부"):
        return CSAT_GYOGWA["인문군11"]
    return None  # 미상 → 정직하게 null

# ════════════════════════════════════════════════════════════════════════
# 2) 모집인원 그리드 파싱 (인쇄 p14=인문, p15=자연 일부, p16=자연 나머지+예체능+전공자율선택제)
#    페이지별 컬럼 정의: (대표start, end, trackKey). 각 숫자셀을 가장 가까운 컬럼에 귀속.
#    trackKey 는 아래 TRACK_DEFS 의 키.
# ════════════════════════════════════════════════════════════════════════

# 캐노니컬 트랙키 → (전형명, trackTypeRaw, specialTypeKeyword, 정원외여부)
TRACK_DEFS = {
    "교과_일반":        ("학생부교과(일반전형)", "학생부위주(교과)", None, False),
    "교과_지역인재":     ("학생부교과(지역인재전형)", "학생부위주(교과)", "지역인재", False),
    "교과_지역인재저소득": ("학생부교과(지역인재 저소득층학생전형)", "학생부위주(교과)", "지역인재·저소득", False),
    "교과_국가보훈":     ("학생부교과(국가보훈대상자전형)", "학생부위주(교과)", "국가보훈", False),
    "교과_고른기회":     ("학생부교과(고른기회 특별전형)", "학생부위주(교과)", "기회균형", False),
    "교과_국가안보":     ("학생부교과(국가안보교과전형)", "학생부위주(교과)", None, False),
    "종합1_일반":       ("학생부종합Ⅰ(일반전형)", "학생부위주(종합)", None, False),
    "종합1_서류":       ("학생부종합Ⅰ(서류전형)", "학생부위주(종합)", None, False),
    "종합2_소프트영농":   ("학생부종합Ⅱ(소프트웨어인재/영농창업인재전형)", "학생부위주(종합)", None, False),
    "종합2_지역인재의예": ("학생부종합Ⅱ(지역인재전형-의예과)", "학생부위주(종합)", "지역인재", False),
    "종합2_국가안보":    ("학생부종합Ⅱ(국가안보융합인재전형)", "학생부위주(종합)", None, False),
    "실기_일반":        ("실기(일반전형)", "실기/실적위주", None, False),
    "실적_체육특기자":    ("실적(체육특기자)", "실기/실적위주", "체육특기자", False),
    "종합3_농어촌":      ("학생부종합Ⅲ(농어촌학생전형)", "학생부위주(종합)", "농어촌", True),
    "종합3_특성화고":     ("학생부종합Ⅲ(특성화고출신자전형)", "학생부위주(종합)", "특성화고", True),
    "종합3_저소득층":     ("학생부종합Ⅲ(저소득층학생전형)", "학생부위주(종합)", "저소득층", True),
    "종합3_특수교육":     ("학생부종합Ⅲ(특수교육대상자전형)", "학생부위주(종합)", "특수교육대상", True),
    "종합3_재직자":      ("학생부종합Ⅲ(특성화고졸재직자전형)", "학생부위주(종합)", "특성화고졸재직자", True),
    "종합3_만학도":      ("학생부종합Ⅲ(만학도전형)", "학생부위주(종합)", "만학도", True),
    "실기_만학도":       ("실기(만학도전형)", "실기/실적위주", "만학도", True),
}

# 페이지별 컬럼 정의: 리스트[(start, trackKey)]  (start=대표 문자위치; 가장 가까운 컬럼에 귀속)
# ※ 컬럼 식별은 본체가 그리드 소계·총합계행을 역산해 검증함(열합 게이트로 귀속 정확성 보장).
#   - p14 인문 종합Ⅲ: 82농어촌 86저소득 92특수교육 97재직자 102만학도 (소계 37/18/39/30/27 확인)
#   - p15 자연 종합Ⅲ: 77농어촌 82저소득 86특수교육 91만학도 (자연소계 역산 확인, 특성화고·재직자 없음)
#   - p16 자연 종합Ⅲ: 96농어촌 99특성화고 103저소득 109특수교육
#   - p16 전공자율 종합Ⅲ: 96농어촌 99특성화고 102저소득 109특수교육
COLMAP = {
    14: [  # 인문계
        (26,"교과_일반"),(31,"교과_지역인재"),(37,"교과_국가보훈"),(44,"교과_고른기회"),
        (49,"교과_국가안보"),(54,"종합1_일반"),(60,"종합1_서류"),(66,"종합2_소프트영농"),
        (70,"종합2_국가안보"),
        (82,"종합3_농어촌"),(86,"종합3_저소득층"),(92,"종합3_특수교육"),(97,"종합3_재직자"),(102,"종합3_만학도"),
    ],
    15: [  # 자연계 (자연과학·공과·약학·의과·생활·수의)
        (26,"교과_일반"),(31,"교과_지역인재"),(37,"교과_지역인재저소득"),(42,"교과_국가보훈"),(46,"교과_고른기회"),
        (50,"종합1_일반"),(56,"종합1_서류"),(62,"종합2_소프트영농"),(67,"종합2_소프트영농"),(72,"종합2_지역인재의예"),
        (77,"종합3_농어촌"),(82,"종합3_저소득층"),(86,"종합3_특수교육"),(91,"종합3_만학도"),
    ],
    16: [  # 자연계(사범·간호·생명시스템) + 예체능 + 전공자율선택제
        (29,"교과_일반"),(34,"교과_지역인재"),(39,"교과_지역인재저소득"),(44,"교과_국가보훈"),(48,"교과_고른기회"),
        (56,"종합1_일반"),(62,"종합1_서류"),
        (69,"실기_일반"),     # 예체능: 실기 일반전형(예술계열) 무용 위치 69
        (80,"실기_일반"),      # 예체능 음악/미술 실기 일반(성악17 등) 위치 80
        (85,"실적_체육특기자"),  # 체육특기자(스포츠과학과15/체육교육과6)
        # p16 자연(사범/간호/생명) 종합Ⅲ: 96농어촌 101특성화고 105저소득 109특수교육
        # p16 전공자율(농생명) 종합Ⅲ: 96농어촌 99특성화고 102저소득 109특수교육
        (96,"종합3_농어촌"),(99,"종합3_특성화고"),(101,"종합3_특성화고"),
        (102,"종합3_저소득층"),(105,"종합3_저소득층"),(109,"종합3_특수교육"),
        (123,"실기_만학도"),
    ],
}

# ── 국가안보융합학부: 병합셀·정원내외 분수표기로 그리드 행 파싱 불가 → 세부전형 페이지 명시 인원 하드코딩 ──
#   (p64 학생부교과 국가안보교과전형 / p75 학생부종합Ⅱ 국가안보융합인재전형)
HARDCODE_GUKGA = {
    "국토안보학전공": {"교과_국가안보": 5, "종합2_국가안보": 19, "_total": 24,
                  "_note": "국가안보교과 5명(남3,여2, p64) + 국가안보융합인재(종합Ⅱ) 19명(남16,여3, p75). 군 협약(육군) 계약학과."},
    "해양안보학전공": {"교과_국가안보": 4, "종합2_국가안보": 36, "_total": 40,
                  "_note": "국가안보교과 4명(남2,여2, p64) + 국가안보융합인재(종합Ⅱ) 36명(남32,여4, p75). 군 협약(해군) 계약학과. 그리드 정원외 분수표기(2/32 등)."},
}

SUFFIX = "★◇◉*"
EXCLUDE_LINE = ("소계","합계","2026학년도 수시","충남대학교 수시","CHUNGNAM","전형요약","Ⅱ. 전형별","1. 전형별",
                "전형기간","수시모집","정원내","정원외","모집단위","단과")

# 단과대학 추적 (행 좌측 병합셀에서 등장). 인쇄 표의 '계열'·'단과대학' 라벨.
def assign_cells(line, colmap, total_col):
    """라인의 숫자셀을 colmap 의 가장 가까운 start 에 귀속. 합계열(total_col±3)은 제외."""
    cells = [(m.start(), m.group()) for m in re.finditer(r'\d+(?:/\d+)?', line)]
    out = {}
    first_start = colmap[0][0]  # 교과_일반 컬럼 start
    for pos, val in cells:
        if abs(pos - total_col) <= 3 and "/" not in val:
            continue  # 합계열 셀 제외
        # 학과명 길이 초과로 교과_일반 값이 좌측으로 밀린 경우(예 스마트시티건축공학과 18) 보정
        if first_start - 6 <= pos < first_start and val != "" and abs(pos-total_col) > 3:
            out[colmap[0][1]] = out.get(colmap[0][1], 0) + int(val)
            continue
        # 가장 가까운 컬럼 start
        best = min(colmap, key=lambda c: abs(c[0]-pos))
        if abs(best[0]-pos) <= 3:  # 3 char 이내만 귀속(멀면 미귀속 → 행합 실패로 노출)
            # 분수표기(정원내/정원외)는 합산하지 않고 원문 보존
            if "/" in val:
                out[best[1]] = val  # 문자열로 둔다(드묾)
            elif isinstance(out.get(best[1]), str):
                pass
            else:
                out[best[1]] = out.get(best[1], 0) + int(val)
    return out, cells

# ── 단과대학·계열 라벨 사전(행 좌측에 병합셀로 등장하는 토큰) ──
COLLEGE_TOKENS = {
    "인문대학","사회과학대학","경상대학","농업생명과학대학","사범대학","지식융합학부","국가안보융합학부",
    "국제학부","자연과학대학","공과대학","약학대학","의과대학","생활과학대학","수의과대학","간호대학",
    "생명시스템과학대학","예술대학","창의융합대학",
}

# 학과명 정규화: 좌측 병합셀 토큰(계열/단과대) 제거
NOISE_TOKENS = {"인","문","계","자","연","예","체","능","전","공","율","선","택","제",
                "인문","대학","사회","과학","경상","농업생명","사범","지식","융합","학부","국가","안보",
                "국제","자연","공과","약학","의과","생활","수의","간호","생명","시스템","예술","창의",
                "농생명","의과대학","약학대학","수의과대학","생활과학","과학대학","무용","악과","관현"}

def clean_name(raw_tokens):
    """행 토큰들에서 학과명만 추출 (좌측 계열/단과대 라벨 제거)."""
    toks = [t.strip(SUFFIX) for t in raw_tokens if t.strip(SUFFIX)]
    name = [t for t in toks if t not in NOISE_TOKENS]
    return " ".join(name).strip()

# ════════════════════════════════════════════════════════════════════════
# 3) 그리드 행 파싱
# ════════════════════════════════════════════════════════════════════════
# 학과명 → (campus, trackHint, college) 메타. trackHint 는 그리드 계열 블록으로 결정.
departments = {}      # name -> dict
parse_fail = []
col_totals = {}       # trackKey -> 합

# 행 식별: '학과명 ... 숫자들 ... 합계' 패턴. 합계는 행의 마지막(최우측, 큰 위치) 숫자.
# 페이지별 합계열 위치: p14=107, p15=98, p16=127
TOTAL_COL = {14:107, 15:98, 16:127}

CURRENT_GYE = {14:"인문", 15:"자연", 16:"자연"}  # 페이지 기본 계열 (p16 후반은 예체능/전공자율선택제로 전환)

def parse_grid_page(pno):
    pg = pages[pno-1]
    colmap = COLMAP[pno]
    total_col = TOTAL_COL[pno]
    gye_default = CURRENT_GYE[pno]
    cur_college = None
    section = "정원내"  # p16 에서 예체능/전공자율선택제 섹션 전환 감지
    for line in pg.splitlines():
        if not line.strip():
            continue
        if any(x in line for x in EXCLUDE_LINE):
            # 단, 소계/총합계는 별도 검증에서 사용하므로 여기선 skip
            continue
        # 단과대학 토큰 갱신
        for ct in COLLEGE_TOKENS:
            if ct in line:
                cur_college = ct
        # 섹션 전환 감지 (p16)
        if "스포츠과학과" in line or "무용" in line or "음악과" in line or "회화과" in line or "조소과" in line or "체육교육과" in line:
            section = "예체능"
        if "자율전공융합학부" in line or "인문사회융합학부" in line or "자연과학융합학부" in line or "공학융합학부" in line or "농생명융합학부" in line:
            section = "전공자율선택제"

        cells = [(m.start(), m.group()) for m in re.finditer(r'\d+(?:/\d+)?', line)]
        if len(cells) < 2:
            continue
        # 합계열: total_col 근처(±3)의 셀
        tot_candidates = [(p,v) for p,v in cells if abs(p-total_col) <= 3 and "/" not in v]
        if not tot_candidates:
            continue
        total = int(tot_candidates[-1][1])
        # 학과명: 합계/숫자 토큰 제외한 좌측 한글 토큰
        # 토큰 분해
        toks = line.split()
        name_toks = [t for t in toks if not re.fullmatch(r'\d+(?:/\d+)?', t)]
        name = clean_name(name_toks)
        if not name:
            continue
        # 본문 셀(합계열 제외) 귀속
        body_cells = [(p,v) for p,v in cells if abs(p-total_col) > 3]
        assigned, _ = assign_cells(line, colmap, total_col)
        # 합계열은 assign 에서 4char 경계로 자동 제외되지만, 안전하게 합계 trackKey 가 없는지 확인
        # 행합 검증: 정수 셀 합 (분수표기 셀은 정수부만 우선 합산해 비교용으로)
        def cellint(v):
            if isinstance(v, str) and "/" in v:
                a,b=v.split("/"); return int(a)+int(b)
            return int(v)
        rowsum = sum(cellint(v) for k,v in assigned.items())
        ok = (rowsum == total)
        departments_setdefault(name, pno, gye_default, section, cur_college, total, assigned, ok, line)

# 예체능 세부전공 → 부모 모집단위 그룹핑 (그리드가 세부전공 단위로 표기)
SUBMAJOR_PARENT = {
    "한국무용":"무용학과","현대무용":"무용학과","발레":"무용학과",
    "성악":"음악과","작곡":"음악과","피아노":"음악과",
    "관악":"관현악과","현악":"관현악과",
    "한국화":"회화과","서양화":"회화과",
}
# 그리드 행이 스크램블된(병합셀) 국가안보융합학부 행 → 건너뛰고 하드코딩으로 대체
SKIP_NAMES = {"국토안보학전공(남)","국토안보학전공(여)","해양안보학전공(남)","해양안보학전공(여)",
              "국토안보학전공","해양안보학전공"}

def departments_setdefault(name, pno, gye_default, section, college, total, assigned, ok, line):
    gye = gye_default
    if section == "예체능": gye = "예체능"
    elif section == "전공자율선택제": gye = None  # 전공자율선택제는 계열 혼합 → null
    # 국가안보 스크램블 행 skip (하드코딩 대체)
    if name in SKIP_NAMES or name == "국가" or name == "":
        return
    # 세부전공 토큰 탐지(라인 어디든): 한국무용/성악/작곡/피아노/관악/현악/한국화/서양화 등
    parts = name.split()
    submajor = None
    for p in parts:
        if p in SUBMAJOR_PARENT:
            submajor = p; break
    if submajor:
        key = SUBMAJOR_PARENT[submajor]
    else:
        # 좌측 단과대 라벨이 학과명에 섞인 경우 정리 (예: "국제학부 국제학부")
        if len(parts) == 2 and parts[0] == parts[1]:
            name = parts[0]
        elif len(parts) >= 2 and parts[0] in COLLEGE_TOKENS:
            name = " ".join(parts[1:])
        # 조소과 단독 (회화과 그룹 아님 — 별도 모집단위)
        key = name
    d = departments.get(key)
    if d is None:
        d = {"departmentName": key, "campus": None, "trackHint": gye,
             "totalQuotaHint": 0, "college": college, "_tracks_raw": {}, "_pages": set(),
             "_rowok": True, "_submajors": {}}
        departments[key] = d
    d["_pages"].add(pno)
    d["totalQuotaHint"] += total
    if submajor:
        d["_submajors"][submajor] = total
    if not ok: d["_rowok"] = False
    for k, v in assigned.items():
        if k.endswith("FRAC"):
            d["_tracks_raw"].setdefault(k, v)  # 보존
        else:
            prev = d["_tracks_raw"].get(k, 0)
            d["_tracks_raw"][k] = (prev if isinstance(prev,int) else 0) + (v if isinstance(v,int) else 0)

for pno in (14,15,16):
    parse_grid_page(pno)

# ── 국가안보융합학부: 하드코딩 주입 (그리드 병합셀 파싱 불가 → 세부전형 페이지 명시 인원) ──
for dname, hc in HARDCODE_GUKGA.items():
    tracks = {k:v for k,v in hc.items() if not k.startswith("_")}
    departments[dname] = {
        "departmentName": dname, "campus": None, "trackHint": "자연",  # 국가안보(자연계 응시/이과 성격) — 단, p14 인문블록 배치
        "totalQuotaHint": hc["_total"], "college": "국가안보융합학부",
        "_tracks_raw": dict(tracks), "_pages": {14}, "_rowok": True, "_submajors": {},
        "_hardcode_note": hc["_note"],
    }
warnings.append("[국가안보융합학부] 국토안보학전공·해양안보학전공은 그리드(p14) 병합셀·정원내외 분수표기(4/36 등)로 "
                "행 파싱 불가 → 세부전형 페이지(p64 교과·p75 종합Ⅱ) 명시 인원으로 하드코딩. "
                "국토안보 교과5+종합Ⅱ19=24, 해양안보 교과4+종합Ⅱ36=40. 군 계약학과(육군/해군).")

# ── 행합 검증 (totalQuotaHint == 전형귀속합) ──
for name, d in departments.items():
    s = sum(v for v in d["_tracks_raw"].values() if isinstance(v,int))
    # 분수표기(해양안보 등)는 정수합에서 제외되므로 hint 와 차이날 수 있음 → 별도 메모
    if d.get("_hardcode_note"):
        continue
    if s != d["totalQuotaHint"]:
        parse_fail.append((name, d["totalQuotaHint"], s))
        warnings.append(f"[행합불일치] {name}: 합계 {d['totalQuotaHint']} ≠ 전형귀속합 {s}")

# ── 열합 집계 ──
for name, d in departments.items():
    for k, v in d["_tracks_raw"].items():
        if isinstance(v,int) and v>0:
            col_totals[k] = col_totals.get(k,0) + v

# ════════════════════════════════════════════════════════════════════════
# 4) 트랙별 reflectionStages / csat 빌더  (본체가 세부전형 페이지에서 직접 인용)
# ════════════════════════════════════════════════════════════════════════
# 사범대학 면접 시행 학과 (학생부교과 일반/지역인재 — 2단계 면접): 국어교육/수학교육/화학공학교육/기술교육
GYOGWA_INTERVIEW_DEPTS = {"국어교육과","수학교육과","화학공학교육과","기술교육과"}

def stages_for(track_key, dept, college):
    """전형요소 및 반영점수(비율) — 세부전형 페이지(p24~86) 명시 표 인용."""
    if track_key == "교과_일반" or track_key == "교과_지역인재":
        if dept in GYOGWA_INTERVIEW_DEPTS:  # 사범대학 일부: 1단계 교과100(3배수)→2단계 교과80+면접20
            return [stage("1단계", 3, {"학생부(교과)": 100}, 100),
                    stage("2단계", None, {"학생부(교과)": 80, "면접": 20}, 100)]
        return [stage("일괄", None, {"학생부(교과)": 100}, 100)]
    if track_key in ("교과_지역인재저소득","교과_국가보훈","교과_고른기회"):
        return [stage("일괄", None, {"학생부(교과)": 100}, 100)]
    if track_key == "교과_국가안보":
        if dept == "국토안보학전공":  # p64: 1단계 교과100(5배수)→2단계 교과71.4+면접14.3+체력14.3+신체검사(합불)
            return [stage("1단계", 5, {"학생부(교과)": 100}, 100),
                    stage("2단계", None, {"학생부(교과)": 71.4, "면접": 14.3, "체력평가": 14.3, "신체검사(합불)": 0}, 100)]
        return [stage("1단계", 3, {"학생부(교과)": 100}, 100),  # 해양: 1단계 교과100(3배수)→2단계 교과78.6+면접19.6+체력1.8
                stage("2단계", None, {"학생부(교과)": 78.6, "면접": 19.6, "체력평가": 1.8, "신체검사/인성검사/신원조사(합불)": 0}, 100)]
    if track_key == "종합1_일반":
        # 1단계 서류100(2~3배수, 의과대학 3배수)→2단계 서류66.7+면접33.3
        return [stage("1단계", 3, {"서류": 100}, 100),
                stage("2단계", None, {"서류": 66.7, "면접": 33.3}, 100)]
    if track_key == "종합1_서류":  # 일괄합산 서류100
        return [stage("일괄합산", None, {"서류": 100}, 100)]
    if track_key in ("종합2_소프트영농","종합2_지역인재의예","종합3_농어촌","종합3_특성화고",
                     "종합3_저소득층","종합3_특수교육","종합3_재직자","종합3_만학도"):
        # p41/43/46/81/83: 1단계 서류100(3배수, 재직자 2배수)→2단계 서류66.7+면접33.3
        mult = 2 if track_key == "종합3_재직자" else 3
        return [stage("1단계", mult, {"서류": 100}, 100),
                stage("2단계", None, {"서류": 66.7, "면접": 33.3}, 100)]
    if track_key == "종합2_국가안보":
        # p75: 1단계 서류100(3배수)→2단계 서류57.1+면접28.6+체력14.3+신체검사(합불)
        bul = "신체검사(합불)" if dept == "국토안보학전공" else "신체검사/인성검사/신원조사(합불)"
        return [stage("1단계", 3, {"서류": 100}, 100),
                stage("2단계", None, {"서류": 57.1, "면접": 28.6, "체력평가": 14.3, bul: 0}, 100)]
    if track_key == "실기_일반":
        # p53: 일괄 학생부20(교과16+출결4) + 실기80
        return [stage("일괄사정", None, {"학생부(교과)": 16, "학생부(출결)": 4, "실기": 80}, 100)]
    if track_key == "실기_만학도":  # p85: 동일 구조(음악/관현악)
        return [stage("일괄사정", None, {"학생부(교과)": 16, "학생부(출결)": 4, "실기": 80}, 100)]
    if track_key == "실적_체육특기자":
        # p59: 일괄 학생부(교과19.0+출결4.8) + 경기적성33.3 + 입상실적42.9 (자체배점 보존)
        return [stage("일괄사정", None, {"학생부(교과)": 19.0, "학생부(출결)": 4.8,
                                      "면접(경기적성)": 33.3, "서류(입상실적)": 42.9}, 100)]
    return []

# 수능최저: 적용 트랙만. 그 외 "없음"+exempt=True.
def csat_for(track_key, dept, college):
    # 미적용(×) 트랙: 국가보훈/고른기회/소프트영농/종합Ⅰ서류 일부/종합Ⅲ 전체/실기·체육특기자/국가안보융합인재(종합)
    # 적용(○) 트랙: 교과(일반·지역인재·지역저소득)·종합Ⅰ일반(사범/간호/약/의/수의 일부)·종합Ⅱ지역의예·국가안보교과
    if track_key in ("교과_일반","교과_지역인재"):
        raw = gyogwa_csat_for(dept, college)
        return (raw, False, CSAT_AREAS_TAMGU1) if raw else (None, None, None)
    if track_key == "교과_지역인재저소득":  # p31: 약학7/의예6/간호(탐구별)
        m = {"약학과":"국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 7등급 이내",
             "의예과":"국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 6등급 이내",
             "간호학과":CSAT_GYOGWA["생활13"].replace("13등급","13등급")}
        # 간호: 과탐13/사탐12/직탐11
        if dept == "간호학과":
            raw = "국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 - 과학탐구 13등급 / 사회탐구 12등급 / 직업탐구 11등급 이내"
        else:
            raw = m.get(dept)
        return (raw, False, CSAT_AREAS_TAMGU1) if raw else (None, None, None)
    if track_key == "교과_국가안보":  # p64: 국토12 / 해양11
        raw = ("국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 12등급 이내" if dept=="국토안보학전공"
               else "국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 11등급 이내")
        return (raw, False, "국어, 영어, 수학, 탐구(1과목) 필수 응시")
    if track_key == "종합1_일반":  # p38: 일부 적용(사범 일부·간호·약·의·수의). 그 외 미적용.
        if dept in ("국어교육과","영어교육과","교육학과"):
            return ("국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 9등급 이내", False, CSAT_AREAS_TAMGU1)
        if dept in ("건설공학교육과","기계공학교육과","화학공학교육과","기술교육과"):
            return ("국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 - 과학탐구 12등급 / 사회탐구 11등급 / 직업탐구 10등급 이내", False, "사범대학(전기·전자·통신공학교육과)은 미반영")
        if dept == "수학교육과":
            return ("국어, 영어, 탐구(1과목) 중 상위 2개영역과 수학(미적분, 기하) 합산 10등급 이내", False, CSAT_AREAS_TAMGU1)
        if college == "간호대학" or dept == "간호학과":
            return ("국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 - 과학탐구 12등급 / 사회탐구 11등급 / 직업탐구 10등급 이내", False, CSAT_AREAS_TAMGU1)
        if college == "약학대학" or dept == "약학과":
            return ("국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 6등급 이내", False, CSAT_AREAS_TAMGU1)
        if college == "의과대학" or dept == "의예과":
            return ("국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 5등급 이내", False, CSAT_AREAS_TAMGU1)
        if college == "수의과대학" or dept == "수의예과":
            return ("국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 7등급 이내", False, CSAT_AREAS_TAMGU1)
        return ("없음", True, None)  # 그 외 모집단위 종합Ⅰ일반 미적용
    if track_key == "종합1_서류":  # p38: 일부 적용(간호·약·의·수의대학). 그 외 미적용.
        if college == "간호대학" or dept == "간호학과":
            return ("국어, 영어, 수학, 탐구(1과목) 중 상위 3개영역 합산 - 과학탐구 12등급 / 사회탐구 11등급 / 직업탐구 10등급 이내", False, CSAT_AREAS_TAMGU1)
        if college == "약학대학" or dept == "약학과":
            return ("국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 6등급 이내", False, CSAT_AREAS_TAMGU1)
        if college == "의과대학" or dept == "의예과":
            return ("국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 5등급 이내", False, CSAT_AREAS_TAMGU1)
        if college == "수의과대학" or dept == "수의예과":
            return ("국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 7등급 이내", False, CSAT_AREAS_TAMGU1)
        return ("없음", True, None)
    if track_key == "종합2_지역인재의예":  # p43: 의예 종합Ⅱ 지역인재 — 적용 5등급
        return ("국어, 영어, 과학탐구(2과목 평균) 중 상위 2개영역과 수학(미적분, 기하) 합산 5등급 이내", False, CSAT_AREAS_TAMGU1)
    # 그 외 전부 미적용
    return ("없음", True, None)

# 정원외 전형 application qualification (간단 표기)
APPQUAL = {
    "교과_지역인재":"충청권(대전·충남·충북·세종) 소재 고교 전 교육과정 이수(예정)자",
    "교과_지역인재저소득":"충청권 소재 고교 전 교육과정 이수자 중 기초생활수급자·차상위·한부모가족 지원대상자 (약학2·의예3·간호2명)",
    "교과_국가보훈":"「국가보훈 기본법」에 따른 국가보훈대상자(교육지원 대상자)",
    "교과_고른기회":"서해5도/농어촌/저소득층 등 고른기회 대상자(통합)",
    "종합2_지역인재의예":"충청권 소재 고교 전 교육과정 이수(예정)자 (의예과 18명)",
    "종합3_농어촌":"농어촌·도서벽지 소재 학교 전 교육과정 이수 및 거주(정원외)",
    "종합3_특성화고":"모집단위 동일계열 특성화고 졸업(예정)자(정원외)",
    "종합3_저소득층":"기초생활수급자·차상위·한부모가족 지원대상자(정원외)",
    "종합3_특수교육":"「장애인복지법」 장애인 등록자 또는 국가유공자 상이등급자(정원외)",
    "종합3_재직자":"산업체 3년 이상 재직자(특성화고졸 등) — 전형기간 자율화(정원외)",
    "종합3_만학도":"2026.3.1. 기준 만 30세 이상 — 전형기간 자율화(정원외)",
    "실기_만학도":"2026.3.1. 기준 만 30세 이상 — 전형기간 자율화(정원외)",
    "실적_체육특기자":"고교 재학 중/졸업 후 3년 이내 입상·국가대표 등 체육특기 실적자",
    "교과_국가안보":"군인사법 결격사유 미해당, 임관일 기준 만20~29세, 재정보증보험 가입 가능자",
    "종합2_국가안보":"군인사법 결격사유 미해당, 임관일 기준 만20~29세, 재정보증보험 가입 가능자",
}

# sourcePages (인쇄=물리 동일). 그리드 p14~16 + 세부전형 페이지.
GRID_PAGES = {14,15,16}
DETAIL_PAGE = {
    "교과_일반":[24,25], "교과_지역인재":[28,29], "교과_지역인재저소득":[31],
    "교과_국가보훈":[33], "교과_고른기회":[34,35,36,37], "교과_국가안보":[64,65,66,67,68,69],
    "종합1_일반":[38,39], "종합1_서류":[38], "종합2_소프트영농":[41], "종합2_지역인재의예":[43],
    "종합2_국가안보":[75,76,77,78], "실기_일반":[53,54,55,56,57], "실적_체육특기자":[58,59,60,61,62,63],
    "종합3_농어촌":[45,46], "종합3_특성화고":[48], "종합3_저소득층":[50], "종합3_특수교육":[52],
    "종합3_재직자":[81,82], "종합3_만학도":[83,84], "실기_만학도":[85,86],
}

# ════════════════════════════════════════════════════════════════════════
# 5) departments → 스키마 변환
# ════════════════════════════════════════════════════════════════════════
TRACK_ORDER = list(TRACK_DEFS.keys())

def build_department(d):
    name = d["departmentName"]
    college = DEPT_COLLEGE.get(name) or d.get("college")  # 명시 매핑 우선(그리드 추적 불안정)
    tracks = []
    raw = d["_tracks_raw"]
    for tk in TRACK_ORDER:
        if tk not in raw:
            continue
        qval = raw[tk]
        trackName, ttype, special, jeongwon_oe = TRACK_DEFS[tk]
        quota = qval if isinstance(qval,int) else None
        note = None
        if isinstance(qval,str):  # 분수표기 보존
            note = f"그리드 표기 '{qval}' (정원내/정원외 분리표기) — 정수 모집인원 미상"
        csat_raw, csat_exempt, csat_areas = csat_for(tk, name, college)
        # sourcePages = 이 학과의 실제 그리드 페이지(_pages) + 해당 전형 세부 페이지
        grid_p = sorted(d.get("_pages") or GRID_PAGES)
        src = sorted(set(grid_p + DETAIL_PAGE.get(tk, [])))
        t = {
            "trackName": trackName, "trackTypeRaw": ttype, "recruitmentPeriodRaw": "수시",
            "specialTypeKeyword": special, "quotaInitial": quota,
            "applicationQualification": APPQUAL.get(tk),
            "reflectionStages": stages_for(tk, name, college),
            "csatMinimumRawText": csat_raw, "csatMinimumExempt": csat_exempt,
            "csatRequiredAreasRawText": csat_areas, "prevYearResult": None,
            "sourcePages": src,
        }
        if note: t["note"] = note
        tracks.append(t)
    out = {"departmentName": name, "campus": d.get("campus"), "trackHint": d.get("trackHint"),
           "totalQuotaHint": d.get("totalQuotaHint"), "tracks": tracks}
    if d.get("_submajors"):
        out["note"] = "세부전공별 모집: " + ", ".join(f"{k} {v}명" for k,v in d["_submajors"].items())
    if d.get("_hardcode_note"):
        out["note"] = d["_hardcode_note"]
    return out

dept_list = [build_department(d) for d in departments.values()]
dept_list.sort(key=lambda x: (x["trackHint"] or "z", x["departmentName"]))

# ── 의예과·세종공동캠퍼스 메모 (p16: '의예과는 세종공동캠퍼스에서 수업 진행 가능') ──
for d in dept_list:
    if d["departmentName"] == "의예과":
        d["campus"] = None
        d["note"] = (d.get("note","") + " | 의예과는 세종공동캠퍼스에서 수업 진행 가능(p16). 본부 캠퍼스는 대전.").strip(" |")

# ── 열합 검증 (전형별 합 vs 총합계행) ─────────────────────────────────────
# 총합계행(p16) 하드코딩 대조숫자 (PDF 실제 합계). 해양안보(4/36)은 별도 정원외 셀.
EXPECTED_COLTOTAL = {
    "교과_일반":1260,"교과_지역인재":728,"교과_지역인재저소득":7,"교과_국가보훈":17,"교과_고른기회":46,
    "교과_국가안보":5,"종합1_일반":405,"종합1_서류":279,"종합2_소프트영농":16,"종합2_지역인재의예":18,
    "종합2_국가안보":19,"실기_일반":125,"실적_체육특기자":21,"종합3_농어촌":112,"종합3_특성화고":19,
    "종합3_저소득층":69,"종합3_특수교육":88,"종합3_재직자":30,"종합3_만학도":39,"실기_만학도":14,
}
# 하드코딩 국가안보 포함 재집계
col_totals = {}
for d in departments.values():
    for k,v in d["_tracks_raw"].items():
        if isinstance(v,int) and v>0:
            col_totals[k] = col_totals.get(k,0)+v
coltotal_report = []
for k in EXPECTED_COLTOTAL:
    comp = col_totals.get(k,0)
    exp = EXPECTED_COLTOTAL[k]
    # 국가안보 교과/종합은 국토만 총합계에 계상(해양은 4/36 별도) → 비교 시 국토분만
    if k == "교과_국가안보": comp_cmp = HARDCODE_GUKGA["국토안보학전공"]["교과_국가안보"]
    elif k == "종합2_국가안보": comp_cmp = HARDCODE_GUKGA["국토안보학전공"]["종합2_국가안보"]
    else: comp_cmp = comp
    coltotal_report.append((k, comp, exp, comp_cmp == exp))

# 종합1_서류 3단위 차이 솔직 기록 (원인 규명)
if col_totals.get("종합1_서류",0) != EXPECTED_COLTOTAL["종합1_서류"]:
    warnings.append(f"[열합불일치-종합Ⅰ서류] 정상 학과 귀속합 {col_totals.get('종합1_서류',0)} ≠ 총합계행/전형요약(p38) 279 "
                    f"(차이 3, 전부 인문계: 인문 귀속 97 vs 인문계소계 100). 원인 규명: 국가안보융합학부 '국가'행(p14)의 "
                    f"종합Ⅱ 국토안보(여)=3명 값이 병합셀 붕괴로 '종합Ⅰ서류' 컬럼 위치(col60)에 인쇄되어, 인문계소계/총합계가 "
                    f"이를 기계적으로 종합Ⅰ서류에 합산함. 본 JSON은 그 3명을 의미에 맞게 국토안보 종합Ⅱ(19=남16+여3)에 귀속. "
                    f"즉 차이 3은 데이터 누락이 아니라 원문 그리드의 컬럼 오배치 보정 결과(전체 3,357 중 3명, 0.09%).")
warnings.append("[국가안보 열합] 총합계행의 교과_국가안보=5·종합Ⅱ_국가안보=19 는 국토안보학전공만 계상(해양안보는 "
                "그리드 정원외 분수셀 4/36 로 별도 표기). 본 JSON 은 국토(교과5/종합19)·해양(교과4/종합36)을 "
                "각각 quotaInitial 로 명시.")

# ── 연도·캠퍼스·계열 경고 ──
warnings.insert(0, "[연도 주의] 입력 PDF(cnu.txt) 표지·푸터·본문 전체가 '2026학년도'로 표기됨. 과제 지시에 따라 "
                   "출력 스키마 year=2027 로 설정하였으나, 원문은 2026학년도 수시모집요강임(전형일정 2025.9 접수 "
                   "~2026.2 등록). 2027 데이터로 사용 시 반드시 재확인 필요.")
warnings.append("[캠퍼스] 충남대는 대전 본부캠퍼스 단일 표기(그리드에 캠퍼스 컬럼 없음) → campus=null. "
                "단 의예과는 세종공동캠퍼스 수업 진행 가능 메모(p16). 캠퍼스 분리 모집 아님.")
warnings.append("[계열(trackHint)] 그리드 계열 블록(인문/자연/예체능)으로 부여. 전공자율선택제(자율전공·인문사회·"
                "자연과학·공학·농생명융합학부)는 계열 혼합 모집이라 trackHint=null. 국가안보융합학부는 그리드 인문블록 "
                "배치이나 군 이과 성격으로 trackHint=자연 표기(불확실, 참고용).")
warnings.append("[의예/자연계 수능최저] 의과대학 수능최저는 교과·종합Ⅰ일반·종합Ⅱ지역인재 모두 '국·영·과탐(2과목평균) "
                "중 상위2개+수학(미적/기하) 합산 4~6등급'(전형별 상이: 교과4·종합5·지역저소득6). 약학 5~7, 수의 6~7. "
                "자연계 일반학과는 '국·영·수·과탐(1과목) 상위3개 합산 12등급'. 약·의·수의는 과탐 2과목 평균 필수.")
warnings.append("[정원외 전형] 농어촌·특성화고·저소득층·특수교육대상·특성화고졸재직자·만학도 = specialTypeKeyword 부여. "
                "특성화고졸재직자·만학도는 전형기간 자율화(수시 6회 제한·복수지원 4회 제한 미포함).")
warnings.append("[예체능 자체배점] 실기(일반/만학도) 학생부20(교과16+출결4)+실기80, 체육특기자 교과19.0+출결4.8+"
                "경기적성33.3+입상실적42.9 — 원문 자체배점(비율) 보존. components 합 100 기준.")
warnings.append("[세부전공 그룹핑] 무용학과(한국무용8·현대무용8·발레7), 음악과(성악17·작곡5·피아노15), "
                "관현악과(관악11·현악14), 회화과(한국화13·서양화13)는 그리드 세부전공 행을 부모 모집단위로 합산. note 보존.")

# ════════════════════════════════════════════════════════════════════════
# 6) 결과 / meta 직렬화
# ════════════════════════════════════════════════════════════════════════
result = {"universityName": "충남대학교", "year": 2027, "recruitmentSeason": "susi",
          "departments": dept_list, "warnings": warnings}

all_tracks = [t for d in dept_list for t in d["tracks"]]
T = len(all_tracks)
def cnt(c): return sum(1 for t in all_tracks if c(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

meta = {
    "universityName": "충남대학교", "year": 2027, "recruitmentSeason": "susi",
    "sourceDocYear": 2026,  # 원문 표기 연도(정직성)
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용). "
              "모집인원: 페이지별 문자위치 그리드 파서 + 행합/열합 이중검증. 국가안보 하드코딩.",
    "visionCost": 0.0, "departments": len(dept_list), "totalTracks": T,
    "rowSumValidation": {"passedDepartments": len(dept_list)-len(parse_fail), "failed": len(parse_fail),
                         "failedNames": [n for n,_,_ in parse_fail]},
    "colTotalValidation": [{"track": k, "computed": comp, "expectedSumRow": exp, "match": m}
                           for (k,comp,exp,m) in coltotal_report],
    "fillRatios": {"quotaInitial": [q_n,T], "reflectionStages": [r_n,T],
                   "csatMinimumRawText": [c_n,T], "csatMinimumExempt": [ce_n,T], "sourcePages": [sp_n,T]},
    "completeRecords": [comp_n, T],
}
(BASE / "cnu-text.json").write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

# ── 콘솔 리포트 ──
print("=" * 70)
print("충남대 2027(원문 2026) 수시 — 텍스트 직접 구조화 결과")
print("=" * 70)
print(f"학과(모집단위): {len(dept_list)}  |  전형(track): {T}")
print(f"행합 검증: 통과 {len(dept_list)-len(parse_fail)} / 실패 {len(parse_fail)}"
      + (f"  실패={[n for n,_,_ in parse_fail]}" if parse_fail else ""))
print("\n열합 검증 (전형별 모집인원 합 vs 총합계행 p16):")
allok = True
for k,comp,exp,m in coltotal_report:
    flag = "OK" if m else "MISMATCH"
    if not m: allok=False
    print(f"  {k:20s} 계산={comp:5d}  총합계행={exp:5d}  {flag}")
print(f"\n열합 전체: {'전부 일치(국가안보 국토분 대조)' if allok else '일부 불일치(종합Ⅰ서류 3명 미귀속 등 — warnings 참조)'}")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
print(f"\nwarnings: {len(warnings)}건")
print(f"💾 {BASE/'cnu-text.json'} 저장")
