#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한남대학교 2027학년도 대학입학전형 기본계획(전공안내서 p.30~31) → hannam-text.json
입력: univ/susi-2027/kcue_0000195.txt(+.pdf, 292p 전공안내서)  (pdftotext -layout, Vision 미사용)
단일 캠퍼스(대전).

문서 성격: 본 PDF는 2027 '전공안내서' 안의 「대학입학전형 기본계획」(예정안). 세부 모집요강은 추후 공지.
 → 정원내 수시 모집인원 grid(p.30~31)는 학과×전형 숫자가 명시되어 이중 체크섬으로 검증 가능.
 → 정원외 수시(농어촌/특성화고/장애인/만학도/기초생활)는 학과별 정원이 'N% 이내'(또는 선발/미선발)로
    표기되어 학과별 확정 인원이 없음 → 학과별 quota=null. 본 기본계획에서는 학과별 부착이 모호하여
    warnings 에만 대학 총계(농66·특39·장39·만10·기초10)를 기록(지어내기 금지, null 정직성).

검증(독립 재계산):
 - 행합: 학과 정원내 수시 track 합 == 모집인원표 학과 소계[A]
 - 열합: 전형별 총합 == 총계행(p.31 line 885):
     일반1350·지역인재교과459·지역인재기초15·기회균형16·사회통합8·어학16·
     한남I 471·한남II 65·창업5·실기163·특기자12  (소계A 합 = 2,580)
 - 수능최저: 전 수시전형 '대학수학능력시험 최저학력기준 없음'(p.34 line 1127) → 전부 exempt.
"""
import json, re
from pathlib import Path
from collections import OrderedDict

TXT = Path("univ/susi-2027/kcue_0000195.txt")
OUT = Path("scripts/etl/text-extract-test/hannam-text.json")
UNIV = "한남대학교"
SLUG = "kcue_0000195"
CAMPUS = "대전"

lines = TXT.read_text(encoding="utf-8").split("\n")

# ── 1) 모집인원 grid 파싱 (p.30 / p.31 컬럼 x-위치 상이) ──────────────────────
# 정원내 수시 inner track 컬럼 (x -> key). 소계A 는 별도 추출.
P31 = {59:'일반',65:'지역인재교과',71:'지역인재기초',76:'기회균형',82:'사회통합',86:'어학',
       92:'한남I',100:'한남II',107:'창업',111:'실기',117:'특기자'}
P30 = {48:'일반',55:'지역인재교과',60:'지역인재기초',64:'기회균형',70:'사회통합',76:'어학',
       81:'한남I',88:'한남II',96:'창업',97:'실기'}
SOA_X = {31:122, 30:105}  # 소계A x

TRACKS = ['일반','지역인재교과','지역인재기초','기회균형','사회통합','어학',
          '한남I','한남II','창업','실기','특기자']

def _merge(toks):
    """쉼표로 끊긴 천단위(2 + 725 -> 2725) 결합."""
    m=[]; i=0
    while i<len(toks):
        x,v=toks[i]
        if i+1<len(toks) and toks[i+1][0]-x<=3 and 100<=int(toks[i+1][1])<=999 and int(v)<10:
            m.append((x,int(v)*1000+int(toks[i+1][1]))); i+=2
        else:
            m.append((x,int(v))); i+=1
    return m

def parse_row(ln, pg, drop_head=True):
    cols = P31 if pg==31 else P30
    soa_x = SOA_X[pg]
    toks = _merge([(mm.start(),mm.group()) for mm in re.finditer(r'\d+', lines[ln-1])])
    if drop_head:
        toks = toks[2:]  # 입학정원, 모집인원 제거
    res={}; soa=None
    for x,v in toks:
        if abs(x-soa_x)<=2:
            soa=v; continue
        if x>soa_x+2:
            continue  # 정시/합계/정원외(텍스트) 영역 — 제외
        cand=[(abs(cx-x),k) for cx,k in cols.items() if abs(cx-x)<=4]
        if cand:
            k=min(cand)[1]; res[k]=res.get(k,0)+v
    return res, soa

# (학과명, grid line, page)  ※ 자유전공학부(전공자율선택제)·법학부·린튼은 본 grid 에 1회만 등장 → 중복 없음
DEPTS = [
 ('문과대학자유전공학부',704,30,'문과대학'),('국어국문·창작학과',706,30,'문과대학'),
 ('영어영문학과',708,30,'문과대학'),('디지털영어콘텐츠학과',710,30,'문과대학'),
 ('일어일문학과',712,30,'문과대학'),('프랑스어문학과',714,30,'문과대학'),
 ('문헌정보학과',716,30,'문과대학'),('사학과',718,30,'문과대학'),('기독교학과',720,30,'문과대학'),
 ('국어교육과',722,30,'사범대학'),('영어교육과',725,30,'사범대학'),('교육학과',727,30,'사범대학'),
 ('역사교육과',729,30,'사범대학'),('미술교육과',731,30,'사범대학'),('수학교육과',733,30,'사범대학'),
 ('공과대학자유전공학부',735,30,'공과대학'),('정보통신공학과',737,30,'공과대학'),
 ('전기전자공학과',739,30,'공과대학'),('멀티미디어공학과',741,30,'공과대학'),
 ('건축학과(5년제)',743,30,'공과대학'),('건축공학과',745,30,'공과대학'),
 ('건설환경공학과',747,30,'공과대학'),('기계공학과',749,30,'공과대학'),('화학공학과',751,30,'공과대학'),
 ('인공지능대학자유전공학부',753,30,'인공지능대학'),('컴퓨터공학과',755,30,'인공지능대학'),
 ('AI융합학과',757,30,'인공지능대학'),('산업정보공학과',759,30,'인공지능대학'),
 ('AI데이터사이언스학과',762,30,'인공지능대학'),('나노반도체소재공학과',764,30,'인공지능대학'),
 ('AI로봇융합공학과',766,30,'인공지능대학'),('수학과',768,30,'인공지능대학'),
 ('경상대학자유전공학부',811,31,'경상대학'),('경영학과',813,31,'경상대학'),('회계학과',815,31,'경상대학'),
 ('무역물류학과',819,31,'경상대학'),('경제학과',822,31,'경상대학'),('중국경제통상학과',824,31,'경상대학'),
 ('호텔항공경영학과',826,31,'경상대학'),('경영정보학과',828,31,'경상대학'),
 ('사회과학대학자유전공학부',830,31,'사회과학대학'),('행정학과',832,31,'사회과학대학'),
 ('경찰학과',834,31,'사회과학대학'),('정치·언론학과',836,31,'사회과학대학'),
 ('사회복지학과',839,31,'사회과학대학'),('아동복지학과',842,31,'사회과학대학'),
 ('상담심리학과',844,31,'사회과학대학'),('사회적경제기업학과',846,31,'사회과학대학'),
 ('법학부(법학전공/법무법학전공)',847,31,'사회과학대학'),
 ('생명ㆍ나노과학대학자유전공학부',851,31,'생명·나노과학대학'),
 ('생명시스템과학과',853,31,'생명·나노과학대학'),('식품영양학과',857,31,'생명·나노과학대학'),
 ('화학과',859,31,'생명·나노과학대학'),('스포츠과학과',861,31,'생명·나노과학대학'),
 ('바이오제약공학과',863,31,'생명·나노과학대학'),('간호학과',866,31,'생명·나노과학대학'),
 ('융합디자인학과',869,31,'아트&디자인테크놀로지대학'),('회화과',872,31,'아트&디자인테크놀로지대학'),
 ('패션디자인학과',874,31,'아트&디자인테크놀로지대학'),('미디어영상학과',877,31,'아트&디자인테크놀로지대학'),
 ('린튼글로벌스쿨(글로벌비즈니스전공/글로벌미디어·컬처전공)',880,31,'린튼국제학부'),
 ('탈메이지교양·융합대학자유전공학부',882,31,'탈메이지교양·융합대학'),
]

# 계열(인문/자연/예체능) — 2026 입시결과표 계열 컬럼 근거
TRACKHINT = {
 '문과대학자유전공학부':'인문','국어국문·창작학과':'인문','영어영문학과':'인문','디지털영어콘텐츠학과':'인문',
 '일어일문학과':'인문','프랑스어문학과':'인문','문헌정보학과':'인문','사학과':'인문','기독교학과':'인문',
 '국어교육과':'인문','영어교육과':'인문','교육학과':'인문','역사교육과':'인문','미술교육과':'예체능',
 '수학교육과':'자연','공과대학자유전공학부':'자연','정보통신공학과':'자연','전기전자공학과':'자연',
 '멀티미디어공학과':'자연','건축학과(5년제)':'자연','건축공학과':'자연','건설환경공학과':'자연',
 '기계공학과':'자연','화학공학과':'자연','인공지능대학자유전공학부':'자연','컴퓨터공학과':'자연',
 'AI융합학과':'자연','산업정보공학과':'자연','AI데이터사이언스학과':'자연','나노반도체소재공학과':'자연',
 'AI로봇융합공학과':'자연','수학과':'자연','경상대학자유전공학부':'인문','경영학과':'인문','회계학과':'인문',
 '무역물류학과':'인문','경제학과':'인문','중국경제통상학과':'인문','호텔항공경영학과':'인문','경영정보학과':'인문',
 '사회과학대학자유전공학부':'인문','행정학과':'인문','경찰학과':'인문','정치·언론학과':'인문',
 '사회복지학과':'인문','아동복지학과':'인문','상담심리학과':'인문','사회적경제기업학과':'인문',
 '법학부(법학전공/법무법학전공)':'인문','생명ㆍ나노과학대학자유전공학부':'자연','생명시스템과학과':'자연',
 '식품영양학과':'자연','화학과':'자연','스포츠과학과':'예체능','바이오제약공학과':'자연','간호학과':'자연',
 '융합디자인학과':'예체능','회화과':'예체능','패션디자인학과':'인문','미디어영상학과':'자연',
 '린튼글로벌스쿨(글로벌비즈니스전공/글로벌미디어·컬처전공)':'인문','탈메이지교양·융합대학자유전공학부':'자연',
}

# ── 2) 전형 메타(반영비율·자격·유형) ─────────────────────────────────────────
# 수능최저: 전 수시전형 없음 (p.34)
CSAT_NONE = "대학수학능력시험 최저학력기준 없음"

def track_meta(key, dept):
    """key -> (trackName, trackTypeRaw, specialKeyword, reflectionStages, qual)"""
    if key=='일반':
        return ("학생부교과(일반전형)","학생부위주(교과)",None,
                [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":100},"stageMaxScore":500}],
                "고교 졸업(예정)자 등 일반 지원자격")
    if key=='지역인재교과':
        return ("학생부교과(지역인재교과우수자전형)","학생부위주(교과)","지역인재",
                [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":100},"stageMaxScore":500}],
                "대전·세종·충남·충북 소재 고교 전 교육과정 이수(예정)한 지역인재")
    if key=='지역인재기초':
        return ("학생부교과(지역인재교과우수자(기초생활)전형)","학생부위주(교과)","지역인재",
                [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":100},"stageMaxScore":500}],
                "지역인재 中 기초생활수급자·차상위계층·한부모가족 지원대상자")
    if key=='기회균형':
        return ("학생부교과(기회균형특별전형)","학생부위주(교과)","기회균형",
                [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":100},"stageMaxScore":500}],
                "국가보훈대상자 등 기회균형 지원자격")
    if key=='사회통합':
        return ("학생부교과(사회통합전형)","학생부위주(교과)","사회통합",
                [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":100},"stageMaxScore":500}],
                "사회통합전형 지원자격(다자녀·다문화 등)")
    if key=='어학':
        return ("학생부교과(어학인재전형)","학생부위주(교과)","어학인재",
                [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":50,"면접":50},"stageMaxScore":1000}],
                "공인어학성적 등 어학인재 지원자격(린튼국제학부 등)")
    if key=='한남I':
        return ("학생부종합(한남인재Ⅰ(서류)전형)","학생부위주(종합)",None,
                [{"stageLabel":"일괄합산","multiplier":None,"components":{"서류종합평가":100},"stageMaxScore":100}],
                "고교 졸업(예정)자 등")
    if key=='한남II':
        return ("학생부종합(한남인재Ⅱ(서류+면접)전형)","학생부위주(종합)",None,
                [{"stageLabel":"1단계","multiplier":4,"components":{"서류종합평가":100},"stageMaxScore":100},
                 {"stageLabel":"2단계","multiplier":None,"components":{"1단계":70,"면접":30},"stageMaxScore":100}],
                "고교 졸업(예정)자 등 (1단계 서류 4배수)")
    if key=='창업':
        return ("학생부종합(창업인재(서류+면접)전형)","학생부위주(종합)",None,
                [{"stageLabel":"1단계","multiplier":4,"components":{"서류종합평가":100},"stageMaxScore":100},
                 {"stageLabel":"2단계","multiplier":None,"components":{"1단계":70,"면접":30},"stageMaxScore":100}],
                "창업 관련 활동·역량 보유 지원자격 (1단계 서류 4배수)")
    if key=='실기':
        # 학과별 반영비율 상이: 회화 실기100 / 미술교육·스포츠 교과40+실기60 / 융합디자인 교과20+실기80
        if dept=='회화과':
            comp={"실기":100}; mx=1000
        elif dept in ('미술교육과','스포츠과학과'):
            comp={"교과":40,"실기":60}; mx=1000
        elif dept=='융합디자인학과':
            comp={"교과":20,"실기":80}; mx=1000
        else:
            comp={"실기":100}; mx=None
        return ("실기/실적위주(실기전형)","실기/실적위주",None,
                [{"stageLabel":"일괄합산","multiplier":None,"components":comp,"stageMaxScore":mx}],
                "해당 모집단위 실기 지원자격")
    if key=='특기자':
        if dept=='융합디자인학과':
            return ("실기/실적위주(디자인특기자전형)","실기/실적위주","특기자",
                    [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":20,"입상실적":80},"stageMaxScore":1000}],
                    "디자인 분야 입상실적 보유 특기자")
        if dept=='스포츠과학과':
            return ("실기/실적위주(체육특기자전형)","실기/실적위주","특기자",
                    [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":18,"출결":2,"실기":20,"입상실적":60},"stageMaxScore":1000}],
                    "체육 종목별(레슬링·탁구·축구 등) 입상실적 보유 특기자")
        return ("실기/실적위주(특기자전형)","실기/실적위주","특기자",
                [{"stageLabel":"일괄합산","multiplier":None,"components":{},"stageMaxScore":None}],
                "특기자 지원자격")
    raise ValueError(key)

# ── 3) 빌드 + 이중 체크섬 ────────────────────────────────────────────────────
STATED_COL = {'일반':1350,'지역인재교과':459,'지역인재기초':15,'기회균형':16,'사회통합':8,'어학':16,
              '한남I':471,'한남II':65,'창업':5,'실기':163,'특기자':12}
STATED_SOA_TOTAL = 2580

departments=[]; coltot={k:0 for k in TRACKS}
row_pass=0; row_fail=0; failedList=[]; warnings=[]

for nm,ln,pg,college in DEPTS:
    r,soa = parse_row(ln,pg)
    if nm.startswith('법학부'):
        r2,_ = parse_row(849,31,drop_head=False)  # 법학부 연속행(기회균형2·한남I16)
        for k,v in r2.items():
            if k in TRACKS: r[k]=r.get(k,0)+v
    inner = sum(r.get(k,0) for k in TRACKS)
    # 행합 검증
    if soa is not None and inner==soa:
        row_pass+=1; total_hint=soa
    else:
        row_fail+=1; failedList.append({"dept":nm,"inner":inner,"soa":soa})
        total_hint=None  # 불확실 → null
    for k in TRACKS: coltot[k]+=r.get(k,0)

    tracks=[]
    for k in TRACKS:
        q=r.get(k,0)
        if q<=0: continue
        tn,tt,sk,refl,qual = track_meta(k,nm.split('(')[0])
        tracks.append({
            "trackName":tn,"trackTypeRaw":tt,"recruitmentPeriodRaw":"수시",
            "specialTypeKeyword":sk,"quotaInitial":q,
            "applicationQualification":qual,"reflectionStages":refl,
            "csatMinimumRawText":CSAT_NONE,"csatMinimumExempt":True,
            "csatRequiredAreasRawText":None,"prevYearResult":None,
            "sourcePages":[30 if pg==30 else 31,33,34],
        })
    departments.append({
        "departmentName":nm,"campus":CAMPUS,"trackHint":TRACKHINT.get(nm),
        "totalQuotaHint":total_hint,"tracks":tracks,
    })

# 열합 검증
col_validation=[]; col_all_ok=True
for k in TRACKS:
    ok = coltot[k]==STATED_COL[k]; col_all_ok &= ok
    col_validation.append({"track":k,"computed":coltot[k],"stated":STATED_COL[k],"match":ok})
soa_total_ok = sum(coltot.values())==STATED_SOA_TOTAL

# sourceDocYear 확인
doc2027 = any("2027학년도" in l and ("기본계획" in l or "전공안내" in l) for l in lines[:60]) or \
          any("2027학년도" in l for l in lines[780:806])

checksum_passed = (row_fail==0) and col_all_ok and soa_total_ok and doc2027

# 정원외 수시 — 학과별 확정인원 없음(%-기반) → warnings 에 대학총계만 기록
warnings.append(
    "정원외 수시 전형(농어촌(도서·벽지)학생·특성화고교출신자·장애인등대상자·만학도특별·"
    "기초생활수급자/차상위/한부모) 은 본 기본계획에서 학과별 정원이 'N% 이내'(또는 선발/미선발)로만 "
    "표기되어 학과별 확정 인원이 없어 미포함. 대학 총계(정원외 학생부교과): 농어촌66·특성화고39·"
    "장애인39·만학도10·기초생활10 (p.31 총계행). 모두 학생부교과 100%·수능최저 없음. 세부 인원은 추후 모집요강에서 확정."
)
warnings.append(
    "본 PDF 는 '2027 전공안내서' 내 「대학입학전형 기본계획」(예정안)으로, 세부 모집요강 추후 공지(p.29). "
    "정시·정원외 수치는 수시 추출 대상에서 제외."
)
warnings.append(
    "어학인재전형은 모집요강 grid 상 '학생부 위주(교과)' 그룹에 분류되어 trackTypeRaw=학생부위주(교과)로 "
    "표기했으나 실제 반영은 교과50%+면접50% (린튼국제학부 등)."
)
if not doc2027:
    warnings.append("sourceDocYear 2027 확인 실패 — 점검 필요.")

result = {
  "meta":{
    "universityName":UNIV,"universityId":SLUG,"year":2027,"recruitmentSeason":"susi",
    "method":"pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)","visionCost":0,
    "campusScope":"단일 캠퍼스(대전). 2027 전공안내서 내 대학입학전형 기본계획(p.30~31) 기준.",
    "sourceDocYear":2027,
    "departments":len(departments),
    "totalTracks":sum(len(d["tracks"]) for d in departments),
    "rowSumValidation":{
      "basis":"totalQuotaHint(학과 정원내 수시 track 합) == 모집인원표 학과 소계[A]",
      "passed":row_pass,"failed":row_fail,"failedList":failedList},
    "colTotalValidation":col_validation,
    "soaTotalValidation":{"computed":sum(coltot.values()),"stated":STATED_SOA_TOTAL,"match":soa_total_ok},
    "checksumPassed":checksum_passed,
  },
  "result":{
    "universityName":UNIV,"year":2027,"recruitmentSeason":"susi",
    "departments":departments,"warnings":warnings,
  }
}

OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(f"WROTE {OUT}")
print(f"학과 {len(departments)} · 전형 {result['meta']['totalTracks']}")
print(f"행합 pass={row_pass} fail={row_fail}")
print(f"열합 all_ok={col_all_ok}  소계A총합 {sum(coltot.values())}=={STATED_SOA_TOTAL}:{soa_total_ok}")
print(f"sourceDocYear2027={doc2027}  checksumPassed={checksum_passed}")
if failedList: print("FAILED:",failedList)
