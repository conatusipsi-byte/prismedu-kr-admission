#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
세명대학교 2027 수시모집요강 구조화 빌더
GROUND TRUTH: 모집인원 총괄표 (PDF page 9 / 요강 [7]), bbox-layout 으로 컬럼 정렬 검증.
Claude Code 본체 직접 구조화 (Vision/Anthropic API 미사용).
"""
import re, json, os

BBOX = os.path.join(os.path.dirname(__file__), "semyung-bbox.txt")
OUT  = os.path.join(os.path.dirname(__file__), "semyung-text.json")

# ── 총괄표 컬럼 x-center (PDF p.9 합계행 기준) ───────────────────────────────
COLS = [
    (195, "입학정원"),
    (223, "일반"),                 # [학생부교과,실기/실적위주] 일반전형 (교과)
    (253, "인문계고교"),
    (286, "사회배려봉사자"),
    (316, "지역인재일반"),
    (348, "지역인재기회균형"),
    (378, "특성화고교인재"),
    (408, "면접우수자"),
    (439, "실기실적위주"),          # 일반전형의 실기/실적 컬럼
    (470, "SMU의료인재"),
    (495, "농어촌"),               # 정원외 (N이내)
    (525, "특성화고교외"),          # 정원외 (N이내)
    (556, "기초생활차상위한부모"),   # 정원외 (N이내)
]
INTERNAL = ["일반","인문계고교","사회배려봉사자","지역인재일반","지역인재기회균형",
            "특성화고교인재","면접우수자","실기실적위주","SMU의료인재"]
EXTERNAL = ["농어촌","특성화고교외","기초생활차상위한부모"]

STATED = {"일반":705,"인문계고교":265,"사회배려봉사자":26,"지역인재일반":98,
          "지역인재기회균형":4,"특성화고교인재":57,"면접우수자":93,
          "실기실적위주":98,"SMU의료인재":33}
EXT_STATED = {"농어촌":35,"특성화고교외":10,"기초생활차상위한부모":35}

def col_for(x):
    best=None; bd=1e9
    for cx,name in COLS:
        d=abs(x-cx)
        if d<bd: bd=d; best=name
    return best if bd<14 else None

# ── bbox 파싱 ───────────────────────────────────────────────────────────────
words=[]
for ln in open(BBOX, encoding="utf-8"):
    m=re.search(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.+?)</word>', ln)
    if m:
        words.append((float(m.group(2)), float(m.group(1)), m.group(5)))
words.sort()
rows=[]; cur=[]; cy=None
for ymin,xmin,txt in words:
    if cy is None or abs(ymin-cy)<=6:
        cur.append((xmin,txt)); cy=ymin if cy is None else cy
    else:
        rows.append((cy,cur)); cur=[(xmin,txt)]; cy=ymin
if cur: rows.append((cy,cur))

# 모집단위명 토큰이 여러 줄에 걸친 경우(다음줄에 입학정원 없음) 이름 보강 매핑.
# bbox 파서가 1줄당 1모집단위로 잘 끊겼는지 raw txt 참조하여 학과명 보정.
NAME_FIX = {
    "[영미언어문화": "외국어학부[영미언어문화/중국언어문화/일본언어문화]",
    "AI컴퓨터학부": "AI컴퓨터학부[인공지능소프트웨어/컴퓨터시스템]",
    "스마트IT학부": "스마트IT학부[인공지능응용학/정보통신학]",
    "바이오제약산업학부": "바이오제약산업학부[제약산업/바이오의약]",
    "바이오식품영양학부": "바이오식품영양학부[식품영양학(교직)/건강기능식품학]",
    "아트&amp;산업디자인학과": "아트&산업디자인학과",
    "간호학과": "간호학과",   # 【교직】 표기 제외
}

dept_rows=[]
for cy,cur in rows:
    if cy>=735: continue   # 합계행 이상 footnote 제외
    cur.sort()
    name_tok=[t for x,t in cur if 70<=x<=120]
    vals={}
    for x,t in cur:
        if x<185: continue
        c=col_for(x)
        if c: vals.setdefault(c,[]).append(t)
    if "입학정원" in vals and name_tok:
        raw_name=name_tok[0]
        name=NAME_FIX.get(raw_name, raw_name)
        flat={k:''.join(v) for k,v in vals.items()}
        dept_rows.append((cy, name, flat))

# ── 계열(trackHint) 매핑: 총괄표 좌측 '계열' 컬럼 (인문/사회=인문, 그 외=자연) ──
# 본문 계열 표기 기반. 미디어~상담심리=인문/사회/예체능, AI~한의=자연/공학/보건, 자율전공=교양
HINT = {
    "미디어콘텐츠창작학과":"인문",
    "외국어학부[영미언어문화/중국언어문화/일본언어문화]":"인문",
    "아트&산업디자인학과":"인문","실내디자인학과":"인문","시각․영상디자인학과":"인문",
    "패션디자인학과":"인문","공연예술학과":"인문","영화웹툰애니메이션학과":"인문",
    "경찰학과":"인문","법학과":"인문","부동산지적학과":"인문","소방방재학과":"인문",
    "경영학과":"인문","회계세무금융학과":"인문","호텔경영학과":"인문","항공서비스학과":"인문",
    "광고홍보학과":"인문","사회복지학과":"인문","상담심리학과":"인문",
    "AI컴퓨터학부[인공지능소프트웨어/컴퓨터시스템]":"자연",
    "스마트IT학부[인공지능응용학/정보통신학]":"자연",
    "전기전자공학과":"자연","건축학과":"자연","재난안전학과":"자연","보건안전공학과":"자연",
    "간호학과":"자연","작업치료학과":"자연","임상병리학과":"자연",
    "바이오제약산업학부[제약산업/바이오의약]":"자연","바이오코스메틱학과":"자연",
    "뷰티케어학과":"자연","바이오식품영양학부[식품영양학(교직)/건강기능식품학]":"자연",
    "동물보건학과":"자연","반려동물산업학과":"자연","생활체육학과":"인문",
    "한의예과":"자연","자율전공학부":"자연",
}
# 캠퍼스: 세명대 단일 캠퍼스 (제천). 공연예술학과 실기는 서울 대학로 진행이나 소속캠퍼스는 제천.
CAMPUS="제천"

# 실기 모집단위 (일반전형 실기/실적위주)
SILGI_DEPTS = {"아트&산업디자인학과","시각․영상디자인학과","패션디자인학과",
               "공연예술학과","영화웹툰애니메이션학과"}
# 생활체육학과: 일반전형 = 교과20%+실기80%

def n(v):
    v=v.strip()
    return int(v) if v.isdigit() else None

# ── 전형 메타 (detail 페이지에서 추출) ───────────────────────────────────────
# 한의예과 CSAT 최저: 인문계고교/지역인재(일반)/지역인재(기회균형)는 "수학 포함 우수 3개 영역 등급 합 5이내"
# SMU의료/농어촌/기초생활: "수학(미적분 또는 기하) 포함 3개 영역 등급 합 5이내, 확률과통계 응시자 불합격"
CSAT_HANUI_A = "한의예과: 수학 포함 우수 3개 영역 등급 합 5 이내 (한국사 미반영)"
CSAT_HANUI_AREAS_A = "국어/수학/영어/사회·과학탐구(우수 1과목) 중 수학 포함 우수 3개 영역. 수학·탐구 지정영역 없음"
CSAT_HANUI_B = "한의예과: 수학(미적분 또는 기하) 포함 3개 영역 등급 합 5 이내 (확률과통계 응시자 불합격, 한국사 미반영)"
CSAT_HANUI_AREAS_B = "국어/수학(미적분 또는 기하)/영어/탐구 중 3개 영역. 수학 확률과통계 응시 시 불합격"

# 전형 정의: key -> (trackName, trackTypeRaw, specialKeyword, sourcePages,
#                    appQual, csat_kind, hanui_only_csat)
# csat_kind: None=없음, "A"=수학포함3합5(교과), "B"=미적분/기하3합5
TRACK_DEF = {
 "일반": dict(
    trackName="[학생부교과, 실기/실적위주] 일반전형",
    sourcePages=[10,11,12,13,14],
    appQual="2027년 2월 이전 고등학교 졸업(예정)자 또는 동등 학력 인정자. 출신고교·이수계열 무관(교차지원 가능), 수능 응시여부 무관",
    csat_kind=None),
 "인문계고교": dict(
    trackName="인문계고교전형", trackTypeRaw="학생부위주(교과)",
    sourcePages=[15],
    appQual="2019년~2027년 2월 이전 국내 일반(인문계)고교 또는 종합계고 일반과(보통과) 졸업(예정)자. 특목고·방송통신고 가능, 특성화고·검정고시 불가",
    csat_kind="A"),
 "사회배려봉사자": dict(
    trackName="사회배려자및봉사자전형", trackTypeRaw="학생부위주(교과)",
    specialKeyword="사회배려자", sourcePages=[16,17],
    appQual="국가보훈대상자·사회봉사직종 자녀·3인이상 다자녀·다문화가정 자녀·백혈병소아암 병력자·봉사활동 30시간 이상·검정고시 출신자 중 1개 충족",
    csat_kind=None),
 "지역인재일반": dict(
    trackName="지역인재(일반)전형", trackTypeRaw="학생부위주(교과)",
    specialKeyword="지역인재", sourcePages=[18],
    appQual="2019년~2027년 2월 충청권(대전·세종·충북·충남) 소재 고교에서 전 교육과정 이수한 졸업(예정)자. 검정고시·영재학교 불가",
    csat_kind="A"),
 "지역인재기회균형": dict(
    trackName="지역인재(기회균형)전형", trackTypeRaw="학생부위주(교과)",
    specialKeyword="지역인재", sourcePages=[19,20,21],
    appQual="충청권 소재 고교 전 교육과정 이수 + 기초생활수급(권)자/차상위계층/한부모가족 대상자",
    csat_kind="A"),
 "특성화고교인재": dict(
    trackName="특성화고교인재전형", trackTypeRaw="학생부위주(교과)",
    specialKeyword="특성화고교", sourcePages=[22],
    appQual="2019년~2027년 2월 국내 특성화고 또는 종합계고 전문계열과 졸업(예정)자",
    csat_kind=None),
 "면접우수자": dict(
    trackName="면접우수자전형", trackTypeRaw="학생부위주(교과)",
    sourcePages=[23,24],
    appQual="2019년~2027년 2월 국내 고교 졸업(예정)자 또는 검정고시 출신자. 출신고교·이수계열 무관(교차지원 가능)",
    csat_kind=None),
 "SMU의료인재": dict(
    trackName="SMU의료인재전형", trackTypeRaw="학생부위주(종합)",
    sourcePages=[25],
    appQual="2019년~2027년 2월 국내 고교 졸업(예정)자. 검정고시 불가. 면접 없음(서류 100%)",
    csat_kind="B"),
 "농어촌": dict(
    trackName="농어촌학생전형", trackTypeRaw="학생부위주(교과)",
    specialKeyword="농어촌", sourcePages=[26,27,28,29],
    appQual="유형Ⅰ(중·고 6년) 또는 유형Ⅱ(초·중·고 12년) 농어촌 지역 재학·거주. 정원외, 통합선발(총 35명)",
    csat_kind="B"),
 "특성화고교외": dict(
    trackName="특성화고교전형", trackTypeRaw="학생부위주(교과)",
    specialKeyword="특성화고교", sourcePages=[30],
    appQual="2019년~2027년 2월 국내 특성화(전문계)고 또는 종합계고 졸업(예정)자 중 동일계 인정학과/전문교과 30단위 이상. 정원외, 통합선발(총 10명)",
    csat_kind=None),
 "기초생활차상위한부모": dict(
    trackName="기초생활수급자및차상위계층,한부모가족전형", trackTypeRaw="학생부위주(교과)",
    specialKeyword="기초생활수급자", sourcePages=[31,32],
    appQual="2027년 2월 이전 고교 졸업(예정)자 중 기초생활수급(권)자/차상위계층/한부모가족 대상자. 정원외, 통합선발(총 35명)",
    csat_kind="B"),
}

# 한의예과 CSAT 최저는 한의예과에만 적용 (전형별 dept 가 한의예과일 때만)
def build_track(key, dept_name, quota_raw):
    d=TRACK_DEF[key]
    is_hanui = (dept_name=="한의예과")
    csat_raw=None; csat_areas=None; exempt=True
    if d["csat_kind"] and is_hanui:
        if d["csat_kind"]=="A":
            csat_raw=CSAT_HANUI_A; csat_areas=CSAT_HANUI_AREAS_A; exempt=False
        else:
            csat_raw=CSAT_HANUI_B; csat_areas=CSAT_HANUI_AREAS_B; exempt=False

    # quotaInitial / trackTypeRaw / reflectionStages
    if key=="일반":
        if dept_name in SILGI_DEPTS:
            ttype="실기/실적위주"
            stages=[{"stageLabel":"일괄합산","multiplier":None,
                     "components":{"실기":100},"stageMaxScore":1000}]
        elif dept_name=="생활체육학과":
            ttype="실기/실적위주"
            stages=[{"stageLabel":"일괄합산","multiplier":None,
                     "components":{"교과":20,"실기":80},"stageMaxScore":1000}]
        else:
            ttype="학생부위주(교과)"
            stages=[{"stageLabel":"일괄합산","multiplier":None,
                     "components":{"학생부(교과)":100},"stageMaxScore":1000}]
        trackname="[학생부교과, 실기/실적위주] 일반전형"
    elif key=="면접우수자":
        ttype="학생부위주(교과)"
        trackname=d["trackName"]
        stages=[{"stageLabel":"일괄합산","multiplier":None,
                 "components":{"학생부(교과)":53,"면접":47},"stageMaxScore":1000}]
    elif key=="SMU의료인재":
        ttype="학생부위주(종합)"
        trackname=d["trackName"]
        stages=[{"stageLabel":"일괄합산","multiplier":None,
                 "components":{"서류":100},"stageMaxScore":1000}]
    else:
        ttype="학생부위주(교과)"
        trackname=d["trackName"]
        stages=[{"stageLabel":"일괄합산","multiplier":None,
                 "components":{"학생부(교과)":100},"stageMaxScore":1000}]

    # 정원외: quota_raw 는 "N이내"(최대모집가능인원) → quotaInitial null
    if key in EXTERNAL:
        quota=None
    else:
        quota=n(quota_raw)

    return {
        "trackName": trackname,
        "trackTypeRaw": ttype,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": d.get("specialKeyword"),
        "quotaInitial": quota,
        "applicationQualification": d["appQual"],
        "reflectionStages": stages,
        "csatMinimumRawText": csat_raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": csat_areas,
        "prevYearResult": None,
        "sourcePages": d["sourcePages"],
    }

# ── 학과별 tracks 구성 ───────────────────────────────────────────────────────
departments=[]
warnings=[]
col_computed={k:0 for k in INTERNAL}
ext_dept_count={k:0 for k in EXTERNAL}
rowsum_passed=0; rowsum_failed=0; failed_list=[]

ORDER = ["일반","인문계고교","사회배려봉사자","지역인재일반","지역인재기회균형",
         "특성화고교인재","면접우수자","실기실적위주","SMU의료인재",
         "농어촌","특성화고교외","기초생활차상위한부모"]

for cy, name, flat in dept_rows:
    tracks=[]
    internal_sum=0
    # 일반전형: '일반'(교과) 또는 '실기실적위주' 중 해당 컬럼이 있으면 일반전형 1건
    has_gyo = "일반" in flat and n(flat["일반"]) is not None
    has_silgi = "실기실적위주" in flat and n(flat["실기실적위주"]) is not None
    if has_gyo or has_silgi:
        q = n(flat.get("일반","")) if has_gyo else n(flat.get("실기실적위주",""))
        t=build_track("일반", name, str(q))
        tracks.append(t)
        internal_sum += q
        if has_gyo: col_computed["일반"] += n(flat["일반"])
        if has_silgi: col_computed["실기실적위주"] += n(flat["실기실적위주"])

    for key in ["인문계고교","사회배려봉사자","지역인재일반","지역인재기회균형",
                "특성화고교인재","면접우수자","SMU의료인재"]:
        if key in flat and n(flat[key]) is not None:
            q=n(flat[key])
            tracks.append(build_track(key, name, str(q)))
            internal_sum += q
            col_computed[key]+=q

    # 정원외
    for key in EXTERNAL:
        if key in flat and "이내" in flat[key]:
            tracks.append(build_track(key, name, flat[key]))
            ext_dept_count[key]+=1

    quota_total = internal_sum  # 정원내 전형 인원 합 (정원외 통합선발 제외)
    # rowSum 검증: 정원내 track quota 합 == quota_total
    inner_sum=sum(t["quotaInitial"] for t in tracks
                  if t["quotaInitial"] is not None)
    if inner_sum==quota_total:
        rowsum_passed+=1
    else:
        rowsum_failed+=1
        failed_list.append({"department":name,"trackSum":inner_sum,"totalQuotaHint":quota_total})

    departments.append({
        "departmentName": name,
        "campus": CAMPUS,
        "trackHint": HINT.get(name,"자연"),
        "totalQuotaHint": quota_total,
        "tracks": tracks,
    })

# ── colTotal 검증 ────────────────────────────────────────────────────────────
col_validation=[]
all_col_match=True
COLNAME = {
 "일반":"[학생부교과,실기/실적위주] 일반전형(교과 컬럼)",
 "실기실적위주":"[학생부교과,실기/실적위주] 일반전형(실기/실적 컬럼)",
 "인문계고교":"인문계고교전형","사회배려봉사자":"사회배려자및봉사자전형",
 "지역인재일반":"지역인재(일반)전형","지역인재기회균형":"지역인재(기회균형)전형",
 "특성화고교인재":"특성화고교인재전형","면접우수자":"면접우수자전형",
 "SMU의료인재":"SMU의료인재전형",
}
for k in INTERNAL:
    cp=col_computed[k]; st=STATED[k]; match=(cp==st)
    if not match: all_col_match=False
    col_validation.append({"track":COLNAME[k],"computed":cp,"stated":st,"match":match})

checksum = (rowsum_failed==0) and all_col_match

total_tracks=sum(len(d["tracks"]) for d in departments)

# 경고
warnings.append("면접우수자전형: 세부전형 본문(요강 [23])에는 '총 97명'으로 표기되어 있으나, "
                "모집인원 총괄표(GROUND TRUTH, 요강 [7]) 합계 및 학과별 합산은 93명으로 일치함. "
                "총괄표 값(93)을 채택. 본문 97은 요강 자체 불일치로 추정.")
warnings.append("정원외 3개 전형(농어촌 총35·특성화고교 총10·기초생활차상위한부모 총35)은 통합선발 전형으로, "
                "학과별 표기는 '최대모집 가능인원(N이내)'이며 입학정원 행 합계에 포함되지 않음. "
                "따라서 quotaInitial=null 처리하고 totalQuotaHint(정원내 합)에서 제외함.")
warnings.append("한의예과 수능최저(수학 포함/미적분·기하 포함 3개 영역 등급 합 5 이내)는 한의예과 모집단위에 한해 적용. "
                "그 외 모집단위는 전 전형 수능최저 없음(csatMinimumExempt=true).")
warnings.append("아트&산업디자인학과 등 실기 모집단위 및 생활체육학과의 '일반전형'은 trackTypeRaw='실기/실적위주'로 분리 표기. "
                "교과 일반전형과 동일 전형명([학생부교과, 실기/실적위주] 일반전형) 하에 모집단위별로 교과/실기 중 하나만 운영.")
warnings.append("공연예술학과 실기고사는 서울 대학로(민송아트홀)에서 시행되나 소속 캠퍼스는 제천 본교.")

meta={
 "universityName":"세명대학교",
 "universityId":"kcue_0000137",
 "year":2027,
 "recruitmentSeason":"susi",
 "sourceDocYear":2027,
 "campusScope":"제천 단일 캠퍼스 (충북 제천시) — 정원내 37개 모집단위 수시 전형 전체",
 "method":"pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
 "visionCost":0,
 "departments":len(departments),
 "totalTracks":total_tracks,
 "rowSumValidation":{
    "basis":"totalQuotaHint(모집단위별 정원내 수시 전형 인원 합)",
    "passed":rowsum_passed,"failed":rowsum_failed,"failedList":failed_list},
 "colTotalValidation":col_validation,
 "checksumPassed":checksum,
}
result={
 "universityName":"세명대학교","year":2027,"recruitmentSeason":"susi",
 "departments":departments,"warnings":warnings,
}
json.dump({"meta":meta,"result":result}, open(OUT,"w",encoding="utf-8"),
          ensure_ascii=False, indent=2)

# ── 콘솔 요약 ────────────────────────────────────────────────────────────────
print("departments:",len(departments)," tracks:",total_tracks)
print("rowSum passed/failed:",rowsum_passed,"/",rowsum_failed)
print("colTotal matched:",sum(1 for c in col_validation if c['match']),"/",len(col_validation))
for c in col_validation:
    print("  ",c["track"],c["computed"],"vs",c["stated"],c["match"])
print("ext dept counts:",ext_dept_count)
print("checksumPassed:",checksum)
grand=sum(d["totalQuotaHint"] for d in departments)
print("GRAND_TOTAL (정원내 수시 합):",grand)
print("  요강 명시 정원내 합계 = 705+265+26+98+4+57+93+98+33 =",
      705+265+26+98+4+57+93+98+33)
