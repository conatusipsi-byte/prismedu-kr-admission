#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한경국립대학교 (kcue_0000037) 2027 수시 모집요강 구조화 빌더.
- pdftotext -layout + -bbox-layout (총괄표 컬럼 정렬 검증) + Claude Code 본체 직접 구조화.
- Vision API 미사용.
- GROUND TRUTH: 모집인원 총괄표 (정원내 p4-5, 정원외 p6). bbox x-coord 로 컬럼 재정렬 검증 완료.

[중요 검증 메모]
- pdftotext -layout 출력은 안성 학과의 지역균형/잠재력/사회통합 컬럼이 어긋나게 찍혀 bbox 로 재배치함.
- 정원내 컬럼 totals 전부 일치(일반448/특수80/지역균형80/잠재력299/사회통합61/디자인6/체육5/음악일반9/음악특수4),
  입학정원 1271, 정원내소계 992 모두 일치.
- 정원외: 합계행 특성화고교9/농어촌49/기초생활11/서해5도6/재외국민25/모집합계100. (서해5도 안성6 통합모집 + 평택1 별도)
"""
import json

UNIV = "한경국립대학교"
UID = "kcue_0000037"

# ---------------------------------------------------------------------------
# 정원내 총괄표 (bbox 검증). columns:
#   [일반, 특수, 지역균형, 잠재력, 사회통합, 디자인, 체육, 음악일반, 음악특수]
# 값: (벡터, 정원내소계, 입학정원, 캠퍼스, trackHint)
COLS = ["일반","특수","지역균형","잠재력","사회통합","디자인","체육","음악일반","음악특수"]

# trackHint: 인문계열(동점자 인문계열 목록) vs 자연/공학. 출처 p12 동점자 유형표.
INMUN = {"인문사회과학대학(유형2)","문예창작미디어콘텐츠홍보학과","영미언어문화학과","행정학과","법학과",
         "경영학과","복지상담학과","사회복지학과","한국수어교육학과","유아특수보육학과","공공행정학과",
         "상담심리교육학과","제품공간디자인학과","HK자율전공학부Ⅰ","HK자율전공학부Ⅱ",
         "시각미디어디자인학과","의류산업학과","귀금속보석공예학과","실용음악학과","특수체육학과","스포츠과학과"}

DEPTS_IN = {
 # 인문사회과학대학
 "인문사회과학대학(유형2)":([18,0,2,3,0,0,0,0,0],23,27,"안성/평택"),
 "문예창작미디어콘텐츠홍보학과":([6,0,1,6,1,0,0,0,0],14,17,"안성"),
 "영미언어문화학과":([6,0,2,8,2,0,0,0,0],18,22,"안성"),
 "행정학과":([6,0,2,8,2,0,0,0,0],18,22,"안성"),
 "법학과":([9,0,3,11,3,0,0,0,0],26,32,"안성"),
 "경영학과":([10,0,2,10,2,0,0,0,0],24,29,"안성"),
 "복지상담학과":([6,0,1,6,1,0,0,0,0],14,17,"안성"),
 "사회복지학과":([7,3,0,0,0,0,0,0,0],10,12,"평택"),
 "한국수어교육학과":([7,3,0,0,0,0,0,0,0],10,12,"평택"),
 "유아특수보육학과":([8,3,0,0,0,0,0,0,0],11,13,"평택"),
 "공공행정학과":([0,12,0,0,0,0,0,0,0],12,12,"평택"),
 "상담심리교육학과":([0,10,0,0,0,0,0,0,0],10,10,"평택"),
 # 생명자원과학대학
 "생명자원과학대학(유형2)":([26,0,2,8,0,0,0,0,0],36,41,"안성"),
 "식품영양학과":([6,0,1,6,1,0,0,0,0],14,17,"안성"),
 "식물생명환경학과":([11,0,4,13,4,0,0,0,0],32,40,"안성"),
 "조경학과":([8,0,2,11,2,0,0,0,0],23,28,"안성"),
 "동물생명과학과":([7,0,2,9,2,0,0,0,0],20,25,"안성"),
 "동물응용과학과":([7,0,2,9,2,0,0,0,0],20,24,"안성"),
 "원예생명공학과":([10,0,2,8,2,0,0,0,0],22,27,"안성"),
 "응용생명공학과":([6,0,1,8,1,0,0,0,0],16,19,"안성"),
 "지역자원시스템공학과":([6,0,1,8,1,0,0,0,0],16,19,"안성"),
 # 공과대학
 "공과대학(유형2)":([48,0,4,12,0,0,0,0,0],64,75,"안성"),
 "토목공학과":([9,0,4,16,4,0,0,0,0],33,41,"안성"),
 "환경공학과":([13,0,3,9,3,0,0,0,0],28,34,"안성"),
 "안전공학과":([14,0,3,12,3,0,0,0,0],32,39,"안성"),
 "식품생명공학과":([14,0,4,15,4,0,0,0,0],37,46,"안성"),
 "화학공학과":([19,0,3,7,3,0,0,0,0],32,39,"안성"),
 "응용수학과":([6,0,1,6,1,0,0,0,0],14,17,"안성"),
 "ICT로봇공학과":([14,0,3,12,3,0,0,0,0],32,39,"안성"),
 "기계공학과":([6,0,2,6,2,0,0,0,0],16,20,"안성"),
 "전자공학과":([8,0,3,18,3,0,0,0,0],32,39,"안성"),
 "전기공학과":([3,0,2,9,2,0,0,0,0],16,20,"안성"),
 "건축학과(5년제)":([8,0,1,4,1,0,0,0,0],14,17,"안성"),
 "건축공학과":([7,0,1,3,1,0,0,0,0],12,14,"안성"),
 "의료재활공학과":([7,4,0,0,0,0,0,0,0],11,14,"평택"),
 # AI융합대학
 "AI융합대학(유형2)":([3,0,1,3,0,0,0,0,0],7,9,"안성"),
 "컴퓨터공학과":([7,0,2,6,2,0,0,0,0],17,21,"안성"),
 "인공지능학과":([9,4,2,6,2,0,0,0,0],23,28,"안성"),
 "AI반도체융합학과":([15,4,0,0,0,0,0,0,0],19,25,"평택"),
 # 디자인예술스포츠대학
 "의류산업학과":([6,0,1,6,1,6,0,0,0],20,23,"안성"),
 "스포츠과학과":([0,0,0,2,0,0,5,0,0],7,17,"안성"),
 "시각미디어디자인학과":([0,0,0,15,0,0,0,0,0],15,55,"안성"),
 "제품공간디자인학과":([9,5,0,0,0,0,0,0,0],14,17,"평택"),
 "실용음악학과":([0,0,0,0,0,0,0,9,4],13,13,"평택"),
 "귀금속보석공예학과":([8,3,0,0,0,0,0,0,0],11,13,"평택"),
 "특수체육학과":([0,12,0,0,0,0,0,0,0],12,12,"평택"),
 # 브라이트교양대학
 "HK자율전공학부Ⅰ":([45,0,10,0,0,0,0,0,0],55,102,"안성"),
 "HK자율전공학부Ⅱ":([0,17,0,0,0,0,0,0,0],17,17,"평택"),
}

# col index -> (trackName, trackTypeRaw, specialTypeKeyword, csat_exempt, csat_raw, csat_areas, refl)
# 전형방법 표(p42) 기반 reflectionStages.
def refl(components, maxscore=1000):
    return [{"stageLabel":"일괄합산","multiplier":None,"components":components,"stageMaxScore":maxscore}]

# CSAT 최저 (p11 일반전형_안성 만 적용; 그 외 미반영)
CSAT_ILBAN_ANSEONG = "대학수학능력시험 4개 영역 중 성적우수 2개 영역 등급의 합이 8등급 이내 (4개영역 중 2개). 국어·수학·영어·탐구영역에 한하여 적용. 탐구는 사회/과학탐구 중 성적우수 1개 영역 반영(직업탐구 미반영). 수학 미적분/기하 응시자는 취득등급에서 2등급 감산(수학이 2개영역에 포함될 경우에 한함, 단 HK자율전공학부Ⅰ·문예창작미디어콘텐츠홍보학과·영미언어문화학과·행정학과·법학과·경영학과·복지상담학과 지원자 제외)."
CSAT_AREAS = "국어, 수학, 영어, 탐구(사회/과학 중 1) 중 성적우수 2개 영역"

# 컬럼 메타: (trackName, trackTypeRaw, specialTypeKeyword, applies_csat_ilban_anseong, reflection_components, reflection_max)
COL_META = {
 "일반": ("학생부교과(일반전형_안성)", "학생부위주(교과)", None, True,
          {"학생부(교과)":100}, 1000),
 "특수": ("학생부교과(특수교육대상자)", "학생부위주(교과)", "특수교육대상자", False,
          {"교과":60,"면접":40}, 1000),
 "지역균형": ("학생부교과(지역균형선발_안성)", "학생부위주(교과)", "지역균형", False,
          {"학생부(교과)":100}, 1000),
 "잠재력": ("학생부종합(잠재력우수자_안성)", "학생부위주(종합)", None, False,
          {"서류":100}, 1000),
 "사회통합": ("학생부종합(사회통합_안성)", "학생부위주(종합)", "사회통합", False,
          {"서류":100}, 1000),
 "디자인": ("실기위주(디자인_안성)", "실기/실적위주", "실기", False,
          {"교과":40,"실기":60}, 1000),
 "체육": ("실기/실적위주(체육특기자_안성)", "실기/실적위주", "체육특기자", False,
          {"교과":25,"출결":5,"실적":70}, 1000),  # 250/50/700 -> %
 "음악일반": ("실기위주(음악특기자_평택)", "실기/실적위주", "음악특기자", False,
          {"실기":100}, 1000),
 "음악특수": ("실기위주(음악특기자_평택)", "실기/실적위주", "음악특기자(특수교육대상자)", False,
          {"실기":100}, 1000),
}
# 일반전형_평택(p13)은 별도 전형(수능최저 미반영). 모집단위가 아래 7개로 명시됨.
# 나머지 일반 컬럼은 일반전형_안성(p11, 387명, 수능최저 적용).
PYEONGTAEK_ILBAN = {"사회복지학과","한국수어교육학과","유아특수보육학과","의료재활공학과",
                    "AI반도체융합학과","제품공간디자인학과","귀금속보석공예학과"}
def ilban_meta(dept):
    if dept in PYEONGTAEK_ILBAN:
        return ("학생부교과(일반전형_평택)", "학생부위주(교과)", None, False, {"학생부(교과)":100}, 1000)
    return COL_META["일반"]
# 특수교육대상자: 안성 인공지능학과 + 평택 전모집단위(실용음악학과 제외). 컬럼 메타 동일.

# sourcePages per track
SP = {
 "일반_안성":[11,12],"일반_평택":[13,14],"특수":[15,16],"지역균형":[17,18],
 "잠재력":[19,20],"사회통합":[21,22,23],"디자인":[24,25],"체육":[26,27],"음악":[28,29,30],
}

def csat_for_ilban(dept):
    # CSAT 최저: 일반전형_안성만 적용(평택 7개 학과 제외)
    if dept not in PYEONGTAEK_ILBAN:
        return CSAT_ILBAN_ANSEONG, CSAT_AREAS, False
    return None, None, True

departments = []
total_tracks = 0
for dept, (vec, subtotal, ipsum, campus) in DEPTS_IN.items():
    trackhint = "인문" if dept in INMUN else "자연"
    tracks = []
    for i, c in enumerate(COLS):
        q = vec[i]
        if q == 0:
            continue
        if c == "일반":
            name, ttype, spec, applies, comps, mx = ilban_meta(dept)
            csat_raw, csat_areas, exempt = csat_for_ilban(dept)
            pages = SP["일반_평택"] if dept in PYEONGTAEK_ILBAN else SP["일반_안성"]
        else:
            name, ttype, spec, applies, comps, mx = COL_META[c]
            csat_raw, csat_areas, exempt = (None, None, True)
            pages = {"특수":SP["특수"],"지역균형":SP["지역균형"],"잠재력":SP["잠재력"],
                     "사회통합":SP["사회통합"],"디자인":SP["디자인"],"체육":SP["체육"],
                     "음악일반":SP["음악"],"음악특수":SP["음악"]}[c]
        tracks.append({
            "trackName": name,
            "trackTypeRaw": ttype,
            "recruitmentPeriodRaw": "수시",
            "specialTypeKeyword": spec,
            "quotaInitial": q,
            "applicationQualification": None,
            "reflectionStages": refl(comps, mx),
            "csatMinimumRawText": csat_raw,
            "csatMinimumExempt": exempt,
            "csatRequiredAreasRawText": csat_areas,
            "prevYearResult": None,
            "sourcePages": pages,
        })
        total_tracks += 1
    departments.append({
        "departmentName": dept,
        "campus": campus,
        "trackHint": trackhint,
        "totalQuotaHint": subtotal,
        "tracks": tracks,
    })

# ---------------------------------------------------------------------------
# colTotalValidation (정원내 전형별 colTotal vs stated 합계행)
STATED_IN = {"일반":448,"특수":80,"지역균형":80,"잠재력":299,"사회통합":61,
             "디자인":6,"체육":5,"음악일반":9,"음악특수":4}
computed = {c:0 for c in COLS}
for dept,(vec,s,ip,camp) in DEPTS_IN.items():
    for i,c in enumerate(COLS):
        computed[c]+=vec[i]
# 전형명 매핑 for colTotalValidation label
COLLABEL = {"일반":"학생부교과(일반전형_안성+평택 합산)","특수":"학생부교과(특수교육대상자)",
 "지역균형":"학생부교과(지역균형선발_안성)","잠재력":"학생부종합(잠재력우수자_안성)",
 "사회통합":"학생부종합(사회통합_안성)","디자인":"실기위주(디자인_안성)",
 "체육":"실기/실적위주(체육특기자_안성)","음악일반":"실기위주(음악특기자_평택)_일반",
 "음악특수":"실기위주(음악특기자_평택)_특수교육대상자"}
colval = []
for c in COLS:
    colval.append({"track":COLLABEL[c],"computed":computed[c],"stated":STATED_IN[c],
                   "match": computed[c]==STATED_IN[c]})

# rowSumValidation: 각 모집단위 totalQuotaHint(정원내소계) == sum(tracks quotaInitial)
row_passed=0; row_failed=0; failed_list=[]
for d in departments:
    s=sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"])
    if s==d["totalQuotaHint"]:
        row_passed+=1
    else:
        row_failed+=1
        failed_list.append({"departmentName":d["departmentName"],"sum":s,"hint":d["totalQuotaHint"]})

all_col_match = all(cv["match"] for cv in colval)
checksum = (row_failed==0 and all_col_match)

warnings = [
 "정원내 총괄표는 pdftotext -layout 출력에서 안성 학과의 지역균형/잠재력/사회통합 컬럼이 어긋나게 찍혀, -bbox-layout word x-coord 로 재정렬 후 적재함(컬럼 totals 전수 일치).",
 "정원외(특성화고교9·농어촌49·기초생활11·서해5도6·재외국민25·모집합계100)는 법정 정원외로, 대부분 학과당 1명 분산 배정이라 본 JSON 의 departments[].tracks 에는 포함하지 않음(정원내만 구조화). 정원외 track-level 합계는 meta.notesUnincluded 참조.",
 "음악특기자(평택, 실용음악학과)는 일반9·특수교육대상자4 로 대상별 선발하나 전형방법은 실기100 동일. 두 트랙으로 분리 적재.",
 "체육특기자(스포츠과학과) 배점 학생부교과250/출결50/수상실적700(총1000)을 %로 환산: 교과25/출결5/실적70.",
 "HK자율전공학부Ⅰ(안성)=일반45+지역균형10=55, HK자율전공학부Ⅱ(평택)=특수교육대상자17. 자율전공/계열광역 모집단위로 departments 에 포함.",
 "단과대학 (유형2) 광역 모집단위(인문사회과학대학·생명자원과학대학·공과대학·AI융합대학)는 소속 학과와 별개의 모집단위로 입학정원·정원내소계에 합산되므로 departments 에 각각 포함함.",
]

NOTES_UNINCLUDED = {
 "scope":"정원외(법정 정원외) — 정원내만 departments 에 구조화함",
 "tracks":{
  "학생부교과(특성화고교 졸업자)":{"안성":6,"평택":3,"total":9,"sourcePages":[32,33,34]},
  "학생부교과(농어촌학생)":{"안성":40,"평택":9,"total":49,"sourcePages":[35,36,37]},
  "학생부교과(기초생활수급자 및 차상위계층 등)":{"안성":7,"평택":4,"total":11,"sourcePages":[38,39]},
  "학생부교과(서해 5도)":{"안성":"6(통합모집)","평택":1,"total_statedColumn":6,"sourcePages":[40,41]},
  "실기위주(재외국민)":{"total":25,"note":"총괄표 재외국민 모집인원 25, 모집합계 100 구성요소. 세부전형 안내는 별도 모집요강.","sourcePages":[6]},
 },
 "정원외_모집합계_총괄표": 100,
}

meta = {
 "universityName": UNIV,
 "universityId": UID,
 "year": 2027,
 "recruitmentSeason": "susi",
 "sourceDocYear": 2027,
 "campusScope": "안성캠퍼스·평택캠퍼스 2개 캠퍼스, 6개 단과대학 42개 학과 + 자율전공학부(HK자율전공학부Ⅰ/Ⅱ) + 단과대학 광역(유형2)",
 "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
 "visionCost": 0,
 "departments": len(departments),
 "totalTracks": total_tracks,
 "rowSumValidation": {
   "basis": "totalQuotaHint(모집단위별 정원내소계) == sum(tracks.quotaInitial)",
   "passed": row_passed,
   "failed": row_failed,
   "failedList": failed_list,
 },
 "colTotalValidation": colval,
 "checksumPassed": checksum,
 "notesUnincluded": NOTES_UNINCLUDED,
}

out = {
 "meta": meta,
 "result": {
   "universityName": UNIV,
   "year": 2027,
   "recruitmentSeason": "susi",
   "departments": departments,
   "warnings": warnings,
 },
}

with open("scripts/etl/text-extract-test/hankyong-text.json","w",encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print("departments:", len(departments))
print("totalTracks:", total_tracks)
print("rowSum passed/failed:", row_passed, row_failed)
print("colTotal matched:", sum(1 for cv in colval if cv["match"]), "/", len(colval))
print("checksumPassed:", checksum)
print("입학정원 sum:", sum(ip for _,(v,s,ip,c) in DEPTS_IN.items()))
print("정원내소계 sum:", sum(s for _,(v,s,ip,c) in DEPTS_IN.items()))
