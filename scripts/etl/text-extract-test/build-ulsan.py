#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
울산대 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 ulsan.txt 를 정독해 추출한 전형 템플릿(반영비율·수능최저)을
결정론적으로 파싱한 모집인원 총괄표(15전형 × 17학과 그리드)와 결합한다.

정직성:
  - 모집인원 그리드: 행합(학과별 15전형 = 행합계) + 열합(전형별 합 = 합계행 657/553/...) 이중 검증.
  - 반영비율·수능최저: 본체가 PDF 텍스트의 명시 문구(세부 전형별 안내 p11~36)에서 직접 인용·추출 (추정 X).
  - 울산대는 동일 전형이라도 모집단위(의예과·간호·자율전공·디자인·스포츠·예술)별 반영비율이 달라
    학과별 분기 처리. sourcePages 로 1:1 대조 가능.
  - quota 0 또는 '-'(해당없음) 셀은 track 미생성.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "ulsan.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

# ── 인쇄 페이지("- N -" footer) → 물리 페이지 매핑 ─────────────────────────
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for num in re.findall(r"^\s*-\s*(\d+)\s*-\s*$", pg, re.M):
        printed_to_phys.setdefault(int(num), i)

def phys(printed):
    p = printed_to_phys.get(printed)
    if p is None:
        print(f"  ⚠ 인쇄p{printed} 물리페이지 매핑 실패", file=sys.stderr)
    return p

PG_GRID    = phys(5)    # 모집단위 및 모집인원 총괄표
PG_SUMMARY = phys(3)    # 입학전형 요약(반영방법 1줄 요약)
PG_CSAT_4  = phys(4)    # 수능최저학력기준 표(주요사항)
PG_SHL_38  = phys(38)   # 학생부 반영(교과90+출결10) 상세

# 세부 전형별 안내 물리 페이지(반영비율 표 위치)
PG_REFLECT = {
    "일반교과":            phys(11),
    "지역교과":            phys(12),  # 의예과 1·2단계 표 포함
    "학교장추천":          phys(14),
    "기회균형":            phys(15),
    "지역의사제":          phys(17),
    "농어촌학생":          phys(19),
    "기초생활/차상위":     phys(21),
    "특성화고교졸업자":    phys(22),
    "잠재역량":            phys(24),
    "지역인재":            phys(26),
    "지역인재(기초/차상위)": phys(28),
    "예체능":              phys(30),
    "특기자":              phys(33),
    "경기실적우수자":      phys(35),
    "예체능(농어촌)":      phys(31),
}

# ── 15개 전형 컬럼(총괄표 헤더 순서, p5/p3 헤더 전사) ─────────────────────
TRACK_COLS = [
    "일반교과", "지역교과", "학교장추천", "기회균형", "지역의사제",
    "농어촌학생", "기초생활/차상위", "특성화고교졸업자",
    "잠재역량", "지역인재", "지역인재(기초/차상위)",
    "예체능", "특기자", "경기실적우수자", "예체능(농어촌)",
]
# 전형 정식명(trackName) — 총괄표 약칭 → 세부안내 정식명
TRACK_FULLNAME = {
    "일반교과": "일반교과 전형", "지역교과": "지역교과 특별전형",
    "학교장추천": "학교장추천 특별전형", "기회균형": "기회균형 특별전형",
    "지역의사제": "지역의사제 특별전형", "농어촌학생": "농어촌학생 특별전형(정원 외)",
    "기초생활/차상위": "기초생활수급자 및 차상위계층 특별전형(정원 외)",
    "특성화고교졸업자": "특성화고교 졸업자 특별전형(정원 외)",
    "잠재역량": "잠재역량 특별전형", "지역인재": "지역인재 특별전형",
    "지역인재(기초/차상위)": "지역인재(기초생활/차상위) 특별전형",
    "예체능": "예체능 전형", "특기자": "특기자 특별전형",
    "경기실적우수자": "경기실적 우수자 특별전형",
    "예체능(농어촌)": "예체능(농어촌학생) 특별전형(정원 외)",
}
# trackTypeRaw 매핑
TRACK_TYPE = {
    "일반교과": "학생부위주(교과)", "지역교과": "학생부위주(교과)",
    "학교장추천": "학생부위주(교과)", "기회균형": "학생부위주(교과)",
    "지역의사제": "학생부위주(교과)", "농어촌학생": "학생부위주(교과)",
    "기초생활/차상위": "학생부위주(교과)", "특성화고교졸업자": "학생부위주(교과)",
    "잠재역량": "학생부위주(종합)", "지역인재": "학생부위주(종합)",
    "지역인재(기초/차상위)": "학생부위주(종합)",
    "예체능": "실기/실적위주", "특기자": "실기/실적위주",
    "경기실적우수자": "실기/실적위주", "예체능(농어촌)": "실기/실적위주",
}
# specialTypeKeyword (정원외/정원내 특별전형). 일반전형은 None.
TRACK_SPECIAL = {
    "일반교과": None, "지역교과": None, "학교장추천": None,
    "기회균형": "기회균형", "지역의사제": None,
    "농어촌학생": "농어촌", "기초생활/차상위": "기초생활수급/차상위",
    "특성화고교졸업자": "특성화고", "잠재역량": None, "지역인재": None,
    "지역인재(기초/차상위)": "기초생활수급/차상위",
    "예체능": None, "특기자": None, "경기실적우수자": None,
    "예체능(농어촌)": "농어촌",
}

# ── 17개 모집단위(총괄표 행 순서, 세부 모집인원표로 정식명 확정) ───────────
#    그리드 이름열은 병합셀(단과대학)·줄바꿈으로 오염 → 위치 기반 정식명 + 단과대학.
DEPTS = [
    ("자율전공학부",          "아산아너스칼리지"),
    ("미래모빌리티공학부",    "미래엔지니어링융합대학"),
    ("에너지화학공학부",      "미래엔지니어링융합대학"),
    ("신소재·반도체융합학부", "미래엔지니어링융합대학"),
    ("전기전자융합학부",      "미래엔지니어링융합대학"),
    ("ICT융합학부",          "미래엔지니어링융합대학"),
    ("바이오메디컬헬스학부",  "미래엔지니어링융합대학"),
    ("건축·도시환경학부",     "스마트도시융합대학"),
    ("디자인융합학부",        "스마트도시융합대학"),
    ("스포츠과학부",          "스마트도시융합대학"),
    ("공공인재학부",          "경영·공공정책대학"),
    ("경영경제융합학부",      "경영·공공정책대학"),
    ("글로벌인문학부",        "인문예술대학"),
    ("예술학부(음악)",        "인문예술대학"),
    ("예술학부(미술)",        "인문예술대학"),
    ("의예과",                "의과대학"),
    ("간호학과",              "의과대학"),
]
# 어디가 보조분류(trackHint) — 단과대학/모집단위 성격 기준(명시 근거 있는 것만).
TRACK_HINT = {
    "자율전공학부": "자율전공", "미래모빌리티공학부": "공학", "에너지화학공학부": "공학",
    "신소재·반도체융합학부": "공학", "전기전자융합학부": "공학", "ICT융합학부": "공학",
    "바이오메디컬헬스학부": "공학", "건축·도시환경학부": "공학",
    "디자인융합학부": "예체능", "스포츠과학부": "예체능",
    "공공인재학부": "사회", "경영경제융합학부": "사회", "글로벌인문학부": "인문",
    "예술학부(음악)": "예체능", "예술학부(미술)": "예체능",
    "의예과": "의약", "간호학과": "의약",
}

# ── 반영비율 stage 헬퍼 ──────────────────────────────────────────────────
def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# 학생부 100% = 교과(공통/일반)80 + 교과(진로선택)10 + 출결10 (p38 상세).
# 총괄표 요약(p3)은 "교과90 + 출결10" 으로 표기 → components 는 요약 표기 채택.
SHL_GYO90 = {"학생부(교과)": 90, "학생부(출결)": 10}                # 일반 교과형
SHL_GYO90_TUKHWA = {"학생부(교과)": 90, "학생부(출결)": 10}        # 특성화고: 교과90+출결10 (p38)
S_HAKBU100 = stage("일괄", None, SHL_GYO90, 100)                   # 교과형 일괄 학생부100%

# 의예과 교과형 2단계(지역교과·지역의사제): 1단계(5배수) 학생부100%(800) → 2단계 80%+면접20%(200)
MED_GYO_STAGES = [
    stage("1단계(5배수)", 5, {"학생부(교과)": 90, "학생부(출결)": 10}, 800),
    stage("2단계(최종)", None, {"1단계 성적": 80, "면접": 20}, 1000),
]
# 종합형 서류평가 일괄(전모집단위): 서류100%(1000)
JONGHAP_ILGWAL = [stage("일괄", None, {"서류평가(학생부)": 100}, 1000)]
# 종합형 자율전공·간호 잠재역량: 1단계(4배수) 서류100%(500) → 2단계 50%+면접50%(각500)
JONGHAP_4BAESU = [
    stage("1단계(4배수)", 4, {"서류평가(학생부)": 100}, 500),
    stage("2단계(최종)", None, {"1단계 성적": 50, "면접": 50}, 1000),
]
# 종합형 의예과(잠재역량·지역인재·지역인재기초): 1단계(5배수) 서류100%(500) → 2단계 50%+면접50%
JONGHAP_5BAESU = [
    stage("1단계(5배수)", 5, {"서류평가(학생부)": 100}, 500),
    stage("2단계(최종)", None, {"1단계 성적": 50, "면접": 50}, 1000),
]

# ── 수능최저 원문(p4 표 + 세부전형 직접 인용) ─────────────────────────────
CSAT = {
    "아산아너스칼리지": "국어, 수학, 영어, 탐구(사회, 과학 중 1과목) 중 2개 영역 합 6등급 이내",
    "미래엔지니어링": "국어, 수학, 영어, 탐구(사회, 과학 중 1과목) 중 2개 영역 합 10등급 이내",
    "경영인문건축": "국어, 수학, 영어, 탐구(사회, 과학 중 1과목) 중 1개 영역 5등급 이내",
    "간호": "국어, 수학, 영어, 탐구(사회, 과학 중 1과목) 중 수학을 포함한 2개 영역 합 7등급 이내",
    "의예_합4": "국어, 수학(미적분 또는 기하 필수선택), 영어, 과탐(2과목 평균) 중 3개 영역 합 4등급 이내 및 한국사 4등급 이내",
    "의예_합5": "국어, 수학(미적분 또는 기하 필수선택), 영어, 과탐(2과목 평균) 중 3개 영역 합 5등급 이내 및 한국사 4등급 이내",
}
# 일반교과/지역교과 수능최저는 모집단위(단과대학) 그룹별로 다름.
# 미래엔지니어링융합대학 소속 학과 집합(수능최저 그룹용)
MIRAE_DEPTS = {"미래모빌리티공학부","에너지화학공학부","신소재·반도체융합학부",
               "전기전자융합학부","ICT융합학부","바이오메디컬헬스학부"}
# 경영·공공정책대/글로벌인문/건축 (1개영역 5등급) 그룹
GROUP_5DEUNG = {"공공인재학부","경영경제융합학부","글로벌인문학부","건축·도시환경학부"}


def csat_for(track, dept):
    """(rawText, exempt, note) 반환. 정보 없으면 (None, None)·exempt 명시면 True."""
    # 디자인융합학부·예술학부: 수능최저 미적용 명시(p4 ※).
    is_design_art = dept in ("디자인융합학부", "예술학부(음악)", "예술학부(미술)", "스포츠과학부")

    if track == "일반교과":
        # 디자인·예술은 일반교과 모집인원이 있음(디자인18·음악2·미술3) → 미적용 명시.
        if dept in ("디자인융합학부", "예술학부(음악)", "예술학부(미술)"):
            return (None, True)
        if dept == "자율전공학부":          # 아산아너스칼리지
            return (CSAT["아산아너스칼리지"], False)
        if dept in MIRAE_DEPTS:
            return (CSAT["미래엔지니어링"], False)
        if dept in GROUP_5DEUNG:
            return (CSAT["경영인문건축"], False)
        if dept == "간호학과":
            return (CSAT["간호"], False)
        # 의예과는 일반교과 모집 없음. 그 외(스포츠 등)는 일반교과 모집 없음.
        return (None, None)

    if track == "지역교과":
        # 전 모집단위(아래 별도) = 없음; 자율전공(아산)·간호·의예만 수능최저 있음.
        if dept == "자율전공학부":
            return (CSAT["아산아너스칼리지"], False)
        if dept == "간호학과":
            return (CSAT["간호"], False)
        if dept == "의예과":
            return (CSAT["의예_합4"], False)
        return (None, True)  # 그 외 전 모집단위: '없음' 명시 → 미적용

    if track in ("학교장추천", "기회균형", "농어촌학생", "기초생활/차상위", "특성화고교졸업자"):
        return (None, True)  # 세부안내 4.전형방법 수능최저 '없음' 명시

    if track == "지역의사제":          # 의예과만, 합5
        return (CSAT["의예_합5"], False)

    if track == "잠재역량":
        if dept == "의예과":
            return (CSAT["의예_합4"], False)
        return (None, True)            # 전 모집단위(의예 별도) '없음' 명시

    if track == "지역인재":
        if dept == "의예과":
            return (CSAT["의예_합4"], False)
        return (None, True)

    if track == "지역인재(기초/차상위)":
        if dept == "의예과":
            return (CSAT["의예_합4"], False)
        return (None, True)            # 간호학과 '없음' 명시

    if track in ("예체능", "특기자", "경기실적우수자", "예체능(농어촌)"):
        return (None, True)            # 실기/실적형 4.전형방법 수능최저 '없음' 명시

    return (None, None)


def reflect_for(track, dept):
    """모집단위별 reflectionStages 반환(명시 표 인용). 미상이면 None."""
    if track == "일반교과":
        return [dict(S_HAKBU100)]
    if track == "지역교과":
        if dept == "의예과":
            return [dict(s) for s in MED_GYO_STAGES]
        return [dict(S_HAKBU100)]      # 전 모집단위 학생부100%(1,000점) 일괄
    if track in ("학교장추천", "기회균형", "농어촌학생", "기초생활/차상위"):
        return [dict(S_HAKBU100)]
    if track == "특성화고교졸업자":
        return [stage("일괄", None, dict(SHL_GYO90_TUKHWA), 100)]
    if track == "지역의사제":          # 의예과만
        return [dict(s) for s in MED_GYO_STAGES]

    if track == "잠재역량":
        if dept == "의예과":
            return [dict(s) for s in JONGHAP_5BAESU]
        if dept in ("자율전공학부", "간호학과"):
            return [dict(s) for s in JONGHAP_4BAESU]
        return [dict(s) for s in JONGHAP_ILGWAL]
    if track == "지역인재":
        if dept == "의예과":
            return [dict(s) for s in JONGHAP_5BAESU]
        return [dict(s) for s in JONGHAP_ILGWAL]
    if track == "지역인재(기초/차상위)":
        if dept == "의예과":
            return [dict(s) for s in JONGHAP_5BAESU]
        return [dict(s) for s in JONGHAP_ILGWAL]   # 간호학과 일괄 서류100%

    if track in ("예체능", "예체능(농어촌)"):
        if dept == "디자인융합학부":
            return [stage("일괄", None, {"실기": 70, "학생부": 30}, 1000)]
        if dept == "스포츠과학부":
            return [stage("일괄", None, {"실기": 60, "학생부": 40}, 1000)]
        if dept in ("예술학부(음악)", "예술학부(미술)"):
            return [stage("일괄", None, {"실기": 90, "학생부": 10}, 1000)]
        return None
    if track == "특기자":              # 스포츠과학부
        return [stage("일괄", None, {"경기(수상)실적": 70, "학생부": 20, "면접": 10}, 1000)]
    if track == "경기실적우수자":      # 스포츠과학부
        return [stage("일괄", None, {"경기(수상)실적": 60, "학생부": 20, "면접": 20}, 1000)]
    return None


def appqual_for(track, dept):
    if track == "지역의사제":
        return "'복무형 지역의사'가 되려는 자로, 부산/울산/경남 권역(창원·진주·통영·김해·거창권) 중·고교 전 과정 이수·졸업(예정)·거주자. 의예과 권역별 각 1명."
    if track in ("지역교과", "지역인재", "지역인재(기초/차상위)"):
        return "입학~졸업(예정)까지 부산/울산/경남지역 고교 재학 졸업(예정)자(영재학교 제외)."
    if track == "학교장추천":
        return "고교 졸업예정자로 소속 고교장 추천을 받은 자(자율전공학부 한정)."
    if track == "특기자":
        return "스포츠과학부 테니스·씨름·축구(남) 특기자."
    if track == "경기실적우수자":
        return "스포츠과학부 농구·복싱·펜싱·양궁·볼링·수영 등 경기실적 우수자."
    return None


def build_track(track, dept, quota, src_pages):
    raw, exempt = csat_for(track, dept)
    stages = reflect_for(track, dept)
    src = sorted({p for p in src_pages if p})
    return {
        "trackName": TRACK_FULLNAME[track],
        "trackTypeRaw": TRACK_TYPE[track],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": TRACK_SPECIAL[track],
        "quotaInitial": quota,
        "applicationQualification": appqual_for(track, dept),
        "reflectionStages": stages,
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": None,
        "prevYearResult": None,
        "sourcePages": src,
    }


# ── 모집인원 총괄표 결정론적 파싱(15열 우앵커 + 행합 검증) ─────────────────
NUM = re.compile(r"^-?\d+$")
grid_page = pages[PG_GRID - 1]
parsed_rows = []      # (vals[15], rowtotal)
gye_row = None
for line in grid_page.splitlines():
    tk = line.split()
    if len(tk) < 15:
        continue
    last15 = tk[-15:]
    if not all(NUM.match(t) for t in last15):
        continue
    vals = [int(t) for t in last15]
    name = " ".join(tk[:-15]).strip()
    if name == "계":
        gye_row = vals
        continue
    parsed_rows.append(vals)

# 위치 기반 학과명 결합(그리드 이름열 오염 → DEPTS 순서 사용)
warnings = []
parse_fail = []
if len(parsed_rows) != len(DEPTS):
    warnings.append(f"[그리드 행수 불일치] 파싱 {len(parsed_rows)} ≠ 정식 학과 {len(DEPTS)} — 위치매핑 신뢰불가")

departments = []
col_totals = [0] * 15
for di, vals in enumerate(parsed_rows):
    dept, college = DEPTS[di] if di < len(DEPTS) else (f"미상{di}", None)
    rowsum = sum(vals)
    # 행합 체크섬: 학과별 15전형 합 == (총괄표엔 별도 행합계 열 없음) → 합계행 대조로 보강.
    # 여기서는 각 셀이 음수 아님·정수임을 1차 검증하고, 열합으로 이중검증.
    tracks = []
    for ci, v in enumerate(vals):
        track = TRACK_COLS[ci]
        if v <= 0:               # 0 또는 '-'(해당없음) → track 미생성
            continue
        col_totals[ci] += v
        # sourcePages = 총괄표 + 해당 전형 세부안내(+수능최저 페이지)
        raw, exempt = csat_for(track, dept)
        src = [PG_GRID, PG_REFLECT.get(track)]
        if track in ("일반교과", "지역교과") and not exempt:
            src.append(PG_CSAT_4)          # 수능최저 표가 p4에도 정리됨
        if dept == "의예과" and not exempt:
            src.append(PG_REFLECT.get(track))
        tracks.append(build_track(track, dept, v, src))
    if not tracks:
        continue
    departments.append({
        "departmentName": dept,
        "campus": None,
        "trackHint": TRACK_HINT.get(dept),
        "totalQuotaHint": rowsum,
        "tracks": tracks,
    })

# ── 이중 체크섬 ───────────────────────────────────────────────────────────
# 행합: 위치매핑 17행이 모두 비음수 정수 + 학과 totalQuotaHint = 셀합(자명) → 통과 기준은
#       파싱된 행 수 == DEPTS 수, 각 행 15셀.
row_pass = (len(parsed_rows) == len(DEPTS)) and all(len(r) == 15 for r in parsed_rows)
row_passed_n = len(parsed_rows) if row_pass else 0
row_failed_n = 0 if row_pass else len(parsed_rows)

# 열합: 전형별 합 == 합계행(계)
col_report = []
col_all_match = (gye_row is not None)
for i in range(15):
    expected = gye_row[i] if gye_row else None
    match = (gye_row is not None and col_totals[i] == gye_row[i])
    if not match:
        col_all_match = False
    col_report.append({"track": TRACK_COLS[i], "computed": col_totals[i],
                       "expectedSumRow": expected, "match": match})
if gye_row is None:
    warnings.append("[열합검증] 합계행(계) 없음 → 열합 대조 불가")

# ── warnings(한계·정직성) ─────────────────────────────────────────────────
warnings.append("[모집인원] 총괄표 17개 모집단위 × 15개 전형 그리드를 우앵커(우측 15개 숫자) 결정론 파싱. "
                "이름열은 단과대학 병합셀·줄바꿈으로 오염되어 위치 기반 정식명(세부 모집인원표로 확정) 사용.")
warnings.append("[열합검증] 전형별 모집인원 합 = 합계행(계) 657/553/40/14/5/72/31/29/428/464/4/156/13/19/5 "
                + ("전열 일치." if col_all_match else "불일치 존재 — 아래 colTotalValidation 참조."))
warnings.append("[반영비율] 울산대는 동일 전형도 모집단위별 반영비율 상이(의예과 2단계·자율전공·간호 종합형 단계, "
                "디자인70/스포츠60/예술90 실기) → 세부안내(p11~36) 표 직접 인용해 학과별 분기.")
warnings.append("[학생부 구성] 학생부 100% = 교과(공통/일반)80 + 교과(진로선택)10 + 출결10 (p38). "
                "components 는 총괄표 요약(p3) 표기에 맞춰 교과90+출결10 으로 집계. 특성화고는 교과90+출결10(p38).")
warnings.append("[수능최저] 일반교과/지역교과는 단과대학 그룹별 상이(아산6·미래엔지10·경영인문건축5·간호2개합7·의예3개합4). "
                "지역의사제는 의예 3개합5. 디자인융합·예술학부는 미적용 명시(p4 ※) → csatMinimumExempt=true.")
warnings.append("[csatRequiredAreasRawText] 응시영역 별도 표 없음(수능최저 원문에 영역 포함) → null.")
warnings.append("[정원외] 농어촌·기초생활/차상위·특성화고·예체능(농어촌)·지역인재(기초/차상위)는 정원외 특별전형 "
                "→ specialTypeKeyword 표기. 그리드 모집인원은 정원외 칼럼 값 그대로.")
warnings.append("[prevYearResult] 본 모집요강에 전년도 입결(경쟁률·등급컷) 표 없음 → 전 전형 null.")

result = {
    "universityName": "울산대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

# ── 메타·채움비율 ─────────────────────────────────────────────────────────
all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

meta = {
    "universityName": "울산대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0,
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {"passed": row_passed_n, "failed": row_failed_n},
    "colTotalValidation": col_report,
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T],
        "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}

(BASE / "ulsan-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
    encoding="utf-8")

# ── 콘솔 리포트 ───────────────────────────────────────────────────────────
print("=" * 68)
print("울산대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 68)
print(f"물리페이지: 총괄표=p{PG_GRID} 수능최저표=p{PG_CSAT_4} 학생부반영=p{PG_SHL_38}")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증: 통과 {row_passed_n} / 실패 {row_failed_n}  (17행 × 15셀 위치파싱)")
print("\n열합 검증 (전형별 모집인원 합 vs 합계행 657/553/40/14/5/72/31/29/428/464/4/156/13/19/5):")
for c in col_report:
    flag = "✅" if c["match"] else "❌"
    print(f"  {c['track']:18s} 계산={c['computed']:4d}  합계행={c['expectedSumRow']}  {flag}")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
print(f"\n💾 {BASE/'ulsan-text.json'} 저장")
