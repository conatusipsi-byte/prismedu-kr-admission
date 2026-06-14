#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
숭실대학교 2027학년도 수시모집요강 → soongsil-text.json
입력: univ/susi-2027/kcue_0000143.txt(+.pdf)  (pdftotext -layout, Vision 미사용)
단일 캠퍼스(서울 동작). 이중 체크섬(행합=학과 소계 / 열합=총계행) 검증 후 저장.

데이터 출처(검증 완료):
 - 전형별 모집인원 grid (PDF p.5): 행합 0실패 + 열합 14/14 OK (총계 1,740)
 - 면접형/서류형/교과/논술/기회균형/특수 detail 학과별 리스트(p.12·15·18·21·25·34) 각각 열합 일치(독립 2차 검증)
 - 선발방법/수능최저/지원자격: 각 전형 상세 페이지 직독
"""
import json
from pathlib import Path
from collections import OrderedDict

OUT = Path("scripts/etl/text-extract-test/soongsil-text.json")
UNIV = "숭실대학교"
SLUG = "kcue_0000143"
CAMPUS = "서울"

# ───────────────────────────────────────────────────────────────────────────
# 1) 전형별 모집인원 grid (PDF p.5) — 학과 × 전형(13열) + 소계
#    cols: 면접형, 서류형, 기회균형, SW, 특수(외), 교과, 논술, 정보보호(외),
#          축구, 체육(당구), 연기, 연출, 재직자(외)  |  소계(내외)
# ───────────────────────────────────────────────────────────────────────────
COLS = ["면접형","서류형","기회균형","SW","특수","교과","논술","정보보호",
        "축구","체육","연기","연출","재직자"]
STATED_COL = {"면접형":522,"서류형":163,"기회균형":130,"SW":17,"특수":38,"교과":464,
              "논술":248,"정보보호":4,"축구":10,"체육":3,"연기":16,"연출":22,"재직자":103}
STATED_TOTAL = 1740

# [면접,서류,기회,SW,특수,교과,논술,정보보호,축구,체육,연기,연출,재직] , 소계
GRID = OrderedDict([
 ("기독교학과",                  ([24, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 26)),
 ("국어국문학과",                ([7, 0, 3, 0, 1, 5, 4, 0, 0, 0, 0, 0, 0], 20)),
 ("영어영문학과",                ([21, 0, 5, 0, 2, 14, 8, 0, 0, 0, 0, 0, 0], 50)),
 ("독어독문학과",                ([10, 0, 3, 0, 1, 4, 2, 0, 0, 0, 0, 0, 0], 20)),
 ("불어불문학과",                ([9, 0, 2, 0, 1, 5, 4, 0, 0, 0, 0, 0, 0], 21)),
 ("중어중문학과",                ([7, 0, 2, 0, 1, 3, 3, 0, 0, 0, 0, 0, 0], 16)),
 ("일어일문학과",                ([10, 0, 2, 0, 1, 8, 2, 0, 0, 0, 0, 0, 0], 23)),
 ("철학과",                     ([16, 0, 3, 0, 1, 5, 3, 0, 0, 0, 0, 0, 0], 28)),
 ("사학과",                     ([8, 0, 3, 0, 1, 4, 3, 0, 0, 0, 0, 0, 0], 19)),
 ("예술창작학부(영화예술전공)",      ([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 22, 0], 38)),
 ("스포츠학부",                  ([0, 0, 0, 0, 0, 0, 0, 0, 10, 3, 0, 0, 0], 13)),
 ("법학과",                     ([12, 4, 3, 0, 1, 11, 4, 0, 0, 0, 0, 0, 0], 35)),
 ("국제법무학과",                ([7, 0, 2, 0, 1, 6, 2, 0, 0, 0, 0, 0, 0], 18)),
 ("사회복지학부",                ([8, 3, 3, 0, 1, 9, 4, 0, 0, 0, 0, 0, 0], 28)),
 ("행정학부",                   ([6, 2, 5, 0, 2, 9, 6, 0, 0, 0, 0, 0, 0], 30)),
 ("정치외교학과",                ([5, 2, 2, 0, 1, 4, 5, 0, 0, 0, 0, 0, 0], 19)),
 ("정보사회학과",                ([4, 2, 1, 0, 1, 4, 4, 0, 0, 0, 0, 0, 0], 16)),
 ("언론홍보학과",                ([4, 2, 0, 0, 1, 4, 4, 0, 0, 0, 0, 0, 0], 15)),
 ("평생교육학과",                ([9, 3, 1, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0], 19)),
 ("경제학과",                   ([14, 5, 2, 0, 5, 15, 5, 0, 0, 0, 0, 0, 0], 46)),
 ("글로벌통상학과",              ([17, 6, 3, 0, 8, 14, 10, 0, 0, 0, 0, 0, 0], 58)),
 ("금융경제학과",                ([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 37], 37)),
 ("국제무역학과",                ([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 37], 37)),
 ("경영학부",                   ([15, 15, 4, 0, 3, 27, 16, 0, 0, 0, 0, 0, 0], 80)),
 ("회계학과",                   ([9, 3, 3, 0, 1, 10, 2, 0, 0, 0, 0, 0, 0], 28)),
 ("벤처중소기업학과",            ([8, 3, 2, 0, 2, 11, 7, 0, 0, 0, 0, 0, 0], 33)),
 ("금융학부",                   ([14, 5, 2, 0, 0, 8, 2, 0, 0, 0, 0, 0, 0], 31)),
 ("수학과",                     ([8, 3, 2, 0, 0, 8, 5, 0, 0, 0, 0, 0, 0], 26)),
 ("물리학과",                   ([21, 2, 3, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0], 32)),
 ("화학과",                     ([14, 3, 3, 0, 0, 6, 4, 0, 0, 0, 0, 0, 0], 30)),
 ("정보통계·보험수리학과",         ([12, 5, 0, 0, 0, 8, 4, 0, 0, 0, 0, 0, 0], 29)),
 ("의생명시스템학부",            ([13, 3, 3, 0, 0, 9, 5, 0, 0, 0, 0, 0, 0], 33)),
 ("화학공학과",                  ([19, 7, 4, 0, 0, 26, 12, 0, 0, 0, 0, 0, 0], 68)),
 ("신소재공학과",                ([18, 6, 4, 0, 0, 20, 12, 0, 0, 0, 0, 0, 0], 60)),
 ("전기공학부",                  ([24, 2, 4, 0, 0, 25, 12, 0, 0, 0, 0, 0, 0], 67)),
 ("기계공학부",                  ([20, 5, 7, 0, 0, 18, 12, 0, 0, 0, 0, 0, 0], 62)),
 ("산업·정보시스템공학과",         ([21, 7, 5, 0, 0, 20, 8, 0, 0, 0, 0, 0, 0], 61)),
 ("건축학부(건축학·건축공학전공)",   ([15, 4, 4, 0, 0, 18, 7, 0, 0, 0, 0, 0, 0], 48)),
 ("건축학부(실내건축전공)",        ([11, 2, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0], 19)),
 ("컴퓨터학부",                  ([9, 11, 6, 4, 0, 15, 10, 0, 0, 0, 0, 0, 0], 55)),
 ("지능전자공학부",              ([30, 9, 8, 0, 0, 43, 24, 0, 0, 0, 0, 0, 0], 114)),
 ("글로벌미디어학부",            ([17, 5, 7, 4, 0, 14, 8, 0, 0, 0, 0, 0, 0], 55)),
 ("디지털미디어학과",            ([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 29], 29)),
 ("AI소프트웨어학부",            ([18, 16, 10, 9, 0, 22, 19, 0, 0, 0, 0, 0, 0], 94)),
 ("정보보호학과",                ([8, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0], 12)),
 ("자유전공학부(인문)",           ([0, 8, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0], 18)),
 ("자유전공학부(자연)",           ([0, 10, 0, 0, 0, 14, 0, 0, 0, 0, 0, 0, 0], 24)),
])

# ───────────────────────────────────────────────────────────────────────────
# 2) 이중 체크섬
# ───────────────────────────────────────────────────────────────────────────
row_fail = []
for d, (v, sub) in GRID.items():
    if sum(v) != sub:
        row_fail.append((d, sub, sum(v)))
col_validation = []
col_all_ok = True
for i, c in enumerate(COLS):
    comp = sum(v[i] for v, _ in GRID.values())
    match = comp == STATED_COL[c]
    col_all_ok &= match
    col_validation.append({"track": c, "computed": comp, "stated": STATED_COL[c], "match": match})
grand = sum(sub for _, sub in GRID.values())
total_match = grand == STATED_TOTAL
checksum_passed = (len(row_fail) == 0) and col_all_ok and total_match
assert checksum_passed, f"CHECKSUM FAIL row={row_fail} col_ok={col_all_ok} total={grand}"

# ───────────────────────────────────────────────────────────────────────────
# 3) 전형(track) 메타 — 전형방법/수능최저/지원자격/계열/특수키워드/sourcePages
#    (모든 수시 전형 수능최저: 교과·논술만 있음, 나머지 "없음")
# ───────────────────────────────────────────────────────────────────────────
CSAT_6 = "국어, 수학, 영어, 사회/과학탐구(1과목) 중 2개 영역 등급 합 6등급 이내 (필수 응시 영역 없음, 탐구 2과목 중 상위 1과목 반영)"

QUAL_BASIC = "고등학교 졸업(예정)자 또는 관계 법령에 의하여 고등학교 졸업과 동등 이상의 학력이 있다고 인정된 자"
QUAL_GYOGWA = ("「초·중등교육법시행령」 제76조의3에 따른 국내 고등학교 2025·2026·2027년 졸업(예정)자로서, 국내 고교에서 "
               "3학기 이상 학생부 교과성적 산출이 가능하고 출신 고등학교장의 추천을 받은 자(추천인원 제한 없음). "
               "특성화고·영재학교·예술고·체육고·마이스터고·방송통신고·학력인정 평생교육시설·대안학교 등 출신자는 지원 불가.")
QUAL_GIHOE = ("고등학교 졸업(예정)자(또는 동등 학력 인정자)로서 국가보훈대상자, 농어촌학생, 서해5도학생, 특성화고교졸업자, "
              "기초생활수급자, 차상위계층, 한부모가족지원대상자, 자립지원대상자 중 어느 하나에 해당하는 자. "
              "특성화고교졸업자 자격은 별도 지정 모집단위(표시 학과)에 한해 동일계열 기준학과 이수 시 지원 가능. 지원자격별 선발인원 미지정.")
QUAL_INFOSEC = ("「초·중등교육법시행령」 제76조의3에 따른 국내 고등학교 2026·2027년 졸업(예정)자로서, 고등학교 입학일부터 "
                "2026.8.31.까지 본교가 인정하는 정보보호 관련 대회(정보보호영재교육원 정보보안경진대회, CCE, WITHCON, WACON, 코드게이트 등)에서 입상한 자.")
QUAL_SPECIAL_EDU = ("고등학교 졸업(예정)자(또는 동등 학력 인정자)로서 「장애인복지법」 제32조 장애인 등록자(장애정도 무관), "
                    "국가유공자 상이등급자, 또는 「장애인등에대한특수교육법」 제15조제1항 특수교육대상자 중 하나에 해당하는 자.")
QUAL_DANGU = ("「초·중등교육법시행령」 제76조의3에 따른 국내 고교 졸업(예정)자로서 3학기 이상 교과성적 산출이 가능하고, "
              "고등학교 입학일부터 2026.8.31.까지 본교가 인정하는 당구(캐롬 3쿠션 개인전) 대회에서 3위 이내 입상한 자.")
QUAL_SOCCER = ("「초·중등교육법시행령」 제76조의3에 따른 국내 고교 2026·2027년 졸업(예정)자로서 3학기 이상 교과성적 산출이 가능하고, "
               "고등학교 재학 중 대한축구협회 인정 국가대표(연령별 대표) 선발·참가자이거나 본교가 인정하는 전국 축구대회에서 4강 이내 입상한 자. "
               "포지션별 모집(FW 3·MF 3·DF 3·GK 1).")
QUAL_JAEJIK = ("「고등교육법시행령」 제29조 제2항 제14호 '다'목 해당자로서, 2027.3.1. 기준 산업체 재직 중인 자. "
               "특성화고등학교등 졸업(또는 일반고 위탁 직업교육과정 1년 이상 이수, 산업수요 맞춤형고 졸업, 학력인정 평생교육시설 이수) 요건과 "
               "산업체 근무경력 합 3년(1,080일) 이상 요건을 모두 갖춘 자.")

# trackName, trackTypeRaw, specialTypeKeyword, qualification, reflectionStages(builder), csat(raw, exempt), sourcePages, trackHint, deptFilter
def stages_step_seo_myeon(multi1, label1note=None, m1=3):
    """1단계 서류종합평가 100%(50점, m배수) → 2단계 1단계 50% + 면접 50%(100점)"""
    return [
        {"stageLabel":"1단계","multiplier":multi1,"components":{"서류종합평가":100},"stageMaxScore":50},
        {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":50,"면접":50},"stageMaxScore":100},
    ]

# 전형별 정의 (grid 컬럼 키 → 전형 메타)
TRACK_DEF = {
 "면접형": dict(
    name="학생부종합(SSU미래인재전형)(면접형)", ttype="학생부위주(종합)", special=None,
    qual=QUAL_BASIC,
    stages=[
       {"stageLabel":"1단계","multiplier":3.5,"components":{"서류종합평가":100},"stageMaxScore":50},
       {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":50,"면접":50},"stageMaxScore":100},
    ],
    csat="없음", exempt=True, pages=[12,13,14],
 ),
 "서류형": dict(
    name="학생부종합(SSU미래인재전형)(서류형)", ttype="학생부위주(종합)", special=None,
    qual=QUAL_BASIC,
    stages=[{"stageLabel":"일괄합산","multiplier":None,"components":{"서류종합평가":100},"stageMaxScore":50}],
    csat="없음", exempt=True, pages=[15,16,17],
 ),
 "교과": dict(
    name="학생부교과(교과우수자전형-학교장 추천)", ttype="학생부위주(교과)", special="학교장추천",
    qual=QUAL_GYOGWA,
    stages=[{"stageLabel":"일괄합산","multiplier":None,"components":{"학생부교과":100},"stageMaxScore":100}],
    csat=CSAT_6, exempt=False, pages=[18,19,20],
 ),
 "논술": dict(
    name="논술(논술우수자전형)", ttype="논술위주", special=None,
    qual=QUAL_BASIC,
    stages=[{"stageLabel":"일괄합산","multiplier":None,"components":{"논술":90,"학생부교과":10},"stageMaxScore":100}],
    csat=CSAT_6, exempt=False, pages=[21,22,23,24],
 ),
 "기회균형": dict(
    name="학생부종합(기회균형전형)", ttype="학생부위주(종합)", special="기회균형(국가보훈/농어촌/서해5도/특성화고/기초생활수급/차상위/한부모/자립지원)",
    qual=QUAL_GIHOE,
    stages=[
       {"stageLabel":"1단계","multiplier":3,"components":{"서류종합평가":100},"stageMaxScore":50},
       {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":50,"면접":50},"stageMaxScore":100},
    ],
    csat="없음", exempt=True, pages=[25,26,27,28,29,30,31],
 ),
 "SW": dict(
    name="학생부종합(SW우수자전형)", ttype="학생부위주(종합)", special="SW우수자",
    qual=QUAL_BASIC,
    stages=[
       {"stageLabel":"1단계","multiplier":3,"components":{"서류종합평가":100},"stageMaxScore":50},
       {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":50,"면접":50},"stageMaxScore":100},
    ],
    csat="없음", exempt=True, pages=[32,33],
 ),
 "특수": dict(
    name="학생부종합(특수교육대상자전형)", ttype="학생부위주(종합)", special="특수교육대상자",
    qual=QUAL_SPECIAL_EDU,
    stages=[
       {"stageLabel":"1단계","multiplier":3,"components":{"서류종합평가":100},"stageMaxScore":50},
       {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":50,"면접":50},"stageMaxScore":100},
    ],
    csat="없음", exempt=True, pages=[34,35,36],
 ),
 "정보보호": dict(
    name="실기/실적(정보보호특기자전형)", ttype="실기/실적위주", special="정보보호특기자(채용조건형 계약학과·정원외)",
    qual=QUAL_INFOSEC,
    stages=[
       {"stageLabel":"1단계","multiplier":3,"components":{"서류종합평가":100},"stageMaxScore":50},
       {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":50,"면접":50},"stageMaxScore":100},
    ],
    csat="없음", exempt=True, pages=[37,38],
 ),
 "축구": dict(
    name="실기/실적(예체능우수인재전형) 축구", ttype="실기/실적위주", special="예체능우수인재(축구)",
    qual=QUAL_SOCCER,
    stages=[{"stageLabel":"일괄합산","multiplier":None,"components":{"입상실적":50,"실기":30,"면접":10,"학생부교과":10},"stageMaxScore":100}],
    csat="없음", exempt=True, pages=[39,40,41,42,43,44,45,46,47,48],
 ),
 "체육": dict(
    name="실기/실적(예체능우수인재전형) 체육(당구)", ttype="실기/실적위주", special="예체능우수인재(체육-당구)",
    qual=QUAL_DANGU,
    stages=[{"stageLabel":"일괄합산","multiplier":None,"components":{"입상실적":70,"면접":20,"학생부교과":10},"stageMaxScore":100}],
    csat="없음", exempt=True, pages=[39,40,41],
 ),
 "연기": dict(
    name="실기/실적(예체능우수인재전형) 연기", ttype="실기/실적위주", special="예체능우수인재(연기)",
    qual=QUAL_BASIC,
    stages=[
       {"stageLabel":"1단계","multiplier":4,"components":{"실기":100},"stageMaxScore":100},
       {"stageLabel":"2단계","multiplier":None,"components":{"실기":90,"학생부교과":10},"stageMaxScore":100},
    ],
    csat="없음", exempt=True, pages=[49,50,51],
 ),
 "연출": dict(
    name="실기/실적(예체능우수인재전형) 연출", ttype="실기/실적위주", special="예체능우수인재(연출)",
    qual=QUAL_BASIC,
    stages=[
       {"stageLabel":"1단계","multiplier":3,"components":{"실기":60,"학생부교과":40},"stageMaxScore":100},
       {"stageLabel":"2단계","multiplier":None,"components":{"실기":100},"stageMaxScore":100},
    ],
    csat="없음", exempt=True, pages=[49,50,51],
 ),
 "재직자": dict(
    name="특성화고등을졸업한재직자전형", ttype="기타", special="특성화고졸재직자(정원외)",
    qual=QUAL_JAEJIK,
    stages=[{"stageLabel":"일괄합산","multiplier":None,"components":{"서류종합평가":100},"stageMaxScore":50}],
    csat="없음", exempt=True, pages=[52,53,54],
 ),
}

# 계열(인문/자연/예체능) — 모집인원표 계열 구분(p5) 기준
INMUN = {"기독교학과","국어국문학과","영어영문학과","독어독문학과","불어불문학과","중어중문학과","일어일문학과",
         "철학과","사학과","법학과","국제법무학과","사회복지학부","행정학부","정치외교학과","정보사회학과",
         "언론홍보학과","평생교육학과","경제학과","글로벌통상학과","금융경제학과","국제무역학과",
         "경영학부","회계학과","벤처중소기업학과","금융학부","자유전공학부(인문)"}
YECHENUNG = {"예술창작학부(영화예술전공)","스포츠학부"}
def dept_hint(name):
    if name in YECHENUNG: return "예체능"
    if name in INMUN: return "인문"
    return "자연"

# ───────────────────────────────────────────────────────────────────────────
# 4) departments[] 조립
# ───────────────────────────────────────────────────────────────────────────
departments = []
warnings = []
for dept, (v, sub) in GRID.items():
    tracks = []
    for i, col in enumerate(COLS):
        q = v[i]
        if q <= 0:
            continue
        td = TRACK_DEF[col]
        tracks.append({
            "trackName": td["name"],
            "trackTypeRaw": td["ttype"],
            "recruitmentPeriodRaw": "수시",
            "specialTypeKeyword": td["special"],
            "quotaInitial": q,
            "applicationQualification": td["qual"],
            "reflectionStages": [dict(s) for s in td["stages"]],
            "csatMinimumRawText": td["csat"],
            "csatMinimumExempt": td["exempt"],
            "csatRequiredAreasRawText": None,
            "prevYearResult": None,
            "sourcePages": td["pages"],
        })
    departments.append({
        "departmentName": dept,
        "campus": CAMPUS,
        "trackHint": dept_hint(dept),
        "totalQuotaHint": sub,
        "tracks": tracks,
    })

total_tracks = sum(len(d["tracks"]) for d in departments)

# ───────────────────────────────────────────────────────────────────────────
# 5) meta
# ───────────────────────────────────────────────────────────────────────────
meta = {
    "universityName": UNIV,
    "universityId": SLUG,
    "year": 2027,
    "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0,
    "campusScope": "서울캠퍼스(서울 동작) 단독 — 숭실대 단일 캠퍼스",
    "sourceDocYear": 2027,
    "departments": len(departments),
    "totalTracks": total_tracks,
    "rowSumValidation": {
        "basis": "totalQuotaHint(학과별 전형 인원 합 == 전형별모집인원표 학과 '소계(내외)')",
        "passed": len(GRID) - len(row_fail),
        "failed": len(row_fail),
        "failedList": [{"dept": d, "stated": s, "computed": c} for d, s, c in row_fail],
    },
    "colTotalValidation": col_validation,
    "colTotalGrand": {"computed": grand, "stated": STATED_TOTAL, "match": total_match},
    "checksumPassed": checksum_passed,
}

out = {"meta": meta, "result": {
    "universityName": UNIV, "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}}

OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"WROTE {OUT}")
print(f"departments={len(departments)} tracks={total_tracks} "
      f"checksumPassed={checksum_passed} rowFail={len(row_fail)} colAllOK={col_all_ok} "
      f"grand={grand}/{STATED_TOTAL}")
