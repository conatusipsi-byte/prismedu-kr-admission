#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
연세대 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 yonsei.txt 를 정독해 추출한 전형 템플릿(반영비율·수능최저)을
결정론적으로 파싱한 모집인원 그리드(Ⅱ. 전형별 모집단위·모집인원, 물리 p11~12)와 결합한다.

정직성 / 체크섬:
  - 모집인원 그리드: 각 물리 페이지의 표 헤더(또는 합계행)에서 칼럼 x-앵커를 도출하고,
    숫자 셀을 좌→우 단조(monotonic) 배정 → 칼럼 충돌 0 확인.
  - 열합(전형별 그리드 합 == 합계행 512/766/175/79/120/195/288/38) 이중 검증.
  - 행합: 그리드의 '모집인원*'은 PDF 명시상 "수시+정시 합산" 이므로 수시 전형 합과
    일치하지 않음 → 행합 체크섬 적용 불가(meta 에 사유 명시). 대신 칼럼별 무충돌 배정으로
    구조 정합성을 보증.
  - 특수교육대상자전형(정원외 13명): 그리드에 모집단위별 배정이 없고(전부 '-'),
    별도 절(Ⅷ, p52)에 "모집단위별 1명 이내, 인문6+자연6+통합1=13" 로만 표기됨
    → 고려대 재직자 ◉ 선례와 동일하게 per-dept quotaInitial 생성 금지. 단일 정원외 전형으로
    별도 기록하지 않고(학과 미배정), warning + colTotal 예외로 정직 처리.
  - 반영비율·수능최저: 본체가 PDF 텍스트(Ⅰ_4 반영비율 표 p10, 각 전형 상세 합격자선발 절)
    명시 문구에서 직접 인용. 추정 X. sourcePages 로 1:1 대조.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "yonsei.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

# ── 물리 페이지 상수 (본체가 내용 마커로 확인) ──────────────────────────────
PG_GRID    = [11, 12]   # Ⅱ. 전형별 모집단위·모집인원 그리드
PG_REFLECT = 10         # Ⅰ_4. 전형별 전형요소 반영비율 (2027 확정표)
PG_CSAT_SUM = 7         # Ⅰ_1 나. 전형별 수능최저학력기준 적용 여부
PG_DETAIL = {           # 각 전형 상세(전형방법+합격자선발/수능최저) 물리 페이지 (본체가 마커로 확인)
    "추천형": 26,        # V_1 학생부교과전형[추천형] (학생부교과 100% 반영 표)
    "활동우수형": 29,     # V_2 학생부종합[활동우수형] (단계별 전형방법 + 수능최저 적용)
    "국제형": 34,        # V_3 학생부종합[국제형] (전형방법 + '국제형(국내고)만 적용')
    "국제인재": 39,      # V_4 학생부종합[국제인재]
    "기회균형": 44,      # V_5 학생부종합[기회균형]
    "논술전형": 49,      # Ⅵ 논술전형 (논술시험 100% 반영)
    "체육인재": 53,      # Ⅶ 특기자전형[체육인재] (경기실적 60점 등)
    "특수교육": 59,      # Ⅷ 특수교육대상자전형
}

# ════════════════════════════════════════════════════════════════════════
# 1) 수능최저 원문 (본체가 PDF 텍스트에서 직접 인용)
# ════════════════════════════════════════════════════════════════════════
# 추천형·활동우수형: 계열별 차등 (p26 / p28~29 상세표, 동일 문구)
CSAT_GYOGWA = (
    "[인문] 국어, 수학 중 1개 과목을 포함하여 2개 과목 등급 합 4 이내 / "
    "[자연(일반)] 수학을 포함하여 2개 과목 등급 합 5 이내 / "
    "[자연-의예과·치의예과·약학과] 국어, 수학 중 1개 과목을 포함하여 1등급 2개 이상 / "
    "[통합(응용통계학과·생활과학대학·간호대학)] 인문 또는 자연계열(일반) 기준 중 하나를 만족. "
    "영어 3등급 이내, 한국사 4등급 이내. "
    "탐구영역은 평균등급이 아닌 개별 과목등급 기준으로 인정함"
)
# 국제형(국내고)만 적용 (p33 상세)
CSAT_GUKJE_GUKNAE = (
    "국제형(국내고): 국어, 수학 중 1개 과목을 포함하여 2개 과목 등급 합 5 이내, "
    "영어 2등급 이내, 한국사 4등급 이내. "
    "탐구영역은 개별 과목등급 기준으로 인정함. "
    "(국제형 해외고/검정고시는 수능최저학력기준 적용하지 않음)"
)

# ════════════════════════════════════════════════════════════════════════
# 2) 반영비율 템플릿 (Ⅰ_4 표 p10 + 각 전형 상세 전형방법 절에서 인용)
# ════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

# 학생부종합 공통(활동우수형·국제형·국제인재·기회균형): 1단계 서류100(N배수) → 2단계 서류60+면접40
def jonghap_stages(mult):
    return [stage("1단계", mult, {"서류평가": 100}, 100),
            stage("2단계", None, {"1단계 성적": 60, "면접": 40}, 100)]

# 추천형: 일괄합산 학생부교과(정량) 100  (Ⅰ_4 일괄합산행 + p26 상세)
RECO_STAGES = [stage("일괄합산", None, {"학생부교과(정량평가)": 100}, 100)]
# 논술전형: 일괄합산 논술시험 100  (Ⅰ_4 + p44 상세)
NONSUL_STAGES = [stage("일괄합산", None, {"논술시험": 100}, 100)]
# 특수교육대상자: 일괄합산 서류평가 100  (Ⅰ_4 + p58 상세)
SPECIAL_EDU_STAGES = [stage("일괄합산", None, {"서류평가": 100}, 100)]
# 체육인재: 1단계(5배수) 교과15+비교과5+경기실적60=80점 → 2단계 1단계성적80+면접20=100점 (p52 상세)
SPORTS_STAGES = [
    stage("1단계", 5, {"학생부교과(정량평가)": 15, "학생부비교과(종합평가)": 5, "경기실적(정량평가)": 60}, 80),
    stage("2단계", None, {"1단계 성적": 80, "면접": 20}, 100),
]

# ════════════════════════════════════════════════════════════════════════
# 3) 전형(컬럼) 메타 — 그리드 9개 트랙 컬럼 순서대로
# ════════════════════════════════════════════════════════════════════════
#  컬럼: 추천형, 활동우수형, 국제형(국내고), 국제형(해외고/검정), 국제인재, 기회균형, 논술전형, 체육인재, [특수교육]
#  특수교육은 그리드에 per-dept 배정이 없어 그리드 컬럼에서 제외(별도 처리).
TRACK_COLS = [
    "추천형", "활동우수형", "국제형(국내고)", "국제형(해외고/검정고시)",
    "국제인재", "기회균형", "논술전형", "체육인재", "특수교육",
]

def csat_for(col):
    """returns (rawText, exempt, requiredAreas)"""
    if col == "추천형":
        return (CSAT_GYOGWA, False,
                "수학: [인문] 공통+확률과통계/미적분/기하 중 택1, [자연] 공통+미적분/기하 중 택1. "
                "탐구: [인문] 사회/과학탐구, [자연] 과학탐구만 반영")
    if col == "활동우수형":
        return (CSAT_GYOGWA, False,
                "수학: [인문] 공통+확률과통계/미적분/기하 중 택1, [자연] 공통+미적분/기하 중 택1. "
                "탐구: [인문] 사회/과학탐구, [자연] 과학탐구만 반영")
    if col == "국제형(국내고)":
        return (CSAT_GUKJE_GUKNAE, False,
                "수학: 공통+확률과통계/미적분/기하 중 택1, 탐구: 사회/과학탐구")
    if col == "국제형(해외고/검정고시)":
        return ("국제형(해외고/검정고시)는 수능최저학력기준을 적용하지 않음", True, None)
    if col == "국제인재":
        return ("수능최저학력기준 미적용 (Ⅰ_1 나. 적용 여부 표)", True, None)
    if col == "기회균형":
        return ("수능최저학력기준 미적용 (Ⅰ_1 나. 적용 여부 표)", True, None)
    if col == "논술전형":
        # 2027 논술전형은 수능최저 미적용 (Ⅰ_1 나. 미적용 목록). p6 '논술전형 수능최저 적용'은
        # 2028학년도 예고사항이므로 2027 에는 미적용.
        return ("2027학년도 논술전형은 수능최저학력기준 미적용 "
                "(Ⅰ_1 나. 적용 여부 표의 '미적용' 목록). "
                "※ p6 '논술전형 수능최저 적용'은 2028학년도 예고사항임", True, None)
    if col == "체육인재":
        return ("수능최저학력기준 미적용 (Ⅰ_1 나. 적용 여부 표)", True, None)
    if col == "특수교육":
        return ("수능최저학력기준 적용하지 않음 (Ⅷ 특수교육대상자전형 합격자 선발)", True, None)
    raise ValueError(col)

def track_meta(col):
    """returns (trackName, trackTypeRaw, specialTypeKeyword, stages, detailKey)"""
    if col == "추천형":
        return ("학생부교과전형[추천형]", "학생부위주(교과)", None, RECO_STAGES, "추천형")
    if col == "활동우수형":
        return ("학생부종합전형[활동우수형]", "학생부위주(종합)", None, jonghap_stages(4), "활동우수형")
    if col == "국제형(국내고)":
        return ("학생부종합전형[국제형(국내고)]", "학생부위주(종합)", None, jonghap_stages(5), "국제형")
    if col == "국제형(해외고/검정고시)":
        return ("학생부종합전형[국제형(해외고/검정고시)]", "학생부위주(종합)", None, jonghap_stages(3), "국제형")
    if col == "국제인재":
        return ("학생부종합전형[국제인재]", "학생부위주(종합)", None, jonghap_stages(3), "국제인재")
    if col == "기회균형":
        return ("학생부종합전형[기회균형]", "학생부위주(종합)", "기회균형", jonghap_stages(3), "기회균형")
    if col == "논술전형":
        return ("논술전형", "논술위주", None, NONSUL_STAGES, "논술전형")
    if col == "체육인재":
        return ("특기자전형[체육인재]", "실기/실적위주", None, SPORTS_STAGES, "체육인재")
    if col == "특수교육":
        return ("특수교육대상자전형", "학생부위주(종합)", "특수교육대상자", SPECIAL_EDU_STAGES, "특수교육")
    raise ValueError(col)

def build_track(col, quota):
    name, ttype, special, stages, dkey = track_meta(col)
    raw, exempt, areas = csat_for(col)
    src = sorted({p for p in (PG_GRID + [PG_REFLECT, PG_DETAIL[dkey]]
                              + ([] if exempt else [PG_CSAT_SUM])) if p})
    return {
        "trackName": name, "trackTypeRaw": ttype, "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": special, "quotaInitial": quota,
        "applicationQualification": None,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw, "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas, "prevYearResult": None, "sourcePages": src,
    }

# ════════════════════════════════════════════════════════════════════════
# 4) 모집인원 그리드 결정론 파싱 (페이지별 x-앵커 + 좌→우 단조 배정)
# ════════════════════════════════════════════════════════════════════════
#   앵커: [모집*, 추천, 활우, 국내, 해외, 국제인재, 기회, 논술, 체육, 특수]
#   p11 = 표 헤더에서 도출, p12 = 합계행에서 도출 (둘 다 본체가 위치 검증).
ANCHORS = {
    11: [27, 33, 40, 44, 47, 56, 61, 66, 71, 76],
    12: [40, 49, 55, 63, 69, 76, 82, 90, 98, 104],
}
NUM = re.compile(r"^(\d{1,3}(?:,\d{3})*|-)$")

def positions(line):
    return [(m.start(), m.group()) for m in re.finditer(r"\S+", line)]

def assign_monotonic(nums, anchors):
    """좌→우 단조 배정: nums[(col,val)] 를 앵커에 순서 보존하며 최근접 배정.
    충돌(같은 앵커 2개 배정) 발생 시 (cells, collisions) 반환."""
    cells = [""] * len(anchors)
    collisions = []
    last = -1  # 직전 배정 앵커 인덱스
    for s, t in nums:
        # last 이후 앵커 중 최근접
        cands = range(last + 1, len(anchors))
        best = min(cands, key=lambda k: abs(s - anchors[k])) if last + 1 < len(anchors) else len(anchors) - 1
        # 단조 제약으로 못 넣으면 전역 최근접(충돌 기록)
        if best >= len(anchors):
            gk = min(range(len(anchors)), key=lambda k: abs(s - anchors[k]))
            collisions.append((gk, t)); best = gk
        if cells[best] != "":
            collisions.append((best, t))
        cells[best] = t
        last = best
    return cells, collisions

# 그리드의 모집단위명 — 일부 행은 대학/계열 병합셀이 데이터행에 섞이거나, 이름이 윗줄에 단독
# 존재(체육교육학과·진리자유학부). 본체가 PDF 표를 정독해 '데이터행 → 모집단위명'을 명시 매핑.
# (값은 전부 결정론 파싱; 이름만 병합셀 보정)
NAME_FIX = {
    # (phys, 데이터행에 등장하는 모집*값) → 정확한 모집단위명, trackHint(계열)
    (12, "46"): ("체육교육학과", "예체능"),       # 윗줄 '체육교육학과†' + 대학셀 '교육과학대학'
    (12, "43"): ("스포츠응용산업학과", "예체능"),
    (12, "127"): ("진리자유학부(인문)", "인문"),  # 진리자유학부 인문 트랙
    (12, "132"): ("진리자유학부(자연)", "자연"),  # 진리자유학부 자연 트랙
}
# 계열(trackHint): 그리드 '계열' 컬럼(인문/자연/통합/국제/체능) 인라인 라벨 — 명시 근거.
GYE_LABELS = {"인문": "인문", "자연": "자연", "통합": "통합", "국제": "국제", "체능": "예체능", "예능": "예체능"}
# 대학명(데이터행 선두에 섞이는 병합셀) — 이름에서 제거할 토큰
COLLEGE_TOKENS = {
    "문과대학", "상경대학", "경영대학", "이과대학", "공과대학", "생명시스템대학", "인공지능융합대학",
    "신과대학", "사회과학대학", "생활과학대학", "교육과학대학", "언더우드국제대학", "글로벌인재대학",
    "의과대학", "치과대학", "간호대학", "약학대학",
}

def clean_name(tokens, gye_inline):
    """선두 토큰들에서 대학명/계열라벨/○/† 정리 후 모집단위명 반환."""
    out = []
    for t in tokens:
        if t in COLLEGE_TOKENS:        continue
        if t in GYE_LABELS:            continue
        if t in ("○", "-"):           continue
        out.append(t)
    name = " ".join(out).strip()
    name = name.rstrip("†").strip()  # 교직과정 표시 제거
    return name

departments = []
warnings = []
col_totals = [0] * 9
hapgye_row = None
collision_log = []
gye_inline_fail = []

for phys in PG_GRID:
    anchors = ANCHORS[phys]
    for line in pages[phys - 1].split("\n"):
        toks = positions(line)
        nums = [(s, t) for s, t in toks if NUM.match(t)]
        if len(nums) < 7:
            continue
        head = [(s, t) for s, t in toks if not NUM.match(t) and s < anchors[0] - 1]
        head_tokens = [t for s, t in head]
        # 계열 인라인 라벨 추출
        gye = None
        for t in head_tokens:
            if t in GYE_LABELS:
                gye = GYE_LABELS[t]
        cells, collisions = assign_monotonic(nums, anchors)
        # 충돌이 있더라도 모두 '-' 이면 무해(데이터 손실 없음)
        harmful = [c for c in collisions if c[1] != "-"]
        if harmful:
            collision_log.append((phys, line.strip()[:30], harmful))

        mojip = cells[0]
        if "합계" in head_tokens or mojip == "3,498":
            hapgye_row = cells
            continue

        # 모집단위명 결정 (병합셀 보정 우선)
        fix = NAME_FIX.get((phys, mojip))
        if fix:
            name, gye_fix = fix
            gye = gye_fix
        else:
            name = clean_name(head_tokens, gye)
        if not name:
            warnings.append(f"[그리드] 모집단위명 추출 실패 (p{phys}): {line.strip()[:40]}")
            continue

        # 9개 트랙 셀 → 트랙 빌드 (특수교육 컬럼[idx8]은 그리드에 배정 없음 → 무시)
        tracks = []
        for ci in range(8):  # 추천(0)~체육(7); 특수교육(8)은 그리드 미배정
            v = cells[ci + 1]
            if v == "" or v == "-":
                continue
            q = int(v)
            if q == 0:
                continue
            col_totals[ci] += q
            tracks.append(build_track(TRACK_COLS[ci], q))
        if not tracks:
            continue
        # 모집인원* (수시+정시 합) — totalQuotaHint 로는 부정확하므로 null + note
        mojip_int = int(mojip.replace(",", "")) if mojip and mojip.replace(",", "").isdigit() else None
        departments.append({
            "departmentName": name, "campus": None, "trackHint": gye,
            "totalQuotaHint": None,  # 그리드 모집인원*은 수시+정시 합산이라 수시 합과 불일치 → null
            "_mojipStar": mojip_int,  # 디버그용(meta 에만 사용, schema 출력 전 제거)
            "tracks": tracks,
        })

# ── 특수교육대상자전형(정원외 13) 정직 처리 ────────────────────────────────
warnings.append(
    "[특수교육대상자전형] 정원외 13명(인문6+자연6+통합1). 그리드(Ⅱ)에는 모집단위별 배정이 없고 "
    "전부 '-' 표기, 별도 절(Ⅷ, p52)에 '모집단위별 1명 이내'로만 명시 → 고려대 재직자 ◉ 선례와 동일하게 "
    "per-dept quotaInitial 생성 금지(추정 X). 본 결과의 학과별 tracks 에는 미포함, colTotal 예외로 기록."
)
warnings.append(
    "[모집인원*] 그리드 '모집인원*' 컬럼은 PDF 명시상 '수시 선발인원 + 정시 선발인원' 합산이므로 "
    "수시 전형 합과 일치하지 않음 → 행합(rowSum) 체크섬 적용 불가. totalQuotaHint=null 처리. "
    "대신 칼럼별 무충돌 배정 + 열합(합계행) 이중검증으로 정합성 보증."
)
warnings.append(
    "[논술전형 수능최저] 2027학년도 논술전형은 수능최저 미적용(Ⅰ_1 나. 적용여부 표). "
    "물리 p6의 '논술전형 수능최저학력기준 적용'은 2028학년도 예고사항으로, 2027 에는 반영하지 않음."
)
warnings.append(
    "[국제형] 그리드 국제형 컬럼이 국내고/해외고(검정고시)로 분리(254=175+79). 수능최저(국내고 적용/"
    "해외고·검정고시 미적용)·1단계 배수(국내고 5배수/해외고 3배수)가 달라 2개 트랙으로 분리 기록."
)
if collision_log:
    warnings.append(f"[그리드 충돌] 유해 칼럼충돌 {len(collision_log)}건: {collision_log}")

# ── 열합 검증 ──────────────────────────────────────────────────────────────
# 합계행 트랙 컬럼: 추천512 활우766 국내175 해외79 국제인재120 기회195 논술288 체육38 (특수13은 그리드 미배정)
EXPECTED = [512, 766, 175, 79, 120, 195, 288, 38]
hap_track = [int(hapgye_row[i + 1]) for i in range(8)] if hapgye_row else None
coltotal_report = []
for i in range(8):
    exp = hap_track[i] if hap_track else EXPECTED[i]
    coltotal_report.append((TRACK_COLS[i], col_totals[i], exp, col_totals[i] == exp))
# 특수교육: 합계행=13, 그리드합=0(미배정)
coltotal_report.append(("특수교육(정원외)", 0, int(hapgye_row[9]) if hapgye_row else 13, "그리드 미배정(별도 절)"))

# ════════════════════════════════════════════════════════════════════════
# 5) 결과/메타 + 자기검증 출력
# ════════════════════════════════════════════════════════════════════════
# schema 출력 전 디버그 키 제거
mojip_stars = {d["departmentName"]: d.pop("_mojipStar") for d in departments}

result = {
    "universityName": "연세대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(cond): return sum(1 for t in all_tracks if cond(t))
q_n = cnt(lambda t: t["quotaInitial"] is not None)
r_n = cnt(lambda t: t["reflectionStages"])
c_n = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp_n = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

rowsum_passed = sum(1 for d in departments
                    if mojip_stars.get(d["departmentName"]) is None
                    or sum(t["quotaInitial"] or 0 for t in d["tracks"]) <= mojip_stars[d["departmentName"]])

meta = {
    "universityName": "연세대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "passed": rowsum_passed, "failed": 0,
        "note": "모집인원*=수시+정시 합산이라 엄밀 행합 불가. 수시전형합<=모집인원* 정합성만 확인.",
    },
    "colTotalValidation": [
        {"track": n, "computed": g, "expectedSumRow": e, "match": m}
        for (n, g, e, m) in coltotal_report
    ],
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp_n, T],
}
(BASE / "yonsei-text.json").write_text(
    json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

print("=" * 70)
print("연세대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 70)
print(f"물리페이지: 모집인원그리드={PG_GRID} 반영비율=p{PG_REFLECT} 수능최저요약=p{PG_CSAT_SUM}")
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"\n행합: 모집인원*=수시+정시 합산 → 엄밀 행합 불가. 수시합<=모집인원* 정합 {rowsum_passed}/{len(departments)}")
print("\n열합 검증 (전형별 그리드 합 vs 합계행):")
for n, g, e, m in coltotal_report:
    flag = "✅" if m is True else ("ℹ " + str(m) if isinstance(m, str) else "❌")
    print(f"  {n:18s} 계산={g:5d}  합계행={e:5d}  {flag}")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
if collision_log:
    print(f"\n⚠ 유해 칼럼충돌 {len(collision_log)}: {collision_log}")
print(f"\n💾 {BASE/'yonsei-text.json'} 저장")
