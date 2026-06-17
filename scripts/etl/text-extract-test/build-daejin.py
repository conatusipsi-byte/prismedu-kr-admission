#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build 대진대학교 2027 수시 JSON from validated 총괄표 (page 6 bbox).
Vision API 미사용. 본체 직접 구조화."""
import json, copy

CAMPUS = "경기도 포천시 (본교 단일 캠퍼스)"
PAGES_GUALTAB = 6  # 총괄표 PDF page (text page marker 11)

# ---- 총괄표 ground truth (per-dept quotas) — validated against 총계 row ----
# keys: 학생부우수자 종단추천자 학교장추천 취업자 고른기회 밝은사회 윈윈대진 실기우수자
#       정원내합계 농어촌학생 특성화고졸업자 기초생활차상위 특성화고졸재직자 군위탁생 정원외합계 전체
DEPTS = {
 "대순종학과": dict(college="대순종학대학", hint="인문", 전체=15, 종단추천자=14, 정원내합계=14, sp=[594]),
 "영어영문학과": dict(college="인문사회대학", hint="인문", 전체=29, 학생부우수자=4, 학교장추천=3, 고른기회=2, 윈윈대진=5, 정원내합계=14),
 "문예콘텐츠창작학과": dict(college="인문사회대학", hint="인문", 전체=35, 학생부우수자=5, 학교장추천=4, 고른기회=3, 윈윈대진=10, 정원내합계=22, 농어촌학생=2, 정원외합계=2),
 "역사·문화콘텐츠학과": dict(college="인문사회대학", hint="인문", 전체=25, 학생부우수자=3, 학교장추천=3, 고른기회=2, 윈윈대진=7, 정원내합계=15),
 "경영학과": dict(college="인문사회대학", hint="인문", 전체=54, 학생부우수자=7, 학교장추천=6, 고른기회=4, 윈윈대진=12, 정원내합계=29, 농어촌학생=3, 특성화고졸업자=3, 정원외합계=6),
 "글로벌경제학과": dict(college="인문사회대학", hint="인문", 전체=47, 학생부우수자=6, 학교장추천=5, 고른기회=4, 윈윈대진=12, 정원내합계=27, 기초생활차상위=2, 정원외합계=2),
 "국제통상학과": dict(college="인문사회대학", hint="인문", 전체=44, 학생부우수자=5, 학교장추천=5, 고른기회=3, 윈윈대진=10, 정원내합계=23, 농어촌학생=2, 특성화고졸업자=2, 정원외합계=4),
 "공공인재법학과": dict(college="인문사회대학", hint="인문", 전체=43, 학생부우수자=5, 학교장추천=4, 고른기회=5, 윈윈대진=12, 정원내합계=26, 농어촌학생=2, 정원외합계=2),
 "국제지역학과": dict(college="인문사회대학", hint="인문", 전체=35, 학생부우수자=4, 학교장추천=5, 고른기회=3, 윈윈대진=10, 정원내합계=22),
 "중국학과": dict(college="인문사회대학", hint="인문", 전체=41, 학생부우수자=4, 학교장추천=5, 고른기회=3, 윈윈대진=10, 정원내합계=22, 농어촌학생=2, 정원외합계=2),
 "아동학과": dict(college="인문사회대학", hint="인문", 전체=23, 학생부우수자=4, 학교장추천=4, 고른기회=1, 윈윈대진=5, 정원내합계=14, 농어촌학생=2, 정원외합계=2),
 "사회복지학과": dict(college="인문사회대학", hint="인문", 전체=38, 학생부우수자=6, 학교장추천=5, 고른기회=3, 윈윈대진=10, 정원내합계=24, 농어촌학생=2, 기초생활차상위=2, 정원외합계=4),
 "미디어커뮤니케이션학과": dict(college="인문사회대학", hint="인문", 전체=54, 학생부우수자=7, 학교장추천=6, 고른기회=5, 윈윈대진=12, 정원내합계=30, 농어촌학생=4, 특성화고졸업자=3, 기초생활차상위=3, 정원외합계=10),
 "행정정보학과": dict(college="인문사회대학", hint="인문", 전체=47, 학생부우수자=6, 학교장추천=6, 고른기회=5, 윈윈대진=12, 정원내합계=29, 농어촌학생=2, 정원외합계=2),
 "문헌정보학과[교직]": dict(college="인문사회대학", hint="인문", 전체=39, 학생부우수자=5, 학교장추천=5, 고른기회=4, 윈윈대진=10, 정원내합계=24, 농어촌학생=2, 정원외합계=2),
 "의생명과학과": dict(college="보건과학대학", hint="자연", 전체=56, 학생부우수자=6, 학교장추천=6, 고른기회=6, 윈윈대진=15, 정원내합계=33, 농어촌학생=2, 정원외합계=2),
 "식품영양학과[교직]": dict(college="보건과학대학", hint="자연", 전체=33, 학생부우수자=5, 학교장추천=4, 고른기회=2, 윈윈대진=10, 정원내합계=21, 농어촌학생=2, 기초생활차상위=2, 정원외합계=4),
 "간호학과": dict(college="보건과학대학", hint="자연", 전체=65, 학생부우수자=13, 윈윈대진=36, 정원내합계=49, 농어촌학생=3, 기초생활차상위=3, 정원외합계=6),
 "보건경영학과": dict(college="보건과학대학", hint="자연", 전체=30, 학생부우수자=5, 학교장추천=7, 고른기회=2, 윈윈대진=7, 정원내합계=21),
 "스포츠건강과학과": dict(college="보건과학대학", hint="자연", 전체=36, 실기우수자=25, 정원내합계=25, 농어촌학생=3, 기초생활차상위=2, 정원외합계=5),
 "공학자율학부": dict(college="AI공과대학", hint="자연", 전체=135, 학생부우수자=25, 학교장추천=23, 고른기회=15, 밝은사회=14, 정원내합계=77),
 "전기공학과[교직]★": dict(college="AI공과대학", hint="자연", 전체=37, 학생부우수자=7, 학교장추천=7, 고른기회=3, 윈윈대진=10, 정원내합계=27),
 "건축공학과": dict(college="AI공과대학", hint="자연", 전체=39, 학생부우수자=10, 학교장추천=6, 고른기회=3, 윈윈대진=12, 정원내합계=31, 농어촌학생=2, 정원외합계=2),
 "AI건설융합공학과": dict(college="AI공과대학", hint="자연", 전체=25, 학생부우수자=4, 학교장추천=3, 고른기회=1, 윈윈대진=10, 정원내합계=18, 농어촌학생=2, 정원외합계=2),
 "스마트시티·환경공학과": dict(college="AI공과대학", hint="자연", 전체=45, 학생부우수자=12, 학교장추천=7, 고른기회=2, 윈윈대진=14, 정원내합계=35),
 "데이터경영산업공학과[교직]": dict(college="AI공과대학", hint="자연", 전체=23, 학생부우수자=5, 학교장추천=4, 고른기회=2, 윈윈대진=8, 정원내합계=19),
 "반도체융합공학과": dict(college="AI공과대학", hint="자연", 전체=50, 학생부우수자=10, 학교장추천=7, 고른기회=3, 윈윈대진=10, 정원내합계=30, 농어촌학생=2, 정원외합계=2),
 "IT기계공학과[교직]": dict(college="AI공과대학", hint="자연", 전체=30, 학생부우수자=5, 학교장추천=5, 고른기회=3, 윈윈대진=10, 정원내합계=23, 특성화고졸업자=2, 정원외합계=2),
 "화학공학과[교직]": dict(college="AI공과대학", hint="자연", 전체=25, 학생부우수자=4, 학교장추천=3, 고른기회=1, 윈윈대진=10, 정원내합계=18, 기초생활차상위=2, 정원외합계=2),
 "컴퓨터공학과[교직]": dict(college="AI공과대학", hint="자연", 전체=50, 학생부우수자=7, 학교장추천=7, 고른기회=5, 윈윈대진=15, 정원내합계=34, 농어촌학생=3, 특성화고졸업자=3, 기초생활차상위=3, 정원외합계=9),
 "스마트융합보안학과": dict(college="AI공과대학", hint="자연", 전체=49, 학생부우수자=10, 학교장추천=8, 고른기회=3, 윈윈대진=10, 정원내합계=31, 농어촌학생=2, 정원외합계=2),
 "AI빅데이터공학과": dict(college="AI공과대학", hint="자연", 전체=36, 학생부우수자=7, 학교장추천=4, 고른기회=2, 윈윈대진=12, 정원내합계=25, 농어촌학생=2, 정원외합계=2),
 "스마트모빌리티공학과": dict(college="AI공과대학", hint="자연", 전체=60, 학생부우수자=10, 학교장추천=12, 고른기회=5, 윈윈대진=12, 정원내합계=39, 농어촌학생=2, 정원외합계=2),
 "연기예술학과[교직]": dict(college="예술대학", hint="인문", 전체=29, 고른기회=2, 실기우수자=19, 정원내합계=21, 농어촌학생=2, 특성화고졸업자=2, 정원외합계=4),
 "영화영상학과[교직]": dict(college="예술대학", hint="인문", 전체=34, 고른기회=2, 실기우수자=25, 정원내합계=27, 농어촌학생=2, 특성화고졸업자=2, 정원외합계=4),
 "만화게임그래픽학과": dict(college="예술대학", hint="인문", 전체=40, 실기우수자=30, 정원내합계=30),
 "시각디자인학과[교직]": dict(college="예술대학", hint="인문", 전체=30, 실기우수자=20, 정원내합계=20, 농어촌학생=3, 특성화고졸업자=2, 정원외합계=5),
 "산업디자인학과[교직]": dict(college="예술대학", hint="인문", 전체=30, 실기우수자=20, 정원내합계=20, 농어촌학생=2, 정원외합계=2),
 "자율전공학부": dict(college="상생교양대학", hint="인문", 전체=181, 학생부우수자=50, 학교장추천=30, 고른기회=10, 밝은사회=6, 윈윈대진=20, 정원내합계=116),
 "휴먼케어평생교육학과(야)": dict(college="상생교양대학", hint="인문", 전체=1, 취업자=1, 정원내합계=1, 특성화고졸재직자=11, 정원외합계=11),
 "드론산업학과(야)": dict(college="상생교양대학", hint="자연", 전체=1, 취업자=1, 정원내합계=1),
}

# ---- track definitions: column -> (trackName, trackTypeRaw, specialKeyword, stages, detailPage) ----
def stages_jung(*comps_list):
    return comps_list

# reflection stage templates
ST_70_30 = [{"stageLabel":"일괄합산","multiplier":None,"components":{"학생부(교과)":70,"면접":30},"stageMaxScore":1000}]
ST_100 = [{"stageLabel":"일괄합산","multiplier":None,"components":{"학생부(교과)":100},"stageMaxScore":1000}]
ST_20_80 = [{"stageLabel":"일괄합산","multiplier":None,"components":{"학생부(교과)":20,"실기":80},"stageMaxScore":1000}]
ST_WINWIN = [
  {"stageLabel":"1단계","multiplier":3.0,"components":{"서류":100},"stageMaxScore":1000},
  {"stageLabel":"2단계","multiplier":None,"components":{"교과":70,"면접":30},"stageMaxScore":1000},
]
# note: 윈윈 2단계 = 1단계 성적 70% + 면접 30% (1단계점수 carried)

TRACKS = {
 "학생부우수자": dict(name="학생부교과(학생부우수자전형)", traw="학생부위주(교과)", sp=None, stages=ST_70_30, pages=[16], qual="국내 고등학교 졸업(예정)자 및 졸업학력 검정고시 합격자 등"),
 "종단추천자": dict(name="학생부교과(종단추천자전형)", traw="학생부위주(교과)", sp="종단추천", stages=ST_70_30, pages=[18], qual="대순진리회 각 방면 수임선감(책임자)의 추천을 받은 자"),
 "학교장추천": dict(name="학생부교과(학교장추천전형)", traw="학생부위주(교과)", sp="학교장추천", stages=ST_100, pages=[20], qual="소속(졸업) 고등학교장의 추천을 받은 자 (학교별 추천인원 제한 없음)"),
 "취업자": dict(name="학생부교과(취업자전형)", traw="학생부위주(교과)", sp="취업자", stages=ST_100, pages=[22], qual="원서접수 개시일 기준 통산 6개월 이상 취업기관 근무 재직자"),
 "고른기회": dict(name="학생부교과(고른기회전형)", traw="학생부위주(교과)", sp="고른기회", stages=ST_100, pages=[24], qual="국가보훈대상자·농어촌학생(정원내)·기초생활수급권자 및 차상위·특성화고교졸업자·만학도 등"),
 "밝은사회": dict(name="학생부교과(밝은사회전형)", traw="학생부위주(교과)", sp="밝은사회", stages=ST_100, pages=[28], qual="사회기여자 자녀·다자녀가정 자녀·다문화가정 자녀"),
 "윈윈대진": dict(name="학생부종합(윈윈대진전형)", traw="학생부위주(종합)", sp=None, stages=ST_WINWIN, pages=[30], qual="국내 고등학교 졸업(예정)자 및 졸업학력 검정고시 합격자 등"),
 "실기우수자": dict(name="실기/실적위주(실기우수자전형)", traw="실기/실적위주", sp=None, stages=ST_20_80, pages=[32], qual="국내 고등학교 졸업(예정)자 및 졸업학력 검정고시 합격자 등"),
 # 정원외
 "농어촌학생": dict(name="학생부교과(농어촌학생전형-정원외)", traw="학생부위주(교과)", sp="농어촌", stages=ST_100, pages=[34], qual="읍·면지역 및 도서·벽지지역 소재 고교 졸업(예정)자로 가형/나형 충족자 (정원외)"),
 "특성화고졸업자": dict(name="학생부교과(특성화고교졸업자전형-정원외)", traw="학생부위주(교과)", sp="특성화고졸업자", stages=ST_100, pages=[36], qual="특성화고등학교 졸업(예정)자로 본교 모집단위와 동일계열인 자 (정원외)"),
 "기초생활차상위": dict(name="학생부교과(기초생활수급권자 및 차상위계층전형-정원외)", traw="학생부위주(교과)", sp="기회균형", stages=ST_100, pages=[38], qual="국민기초생활보장법 수급권자·차상위계층·한부모가족지원 대상자 (정원외)"),
 "특성화고졸재직자": dict(name="학생부교과(특성화고졸재직자전형-정원외)", traw="학생부위주(교과)", sp="특성화고졸재직자", stages=ST_100, pages=[40], qual="특성화고 등 졸업 후 산업체 근무경력 3년 이상 재직자 (정원외)"),
 # 군위탁생: quota '00' (미정) → 별도 처리, totalQuotaHint 제외
}

CSAT_RAW = "수능최저학력기준 : 없음"

# column key -> dept dict key for quota
def build():
    departments=[]
    warnings=[]
    inner_cols=["학생부우수자","종단추천자","학교장추천","취업자","고른기회","밝은사회","윈윈대진","실기우수자"]
    outer_cols=["농어촌학생","특성화고졸업자","기초생활차상위","특성화고졸재직자"]  # 군위탁생 excluded (no quota)
    for dname, d in DEPTS.items():
        tracks=[]
        # build inner tracks
        for col in inner_cols + outer_cols:
            q = d.get(col)
            if q is None: continue
            t = TRACKS[col]
            tr = {
                "trackName": t["name"],
                "trackTypeRaw": t["traw"],
                "recruitmentPeriodRaw": "수시",
                "specialTypeKeyword": t["sp"],
                "quotaInitial": q,
                "applicationQualification": t["qual"],
                "reflectionStages": copy.deepcopy(t["stages"]),
                "csatMinimumRawText": CSAT_RAW,
                "csatMinimumExempt": True,
                "csatRequiredAreasRawText": None,
                "prevYearResult": None,
                "sourcePages": [PAGES_GUALTAB] + t["pages"],
            }
            tracks.append(tr)
        # totalQuotaHint = 정원내합계 + 정원외합계 (sum of all susi tracks present)
        inner_sum = sum(d.get(c,0) for c in inner_cols)
        outer_sum = sum(d.get(c,0) for c in outer_cols)
        total_hint = inner_sum + outer_sum
        departments.append({
            "departmentName": dname,
            "campus": CAMPUS,
            "trackHint": d["hint"],
            "totalQuotaHint": total_hint,
            "tracks": tracks,
        })
    # warning about 군위탁생
    warnings.append("군위탁생전형(정원외)은 드론산업학과(야) 대상이며 모집인원이 '00명'(미정)으로 표기되어 총괄표 열 합계에서도 '-'(없음) 처리됨. 어떤 모집단위 totalQuotaHint에도 포함하지 않았고 트랙으로도 생성하지 않음.")
    warnings.append("정원외 특별전형(농어촌·특성화고졸업자·기초생활/차상위·특성화고졸재직자)은 각 모집단위 총괄표 행에 정원외합계로 별도 집계되어 있어 totalQuotaHint(=정원내합계+정원외합계)에 포함함. 총괄표 행/열 합계와 정합.")
    warnings.append("종단추천자전형(14명)은 총괄표상 대순종학과 단일 모집단위에만 배정됨. 윈윈대진(학생부종합) 다단계: 1단계 서류100%(3배수)→2단계 1단계성적70%+면접30%.")
    warnings.append("드론산업학과(야)는 취업자전형 정원내 1명만 수시 배정(군위탁생 정원외는 미정 제외). 휴먼케어평생교육학과(야)는 취업자 정원내 1명+특성화고졸재직자 정원외 11명.")
    warnings.append("prevYearResult(2026 전형결과)는 별도 표로 존재하나 스키마 지침에 따라 null 처리.")
    return departments, warnings

departments, warnings = build()

# ---- compute meta validations ----
# rowSum: per-dept totalQuotaHint vs (정원내합계+정원외합계) from 총괄표
rowfail=[]
for dname,d in DEPTS.items():
    inner_cols=["학생부우수자","종단추천자","학교장추천","취업자","고른기회","밝은사회","윈윈대진","실기우수자"]
    outer_cols=["농어촌학생","특성화고졸업자","기초생활차상위","특성화고졸재직자"]
    computed = sum(d.get(c,0) for c in inner_cols+outer_cols)
    stated = d.get("정원내합계",0) + d.get("정원외합계",0)
    if computed != stated:
        rowfail.append({"dept":dname,"computed":computed,"stated":stated})

# colTotalValidation: per-track column total vs 총계 row stated
STATED_COL = {"학생부우수자":266,"종단추천자":14,"학교장추천":209,"취업자":2,"고른기회":119,
 "밝은사회":20,"윈윈대진":358,"실기우수자":139,"농어촌학생":57,"특성화고졸업자":19,
 "기초생활차상위":19,"특성화고졸재직자":11}
TRACKNAME = {k:TRACKS[k]["name"] for k in STATED_COL}
colval=[]
for col,stated in STATED_COL.items():
    computed = sum(d.get(col,0) for d in DEPTS.values())
    colval.append({"track":TRACKNAME[col],"computed":computed,"stated":stated,"match":computed==stated})

checksum_passed = (len(rowfail)==0) and all(c["match"] for c in colval)
total_tracks = sum(len(d["tracks"]) for d in departments)
extracted_sum = sum(d["totalQuotaHint"] for d in departments)

meta = {
 "universityName":"대진대학교","universityId":"kcue_0000097","year":2027,
 "recruitmentSeason":"susi","sourceDocYear":2027,
 "campusScope": CAMPUS,
 "method":"pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)","visionCost":0,
 "departments":len(departments),"totalTracks":total_tracks,
 "rowSumValidation":{"basis":"totalQuotaHint(모집단위별 수시 전형 인원 합)","passed":len(DEPTS)-len(rowfail),"failed":len(rowfail),"failedList":[r["dept"] for r in rowfail]},
 "colTotalValidation":colval,
 "checksumPassed":checksum_passed,
}
result = {
 "universityName":"대진대학교","year":2027,"recruitmentSeason":"susi",
 "departments":departments,"warnings":warnings,
}
out = {"meta":meta,"result":result}
with open("scripts/etl/text-extract-test/daejin-text.json","w",encoding="utf-8") as f:
    json.dump(out,f,ensure_ascii=False,indent=2)

print("departments",len(departments),"tracks",total_tracks)
print("rowfail",len(rowfail), rowfail)
print("colmatch", sum(1 for c in colval if c['match']),"/",len(colval))
print("checksum_passed",checksum_passed)
print("extracted_sum(정원내+정원외 susi)",extracted_sum)
print("총괄표 정원내합계 총계 1127 + 정원외합계 106 = 1233")
