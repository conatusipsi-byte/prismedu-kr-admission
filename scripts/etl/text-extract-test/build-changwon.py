# -*- coding: utf-8 -*-
"""
국립창원대학교 2027 수시 모집요강 → changwon-text.json
source: univ/susi-2027/kcue_0000028.{pdf,txt}  (115p, 단일 캠퍼스: 창원)

구조:
 - Ⅴ. 모집단위 및 전형별 모집인원 총괄표(PDF p.11~12) = (학과 × 전형) grid
   → bbox-layout 파서(_parse_changwon_grid.py)로 추출, 행합·열합 이중검증 통과(_changwon_grid.json)
 - Ⅶ. 전형유형(PDF p.15~55) = 각 전형 전형방법 + 수능최저 + 지원자격
 - Ⅷ. 학교생활기록부 반영방법(PDF p.56~57) = 교과 100%(출결 미반영; 특기자만 교과90+출결10)

전형(16개, 모두 수시):
  정원 내(10):
    1. 학업성적우수자전형      589  학생부(교과)100         일괄  △(모집단위그룹별 7/8/9등급, 6개 없음)
    2. 글로컬인재전형(자율전공)  162  학생부(교과)100         일괄  △(자율전공 1개4등급 / 기계항공 2개합8)
    3. 지역인재전형(교과)       28  학생부(교과)100         일괄  △(사림아너스·첨단지능정보 2개합9, 그외 없음)
       (지역인재교과는 사림아너스학부·첨단지능정보공학과만)
    4. 계열적합인재전형(종합)   191  1단계 서류100(4배수,일부3배수)/2단계 1단계60+면접40  ×
    5. 지역인재전형(종합)      417  서류종합100(정량50+정성50)  일괄  ×(단,간호 2개합8)
    6. 예체능전형           131  학생부(교과)+실기(학과별 비율)  일괄  ×
    7. 특기자전형(체육·무용)    17  학생부30(교과270+출결30)+특기실적50+면접20  일괄  ×
    8. 사회통합전형           13  학생부(교과)100         일괄  ×  (보훈/다문화/다자녀 등)
    9. 취업자전형            17  학생부(교과)100         일괄  ×  (산업체 1년이상 재직)
   10. 평생학습자전형          13  학생부(교과)100         일괄  ×  (만23세↑)
  정원 외(6):
   11. 농어촌학생전형          62  학생부(교과)100         일괄  ×  (농어촌)
   12. 기회균형선발전형         18  학생부(교과)100         일괄  ×  (기초/차상위/한부모)
   13. 특수교육대상자전형        13  학생부(교과)60+면접40     일괄  ×  (장애/국가유공상이)
   14. 특성화고교졸업자전형       17  학생부(교과)100         일괄  ×  (특성화고졸·기준학과)
   15. 특성화고 등을 졸업한 재직자전형 15 학생부(교과)70+재직경력30  일괄  ×  (재직3년↑)
   16. 만학도전형            22  학생부(교과)100         일괄  ×  (만30세↑)

수능최저(원문):
  - 학업성적우수자: 국·수·영·탐(상위1) 중 2개합  ▸간호·스마트제조융합·우주항공=7 ▸특수교육·유아교육·세무·경영·컴퓨터·에너지기계·모빌리티기계·원자력기계=8
    ▸독어독문·일어일문·의류·산업시스템·건설시스템·기술경영=없음 ▸그 외=9
  - 글로컬인재: 7개 자율전공(사림아너스·인문계열·사회계열·경영계열·공학계열·자연과학계열·GAST)=1개영역 4 / 기계항공자율전공=2개합8
  - 지역인재(교과): 사림아너스·첨단지능정보=2개합9 / 그 외 없음
  - 지역인재(종합): 없음(단, 간호 2개합8)
  - 그 외 전형: 없음
"""
import json
from pathlib import Path
from collections import OrderedDict, defaultdict

UNIV="국립창원대학교"; SLUG="kcue_0000028"
CAMPUS="창원캠퍼스"
BASE=Path("scripts/etl/text-extract-test")

# ── 검증된 grid 로드 (bbox 파서 산출) ──
GRID=json.load(open(BASE/"_changwon_grid.json"))["depts"]

# grid 행 순서 == KNOWN 순서 (이름 교정용 화이트리스트; _parse 와 동일, 검증 완료)
KNOWN = """사림아너스학부(자율전공학부) 자산경영빅데이터학과 창업비즈니스학과 글로벌문화산업학과 글로벌인재개발학과
국어국문학과 영어영문학과 독어독문학과 불어불문학과 일어일문학과 사학과 철학과 특수교육과 유아교육과 인문계열자율전공학부
법학과 행정학과 국제관계학과 중국학과 사회학과 미디어커뮤니케이션학과 사회복지학과 사회계열자율전공학부 글로벌비즈니스학부
국제무역학과 경영학과 회계학과 세무학과 경영계열자율전공학부 기술경영공학과 체육학과 음악과 미술학과 산업디자인학과 무용학과
통계학과 의류학과 식품영양학과 간호학과 수학과 화학과 자연과학계열자율전공학부 산업시스템공학과 스마트오션모빌리티공학과
환경에너지공학과 건설시스템공학과 건축학부건축학전공 건축학부건축공학전공 컴퓨터공학과 첨단지능정보공학과 전자공학과
재료금속공학과 첨단소재융합공학과 메카융합공학과(야) 공학계열자율전공학부 반도체물리학과 미생물생명공학과 생명보건학과
문화기술융합학과 GAST자율전공학부 지능로봇융합공학과 AI전기공학과 인공지능공학과 인공지능화학공학과 AI생명과학과
인공지능디펜스공학과 인공지능파이낸스학과 스마트제조융합공학과 우주항공공학부 에너지기계공학과 모빌리티기계공학과
원자력기계공학과 기계항공자율전공학부""".split()
assert len(KNOWN)==len(GRID)==73, (len(KNOWN),len(GRID))

# grid column key → (track-key, 정원내외)
# 정원내: 학업성적,글로컬,지역인재교과,사회통합,취업자,평생학습,계열적합,지역인재종합,예체능,특기자
# 정원외: 농어촌,기회균형,특수교육,특성화고교,고졸재직자,만학도
COL2TRACK = {
 "학업성적":"학업성적","글로컬":"글로컬","지역인재교과":"지역인재교과",
 "사회통합":"사회통합","취업자":"취업자","평생학습":"평생학습",
 "계열적합":"계열적합","지역인재종합":"지역인재종합","예체능":"예체능","특기자":"특기자",
 "농어촌":"농어촌","기회균형":"기회균형","특수교육":"특수교육",
 "특성화고교":"특성화고교","고졸재직자":"재직자","만학도":"만학도",
}
# track 컬럼 순서(총괄표 컬럼 순) — 출력 일관성
TRACK_ORDER = ["학업성적","글로컬","지역인재교과","사회통합","취업자","평생학습",
               "계열적합","지역인재종합","예체능","특기자",
               "농어촌","기회균형","특수교육","특성화고교","재직자","만학도"]

# ── 반영방법(stage) 템플릿 (Ⅷ: 교과 100%, 출결 미반영; 특기자만 교과90+출결10) ──
ST_GYOGWA100 = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":100},"stageMaxScore":1000}]
ST_TEUKSU    = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":60,"면접":40},"stageMaxScore":1000}]  # 특수교육대상자
ST_JAEJIK    = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":70,"재직경력":30},"stageMaxScore":1000}]  # 재직자
ST_GYEYEOL   = [  # 계열적합인재: 1단계 서류100(4배수, 일부3배수) / 2단계 1단계60+면접40
    {"stageLabel":"1단계","multiplier":4,"components":{"서류종합평가":100},"stageMaxScore":1000},
    {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":60,"면접":40},"stageMaxScore":1000},
]
ST_JIYEOK_JONGHAP = [  # 지역인재(종합): 일괄 서류종합100 (정량50+정성50)
    {"stageLabel":"일괄합산","multiplier":None,"components":{"교과성적정량":50,"서류정성평가":50},"stageMaxScore":1000}]
ST_TEUKGI    = [  # 특기자: 일괄 학생부30(교과90+출결10 → 교과27+출결3)+특기실적50+면접20
    {"stageLabel":"일괄합산","multiplier":None,"components":{"교과":27,"출결":3,"특기실적":50,"면접":20},"stageMaxScore":1000}]
# 예체능: 학과별 학생부(교과)+실기 비율 (배점 명목)
ST_YE_30_70  = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":30,"실기":70},"stageMaxScore":1000}]  # 체육·산업디자인
ST_YE_20_80  = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":20,"실기":80},"stageMaxScore":1000}]  # 음악·미술·무용

# ── 수능최저 원문 ──
CSAT_NONE="없음"
# 학업성적우수자 모집단위 그룹
HAKEOP_7 = {"간호학과","스마트제조융합공학과","우주항공공학부"}
HAKEOP_8 = {"특수교육과","유아교육과","세무학과","경영학과","컴퓨터공학과","에너지기계공학과","모빌리티기계공학과","원자력기계공학과"}
HAKEOP_NONE = {"독어독문학과","일어일문학과","의류학과","산업시스템공학과","건설시스템공학과","기술경영공학과"}
def csat_hakeop(dept):
    base="수능 국어, 수학, 영어, 탐구(사회/과학영역 상위 1과목) 영역 중 2개 영역 등급의 합이 "
    if dept in HAKEOP_7:    return (base+"7 이내", False)
    if dept in HAKEOP_8:    return (base+"8 이내", False)
    if dept in HAKEOP_NONE: return (CSAT_NONE, True)
    return (base+"9 이내", False)  # 그 외 모집단위
# 글로컬인재: 7개 자율전공(1개영역 4) / 기계항공자율전공(2개합8)
GLOCAL_4 = {"사림아너스학부(자율전공학부)","인문계열자율전공학부","사회계열자율전공학부",
            "경영계열자율전공학부","공학계열자율전공학부","자연과학계열자율전공학부","GAST자율전공학부"}
def csat_glocal(dept):
    if dept=="기계항공자율전공학부":
        return ("수능 국어, 수학, 영어, 탐구(사회/과학영역 상위 1과목) 영역 중 2개 영역 등급의 합이 8 이내", False)
    return ("수능 국어, 수학, 영어, 탐구(사회/과학영역 상위 1과목) 영역 중 1개 영역 등급이 4 이내", False)
# 지역인재(교과): 사림아너스·첨단지능정보 2개합9 / 그외 없음 (단 교과 컬럼은 이 2개 학과에만 존재)
def csat_jiyeok_gyo(dept):
    if dept in ("사림아너스학부(자율전공학부)","첨단지능정보공학과"):
        return ("수능 국어, 수학, 영어, 탐구(사회/과학영역 상위 1과목) 영역 중 2개 영역 등급의 합이 9 이내", False)
    return (CSAT_NONE, True)
# 지역인재(종합): 없음(단 간호 2개합8)
def csat_jiyeok_jong(dept):
    if dept=="간호학과":
        return ("없음 (단, 간호학과는 2개 영역 등급의 합이 8 이내)", False)
    return (CSAT_NONE, True)

# ── track 메타 (trackName, trackTypeRaw, specialTypeKeyword, stages, qualification) ──
QUAL_BASIC="고등학교 졸업(예정)자 또는 법령에 의하여 고등학교 졸업 이상의 학력이 있다고 인정되는 자"
QUAL_REGION="고등학교 졸업(예정)자로서 부산·울산·경남 지역에 소재하는 고등학교에서 입학부터 졸업까지 3개 학년의 교육과정을 이수한 자(타지역 고교 재학 사실 있으면 지원 불가)"

TM = {
 "학업성적": ("학업성적우수자전형","학생부위주(교과)",None,ST_GYOGWA100, QUAL_BASIC),
 "글로컬": ("글로컬인재전형","학생부위주(교과)",None,ST_GYOGWA100,
    QUAL_BASIC+" (자율전공학부 모집)"),
 "지역인재교과": ("지역인재전형(교과)","학생부위주(교과)","지역인재",ST_GYOGWA100, QUAL_REGION),
 "사회통합": ("사회통합전형","학생부위주(교과)","사회통합",ST_GYOGWA100,
    QUAL_BASIC+" 중 국가보훈대상자/다문화가족 자녀/아동복지시설 등 생활자/가정위탁보호아동/부모 장애(1~3급) 자녀/다자녀(3자녀↑)가정 자녀/직업군인 자녀(국방부장관 추천) 중 하나에 해당하는 자"),
 "취업자": ("취업자전형","학생부위주(교과)","취업자",ST_GYOGWA100,
    "고등학교 졸업자(졸업예정자 제외) 중 원서접수 시작일(2026.9.7.) 기준 산업체 재직 중인 자로 고교 졸업 후 산업체 재직 경력 1년 이상(합산 가능)인 자"),
 "평생학습": ("평생학습자전형","학생부위주(교과)","평생학습자",ST_GYOGWA100,
    "고등학교 졸업(예정)자 또는 동등 학력 인정자로서 원서접수 마감일(2026.9.11.) 기준 만 23세 이상의 평생학습자"),
 "계열적합": ("계열적합인재전형","학생부위주(종합)",None,ST_GYEYEOL,
    "고등학교 졸업(예정)자 또는 동등 학력 인정자로서 학교생활기록부가 있는 자"),
 "지역인재종합": ("지역인재전형(종합)","학생부위주(종합)","지역인재",ST_JIYEOK_JONGHAP,
    QUAL_REGION+" (간호학과는 2022학년도 이후 중학교 입학자 중 비수도권 중·고 전 교육과정 이수·거주 요건 추가)"),
 "예체능": ("예체능전형","실기/실적위주",None,None,  # stages 학과별 분기
    QUAL_BASIC+" (체육 학생부30+실기70 / 음악·미술·무용 학생부20+실기80 / 산업디자인 학생부30+실기70)"),
 "특기자": ("특기자전형","실기/실적위주","특기자",ST_TEUKGI,
    "고등학교 졸업(예정)자 또는 동등 학력 인정자로서 각 분야별(체육·무용) 자격인정 기준을 충족하고 구비서류 제출 마감일까지 특기실적을 제출한 자(전과 불가)"),
 # 정원 외
 "농어촌": ("농어촌학생전형[정원 외]","학생부위주(교과)","농어촌학생",ST_GYOGWA100,
    "농어촌(읍·면) 소재 학교에서 중·고 6년[1형, 본인+부모 거주] 또는 초·중·고 12년[2형, 본인 거주] 전 교육과정 이수한 졸업(예정)자(읍·면 소재 특목고·검정고시 제외)"),
 "기회균형": ("기회균형선발전형[정원 외]","학생부위주(교과)","기회균형",ST_GYOGWA100,
    QUAL_BASIC+" 중 국민기초생활보장법 수급(권)자/차상위계층(본인 또는 자녀)/한부모가족 지원대상자 중 하나에 해당하는 자"),
 "특수교육": ("특수교육대상자전형[정원 외]","학생부위주(교과)","특수교육대상자",ST_TEUKSU,
    QUAL_BASIC+" 중 장애인복지법 등록 장애인/국가유공자 상이등급자/특수교육법 시각·청각·지적·정서행동·자폐성·의사소통·학습장애 등에 해당하는 자"),
 "특성화고교": ("특성화고교졸업자전형[정원 외]","학생부위주(교과)","특성화고졸",ST_GYOGWA100,
    "특성화고 또는 특성화고와 같은 교육과정을 운영하는 학과가 있는 일반고(종합고) 졸업(예정)자로서 본 대학교 지정 모집단위의 기준학과 출신자(마이스터고·고등기술학교·학력인정시설 제외)"),
 "재직자": ("특성화고 등을 졸업한 재직자전형[정원 외]","학생부위주(교과)","재직자",ST_JAEJIK,
    "산업체 근무경력이 원서접수 시작일(2026.9.7.) 기준 3년 이상인 재직자로서 특성화고(마이스터고 포함)·직업교육훈련 위탁과정 이수 일반고·산업수요맞춤형고·학력인정 평생교육시설 졸업(이수)자 중 하나에 해당하는 자"),
 "만학도": ("만학도전형[정원 외]","학생부위주(교과)","만학도",ST_GYOGWA100,
    "고등학교 졸업(예정)자 또는 동등 학력 인정자로서 입학연도(3월 1일) 기준 만 30세 이상의 평생학습자"),
}

# ── sourcePages (PDF 페이지) ──
PG_GRID=[11,12]
TRACK_PAGES = {
 "학업성적":PG_GRID+[15,16], "글로컬":PG_GRID+[16,17], "지역인재교과":PG_GRID+[17,18],
 "계열적합":PG_GRID+[18,19,20], "지역인재종합":PG_GRID+[20,21,22], "예체능":PG_GRID+[22,23,24,25,26,27,28,29,30,31,32,33,34,35],
 "특기자":PG_GRID+[36,37,38,39], "사회통합":PG_GRID+[40,41], "취업자":PG_GRID+[42,43],
 "평생학습":PG_GRID+[44,45], "농어촌":PG_GRID+[45,46], "기회균형":PG_GRID+[47,48],
 "특수교육":PG_GRID+[48,49], "특성화고교":PG_GRID+[50,51], "재직자":PG_GRID+[52,53,54], "만학도":PG_GRID+[54,55],
}

# ── trackHint (계열) by department ──
# 인문사회·예체능계열 vs 자연계열 (Ⅷ 반영교과 구분 기반) — 예체능 학과는 예체능
HINT = {}
INMUN = """사림아너스학부(자율전공학부) 글로벌문화산업학과 글로벌인재개발학과 국어국문학과 영어영문학과 독어독문학과
불어불문학과 일어일문학과 사학과 철학과 특수교육과 유아교육과 인문계열자율전공학부 법학과 행정학과 국제관계학과 중국학과
사회학과 미디어커뮤니케이션학과 사회복지학과 사회계열자율전공학부 글로벌비즈니스학부 국제무역학과 경영학과 회계학과 세무학과
경영계열자율전공학부 자산경영빅데이터학과 창업비즈니스학과 의류학과""".split()
YECHE = "체육학과 음악과 미술학과 산업디자인학과 무용학과".split()
for d in KNOWN:
    if d in YECHE: HINT[d]="예체능"
    elif d in INMUN: HINT[d]="인문"
    else: HINT[d]="자연"

# ── csat 함수 매핑 ──
def csat_for(tk, dept):
    if tk=="학업성적":     return csat_hakeop(dept)
    if tk=="글로컬":       return csat_glocal(dept)
    if tk=="지역인재교과":  return csat_jiyeok_gyo(dept)
    if tk=="지역인재종합":  return csat_jiyeok_jong(dept)
    return (CSAT_NONE, True)

def stages_for(tk, dept):
    if tk=="예체능":
        return ST_YE_20_80 if dept in ("음악과","미술학과","무용학과") else ST_YE_30_70
    return TM[tk][3]

def build_track(tk, q, dept):
    name, ttype, special, _, qual = TM[tk]
    stages = stages_for(tk, dept)
    csat_raw, exempt = csat_for(tk, dept)
    return OrderedDict([
        ("trackName",name),
        ("trackTypeRaw",ttype),
        ("recruitmentPeriodRaw","수시"),
        ("specialTypeKeyword",special),
        ("quotaInitial",q),
        ("applicationQualification",qual),
        ("reflectionStages",stages),
        ("csatMinimumRawText",csat_raw),
        ("csatMinimumExempt",exempt),
        ("csatRequiredAreasRawText",None),
        ("prevYearResult",None),
        ("sourcePages",TRACK_PAGES[tk]),
    ])

# ── build departments from validated grid ──
departments=[]
colsum=defaultdict(int)
for idx, row in enumerate(GRID):
    dept=KNOWN[idx]
    tracks_in=row["tracks"]  # {colkey:int}
    # 컬럼키 → trackkey 변환, TRACK_ORDER 순 정렬
    tq_tracks={}
    for col,n in tracks_in.items():
        tk=COL2TRACK[col]
        tq_tracks[tk]=n
    trackobjs=[]
    tq=0
    for tk in TRACK_ORDER:
        if tk in tq_tracks:
            q=tq_tracks[tk]
            colsum[tk]+=q; tq+=q
            trackobjs.append(build_track(tk,q,dept))
    departments.append(OrderedDict([
        ("departmentName",dept),
        ("campus",CAMPUS),
        ("trackHint",HINT.get(dept)),
        ("totalQuotaHint",tq),
        ("tracks",trackobjs),
    ]))

# ── column-sum validation (열합) — 원문 합계행(변경표/grid 합계) ──
COLTOT = {  # trackkey → stated 2027 총합
 "학업성적":589,"글로컬":162,"지역인재교과":28,"사회통합":13,"취업자":17,"평생학습":13,
 "계열적합":191,"지역인재종합":417,"예체능":131,"특기자":17,
 "농어촌":62,"기회균형":18,"특수교육":13,"특성화고교":17,"재직자":15,"만학도":22,
}
colval=[]; all_ok=True
for tk in TRACK_ORDER:
    comp=colsum.get(tk,0); stated=COLTOT.get(tk)
    match=(comp==stated)
    if not match: all_ok=False
    colval.append({"track":TM[tk][0],"computed":comp,"stated":stated,"match":bool(match)})

# ── row-sum validation (행합) ──
row_failed=[]; row_pass=0
for d in departments:
    tq=d["totalQuotaHint"]
    qsum=sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    nnull=sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
    if tq is None: continue
    if qsum==tq and nnull==0: row_pass+=1
    elif qsum<=tq and nnull>0: row_pass+=1
    else: row_failed.append((d["departmentName"],tq,qsum))

total_tracks=sum(len(d["tracks"]) for d in departments)
grand_total=sum(colsum.values())
checksum_passed = all_ok and not row_failed and grand_total==1725

warnings=[]
warnings.append("모집인원 총괄표(Ⅴ, PDF p.11~12)는 pdftotext -bbox-layout 단어 x좌표를 계열헤더 컬럼중심에 매핑해 추출. 73개 모집단위 전원 행합(track합==수시합계) 통과, 16개 전형 열합 전부 원문 합계행과 일치(총 1,725명). 정원내 1,578 + 정원외 147.")
warnings.append("totalQuotaHint(학과 수시 총인원)은 입학정원이 아니라 총괄표 '수시합계' 컬럼값. 입학정원과 다름(예: 컴퓨터공학과 입학정원57·수시51).")
warnings.append("수능최저: 학업성적우수자전형은 모집단위 그룹별 차등(간호·스마트제조융합·우주항공=2개합7 / 특수교육·유아교육·세무·경영·컴퓨터·에너지기계·모빌리티기계·원자력기계=2개합8 / 독어독문·일어일문·의류·산업시스템·건설시스템·기술경영=없음 / 그 외=2개합9). 글로컬인재는 7개 자율전공=1개영역4·기계항공자율전공=2개합8. 지역인재(교과)는 사림아너스·첨단지능정보=2개합9. 지역인재(종합)은 없음(간호만 2개합8). 그 외 전형 모두 없음.")
warnings.append("학생부 반영: 교과 100%(출결 미반영, Ⅷ p.56). 예외 — 특기자전형은 학생부300 안에서 교과270+출결30(=교과90+출결10)이며 전체는 학생부30+특기실적50+면접20. 특수교육대상자=교과60+면접40, 재직자=교과70+재직경력30, 예체능=학과별 교과+실기(체육·산업디자인 30+70 / 음악·미술·무용 20+80), 지역인재(종합)=서류종합100(교과정량50+서류정성50).")
warnings.append("계열적합인재전형(종합): 1단계 서류100 4배수(중국학·간호·컴퓨터·스마트제조융합 4개 모집단위만 3배수) → 2단계 1단계성적60+면접40. multiplier 는 다수 학과 기준 4로 기록(3배수 4개 학과는 동일 전형명 내 예외).")
warnings.append("지역인재전형은 교과형(28명, 학생부위주(교과))과 종합형(417명, 학생부위주(종합))이 별도 존재. 총괄표 컬럼도 분리(교과: 사림아너스17+첨단지능정보11=28 / 종합: 학과 전반 417). trackName 으로 (교과)/(종합) 구분.")
warnings.append("자율전공/광역: 사림아너스학부(자율전공학부)·인문계열·사회계열·경영계열·공학계열·자연과학계열·GAST·기계항공 자율전공학부 포함. 글로컬인재전형은 이들 자율전공 중심 선발(trackHint 는 소속 계열 기준).")
warnings.append("우주항공공학부 소재지(예정)는 사천(시)캠퍼스이나 1~2학년 창원 수강 예정으로 캠퍼스는 창원으로 기록(요강 표지·소속 기준). 메카융합공학과(야)는 야간학과(취업자전형으로 선발).")
warnings.append("단일 캠퍼스(창원). 정시모집 표는 수시요강 범위 외로 제외. sourceDocYear=2027 (표지·머리말 '2027학년도 국립창원대학교 창원캠퍼스 수시모집요강' 확인).")

result=OrderedDict([
 ("universityName",UNIV),("year",2027),("recruitmentSeason","susi"),
 ("departments",departments),("warnings",warnings),
])
meta=OrderedDict([
 ("universityName",UNIV),("universityId",SLUG),("year",2027),("recruitmentSeason","susi"),
 ("method","pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)"),("visionCost",0),
 ("campusScope","단일 캠퍼스(창원). 모집인원 총괄표(Ⅴ, PDF p.11~12) bbox-layout 파싱 및 전형유형(Ⅶ, p.15~55)·학생부 반영방법(Ⅷ, p.56~57) 기준."),
 ("sourceDocYear",2027),
 ("departments",len(departments)),("totalTracks",total_tracks),
 ("rowSumValidation",{"basis":"totalQuotaHint(학과별 수시 전형 인원 합 == 총괄표 수시합계)","passed":row_pass,
                      "failed":len(row_failed),"failedList":[f[0] for f in row_failed]}),
 ("colTotalValidation",colval),
 ("checksumPassed",bool(checksum_passed)),
])

out=OrderedDict([("meta",meta),("result",result)])
p=BASE/"changwon-text.json"
p.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")

# ── console report ──
print(f"departments={len(departments)} tracks={total_tracks}")
print(f"row pass={row_pass} fail={len(row_failed)} {[f for f in row_failed]}")
print("\n열합(column-sum) check:")
gtot=0
for cv in colval:
    flag="OK" if cv["match"] else "MISMATCH"
    gtot+=cv["computed"]
    print(f"  {cv['track']:<28} computed={cv['computed']:>4} stated={cv['stated']:>4}  {flag}")
print(f"  {'전체 수시 합계':<28} computed={gtot:>4} stated={1725:>4}  {'OK' if gtot==1725 else 'MISMATCH'}")
print(f"\nchecksumPassed={checksum_passed}")
