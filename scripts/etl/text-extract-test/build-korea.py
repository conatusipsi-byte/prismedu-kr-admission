#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
고려대 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용. Claude Code 본체가 korea.txt 를 읽고 추출한 전형 템플릿(반영비율·수능최저)을
결정론적으로 파싱한 모집인원 그리드와 결합한다.

정직성:
  - 모집인원 그리드: 행합(학과별 9전형 = 모집인원) + 열합(전형별 합 = 합계행) 이중 검증.
  - 반영비율·수능최저: 본체가 PDF 텍스트의 명시 문구에서 추출 (추정 X). sourcePages 로 대조.
  - ◉(재직자 지원가능) = 고정 모집인원 아님 → quotaInitial=null + note.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "korea.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1 (1-indexed)

# ── 인쇄 페이지(footer "| N") → 물리 페이지 매핑 ──────────────────────────
printed_to_phys = {}
for i, pg in enumerate(pages, start=1):
    for num in re.findall(r"\|\s*(\d+)\s*$", pg, re.M):
        printed_to_phys.setdefault(int(num), i)

def phys(printed):
    p = printed_to_phys.get(printed)
    if p is None:
        print(f"  ⚠ 인쇄p{printed} 물리페이지 매핑 실패", file=sys.stderr)
    return p

PG_QUOTA   = [p for p in (phys(4), phys(5)) if p]   # 모집인원 그리드
PG_CSAT    = phys(6)                                 # 수능최저 표
PG_REFLECT = {
    "학교추천전형": phys(12), "학업우수전형": phys(14), "계열적합전형": phys(15),
    "고른기회전형": phys(16), "다문화전형": phys(18), "재직자전형": phys(19),
    "사이버국방전형": phys(21), "논술전형": phys(22), "특기자전형": phys(24),
}

TRACK_COLS = ["학교추천전형","학업우수전형","계열적합전형","고른기회전형",
              "다문화전형","재직자전형","사이버국방전형","논술전형","특기자전형"]

# ── 본체가 텍스트에서 추출한 수능최저 원문 (p6 표 + 각 전형 상세 직접 인용) ──
CSAT_3HAB7     = "국어, 수학, 영어, 탐구 4개 영역 중 3개 영역 등급의 합이 7 이내 및 한국사 4등급 이내"
CSAT_4HAB8     = "국어, 수학, 영어, 탐구 4개 영역 등급의 합이 8 이내 및 한국사 4등급 이내"
CSAT_4HAB5_MED = "국어, 수학, 영어, 탐구 4개 영역 등급의 합이 5 이내 및 한국사 4등급 이내"   # 의학과
CSAT_3HAB8     = "국어, 수학, 영어, 탐구 4개 영역 중 3개 영역 등급의 합이 8 이내 및 한국사 4등급 이내"  # 디자인조형
CSAT_AREAS     = "탐구영역은 사회탐구와 과학탐구 중 1개 과목 반영"

def stage(label, mult, comps, maxscore):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": maxscore}

S2_60_40 = stage("2단계", None, {"1단계 성적": 60, "면접": 40}, 100)

TEMPLATES = {
    "학교추천전형":  dict(trackTypeRaw="학생부위주(교과)", special=None,
        stages=[stage("일괄", None, {"학생부(교과)": 90, "서류": 10}, 100)]),
    "학업우수전형":  dict(trackTypeRaw="학생부위주(종합)", special=None,
        stages=[stage("일괄", None, {"서류": 100}, 100)]),
    "계열적합전형":  dict(trackTypeRaw="학생부위주(종합)", special=None,
        stages=[stage("1단계", 5, {"서류": 100}, 100), S2_60_40]),
    "고른기회전형":  dict(trackTypeRaw="학생부위주(종합)", special="기회균형",
        stages=[stage("1단계", 3, {"서류": 100}, 100), S2_60_40]),
    "다문화전형":    dict(trackTypeRaw="학생부위주(종합)", special="다문화",
        stages=[stage("1단계", 3, {"서류": 100}, 100), S2_60_40]),
    "재직자전형":    dict(trackTypeRaw="학생부위주(종합)", special="재직자",
        stages=[stage("1단계", 3, {"서류": 100}, 100), S2_60_40]),
    "사이버국방전형": dict(trackTypeRaw="학생부위주(종합)", special=None,
        stages=[stage("1단계", 5, {"서류": 100}, 100),
                stage("2단계", None, {"1단계 성적": 60, "면접": 20, "기타(군 면접평가, 체력검정 등)": 20}, 100)]),
    "논술전형":      dict(trackTypeRaw="논술위주", special=None,
        stages=[stage("일괄합산", None, {"논술": 100}, 100)]),
    "특기자전형":    dict(trackTypeRaw="실기/실적위주", special=None, stages=None),  # 모집단위별 분기
}

SPORTS_STAGES = [stage("1단계", 5, {"서류(경기실적)": 70, "학생부(교과)": 25, "학생부(출결)": 5}, 100),
                 stage("2단계", None, {"1단계 성적": 70, "면접": 30}, 100)]
DESIGN_STAGES = [stage("1단계", 5, {"서류": 100}, 100), S2_60_40]

def csat_for(track, dept):
    is_med = (dept == "의학과")
    if track == "학교추천전형":
        return (CSAT_4HAB5_MED if is_med else CSAT_3HAB7, False, CSAT_AREAS)
    if track == "학업우수전형":
        return (CSAT_4HAB5_MED if is_med else CSAT_4HAB8, False, CSAT_AREAS)
    if track == "논술전형":
        return (CSAT_4HAB8, False, CSAT_AREAS)
    if track == "특기자전형":
        if dept == "디자인조형학부":
            return (CSAT_3HAB8, False, CSAT_AREAS)
        return ("없음", True, None)
    return ("없음", True, None)   # 계열적합·고른기회·다문화·재직자·사이버국방

def build_track(track, dept, quota, quota_page):
    tpl = TEMPLATES[track]
    if track == "특기자전형":
        stages = DESIGN_STAGES if dept == "디자인조형학부" else SPORTS_STAGES
    else:
        stages = tpl["stages"]
    raw, exempt, areas = csat_for(track, dept)
    appq = ("재직자전형 지원가능 모집단위 (모집단위별 최대 1명, 총 18명 이내 선발)"
            if track == "재직자전형" else None)
    # sourcePages = 이 학과의 실제 모집인원 페이지 + 전형방법 페이지 + (수능최저 적용 시) 수능최저 페이지
    src = sorted({p for p in ([quota_page, PG_REFLECT[track]] + ([PG_CSAT] if not exempt else [])) if p})
    return {
        "trackName": track, "trackTypeRaw": tpl["trackTypeRaw"], "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": tpl["special"], "quotaInitial": quota,
        "applicationQualification": appq,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw, "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas, "prevYearResult": None, "sourcePages": src,
    }

# ── 모집인원 그리드 파싱 (우앵커 + 행합 검증) ────────────────────────────
NUMCELL = re.compile(r"^(\d+|-|◉)$")
GYE = {"인문":"인문","자연":"자연","체능":"예체능","예능":"예체능"}
SUFFIX = "★◇◉*"

departments, warnings, parse_fail, jaejik_eligible = [], [], [], []
col_totals = [0]*9
cur_gye = None

for pidx, pg in enumerate(pages, start=1):
    for line in pg.splitlines():
        tk = line.split()
        for t in tk:
            if t.strip(SUFFIX) in GYE:
                cur_gye = GYE[t.strip(SUFFIX)]
        if len(tk) < 11:
            continue
        last10 = tk[-10:]
        if not all(NUMCELL.match(t) for t in last10):
            continue
        name_raw = tk[-11]
        name = name_raw.strip(SUFFIX)
        if name in GYE or not name:
            continue
        total = int(last10[0]); vals = last10[1:]
        numsum = sum(int(v) for v in vals if v.isdigit())
        if numsum != total:
            parse_fail.append((pidx, name_raw, total, numsum, vals))
            warnings.append(f"[행합불일치] {name_raw} (p{pidx}): 모집인원 {total} ≠ 전형합 {numsum}")
            continue
        tracks = []
        for ci, raw_v in enumerate(vals):
            track = TRACK_COLS[ci]
            if raw_v == "-":
                continue
            if raw_v == "◉":
                jaejik_eligible.append(name); quota = None
            else:
                q = int(raw_v)
                if q == 0:
                    continue
                quota = q; col_totals[ci] += q
            tracks.append(build_track(track, name, quota, pidx))
        if not tracks:
            continue
        departments.append({"departmentName": name, "campus": None, "trackHint": cur_gye,
                            "totalQuotaHint": total, "tracks": tracks})

# ── trackHint(계열) 교정 ──────────────────────────────────────────────────
#   forward-fill 은 병합셀 수직중앙 배치 때문에 단과대 경계에서 오분류 → 폐기.
#   PDF 면접안내(p15) '인문계/자연계' 명시 리스트를 전사. 날짜/라벨도 병합셀 중앙배치라
#   프로그래밍 분할 불가 → 두 리스트를 명시 집합으로 두되, 각 이름이 실제 p15 면접표에
#   토큰으로 존재하는지 검증(전사 오타 자동 검출).
INMUN = {  # 면접 11.07조 (계열적합 면접 인문계) — 30
    "국어교육과","국어국문학과","노어노문학과","독어독문학과","불어불문학과","사학과","서어서문학과",
    "언어학과","역사교육과","영어교육과","영어영문학과","일어일문학과","중어중문학과","철학과","한국사학과",
    "한문학과","경영학과","경제학과","교육학과","국제학부","글로벌한국융합학부","미디어학부","보건정책관리학부",
    "사회학과","식품자원경제학과","심리학부","정치외교학과","지리교육과","통계학과","행정학과",
}
JAYEON = {  # 면접 11.08조 (계열적합 면접 자연계) — 30
    "가정교육과","간호학과","건축학과","바이오시스템의과학부","보건환경융합과학부","생명공학부","생명과학부",
    "수학과","수학교육과","식품공학과","의학과","인공지능학과","지구환경과학과","컴퓨터학과","화공생명공학과",
    "화학과","환경생태공학부","건축사회환경공학부","기계공학부","데이터과학과","물리학과","바이오의공학부",
    "반도체공학과","산업경영공학부","스마트모빌리티학부","스마트보안학부","신소재공학부","융합에너지공학과",
    "전기전자공학부","차세대통신학과",
}
# 전사 검증: 모든 INMUN/JAYEON 이름이 p15 면접표 텍스트에 실제 토큰으로 존재해야 함
interview_block = pages[phys(15) - 1] if phys(15) else ""
itk = set(re.split(r"[,\s]+", interview_block))
transcription_err = [n for n in (INMUN | JAYEON) if n not in itk]
if transcription_err:
    warnings.append(f"[trackHint 전사검증실패] p15 면접표에 없는 이름: {transcription_err}")

gye_map = {}
for n in INMUN: gye_map[n] = "인문"
for n in JAYEON: gye_map[n] = "자연"
# 면접(계열적합) 미참여 단위 — PDF 인라인 계열 라벨/소속 단과대 기준 (명시 근거)
gye_map.update({
    "체육교육과": "예체능", "디자인조형학부": "예체능",   # 특기자(실기) — 체능/예능
    "자유전공학부": "인문",   # p4 표 인라인 '인문' 라벨
    "학부대학": "자연",       # p5 표 인라인 '자연' 라벨
    "공과대학": "자연",       # 공과대학 광역(전공자율선택) — 공학 블록
    "사이버국방학과": "자연", # 스마트보안학부 소속(자연 블록)
})
unmapped = []
for d in departments:
    g = gye_map.get(d["departmentName"])
    if g is None:
        unmapped.append(d["departmentName"])      # 매핑 실패 → 정직하게 null
        d["trackHint"] = None
    else:
        d["trackHint"] = g

# ── 검증: 열합 vs 합계행 ─────────────────────────────────────────────────
EXPECTED_COLTOTAL = [650, 903, 523, 201, 20, 18, 10, 351, 55]
coltotal_report = [(TRACK_COLS[i], col_totals[i], EXPECTED_COLTOTAL[i],
                    col_totals[i] == EXPECTED_COLTOTAL[i]) for i in range(9)]

if jaejik_eligible:
    warnings.append(f"[재직자전형] {len(set(jaejik_eligible))}개 모집단위 '◉ 지원가능' 표기(고정 모집인원 아님) "
                    f"→ quotaInitial=null. 총 18명 이내, 모집단위별 최대 1명.")
warnings.append(f"[trackHint] 계열(인문/자연/예체능)은 PDF 면접안내(p15) 명시 인문계/자연계 리스트 + 인라인 라벨로 분류. 미매핑 {len(unmapped)}건: {unmapped if unmapped else '없음'}.")
warnings.append("[재외국민] 재외국민(정원외 2%) 언급 있으나 본 수시요강에 전형방법 표 없음 → 미추출.")
warnings.append("[특기자전형] 디자인조형학부(서류100→면접40)·체육교육과(경기실적70+교과25+출결5→면접30) 반영 상이 → 모집단위별 분리.")
warnings.append("[고른기회전형] 농어촌·국가보훈·사회배려·자립지원 통합 단일 전형(모집인원 열 1개) → specialTypeKeyword=기회균형 대표 표기.")

result = {"universityName": "고려대학교", "year": 2027, "recruitmentSeason": "susi",
          "departments": departments, "warnings": warnings}

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
    "universityName": "고려대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {"passed": len(departments), "failed": len(parse_fail)},
    "colTotalValidation": [{"track": n, "computed": g, "expectedSumRow": e, "match": m}
                           for (n,g,e,m) in coltotal_report],
    "fillRatios": {"quotaInitial": [q_n,T], "reflectionStages": [r_n,T],
                   "csatMinimumRawText": [c_n,T], "csatMinimumExempt": [ce_n,T], "sourcePages": [sp_n,T]},
    "completeRecords": [comp_n, T],
}
(BASE / "korea-text.json").write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

print("=" * 68)
print("고려대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 68)
print(f"물리페이지: 모집인원={PG_QUOTA} 수능최저=p{PG_CSAT}")
print("전형방법: " + " ".join(f"{k.replace('전형','')}=p{v}" for k,v in PG_REFLECT.items()))
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합 검증: 통과 {len(departments)} / 실패 {len(parse_fail)}")
print("\n열합 검증 (전형별 모집인원 합 vs 합계행 650/903/523/201/20/18/10/351/55):")
for n,g,e,m in coltotal_report:
    flag = "✅" if m else ("◉지원가능(null)" if n=="재직자전형" else "❌")
    print(f"  {n:10s} 계산={g:4d}  합계행={e:4d}  {flag}")
print(f"\n채움 비율 ({T}전형):")
print(f"  quotaInitial      : {q_n}/{T} ({100*q_n//T}%)")
print(f"  reflectionStages  : {r_n}/{T} ({100*r_n//T}%)")
print(f"  csatMinimumRawText: {c_n}/{T} ({100*c_n//T}%)")
print(f"  csatMinimumExempt : {ce_n}/{T} ({100*ce_n//T}%)")
print(f"  sourcePages       : {sp_n}/{T} ({100*sp_n//T}%)")
print(f"  완전레코드        : {comp_n}/{T} ({100*comp_n//T}%)")
if parse_fail:
    print(f"\n⚠ 행합 실패 {len(parse_fail)}:")
    for p,n,t,s,v in parse_fail: print(f"  p{p} {n}: {t} ≠ {s}  {v}")
print(f"\n💾 {BASE/'korea-text.json'} 저장")
