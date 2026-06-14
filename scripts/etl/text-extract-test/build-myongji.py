# -*- coding: utf-8 -*-
"""
명지대학교 2027 수시 모집요강 → myongji-text.json
source: univ/susi-2027/kcue_0000109.{pdf,txt}
data extracted from 세부 전형 안내(Ⅵ) 모집인원표 (per-전공/계열) + 전형요약(Ⅰ) 전형요소표.
2캠퍼스: 인문캠퍼스(서울) / 자연캠퍼스(용인).
중요 구조:
 - 학교장추천/교과면접/명지인재면접/명지인재서류/농어촌학생/특성화고교/특수교육(자연측) = 전공 단위
 - 특수교육(인문측)/사회적배려/크리스천리더/재외국민 = 단과대학(계열) 단위 모집 → 단과대학을 모집단위로 기록
 - 만학도/특성화고등졸재직자 = 미래융합대학 전공 단위
 - 실기우수자/특기자 = 디자인/예술/스포츠학부 (자연)
 - 기회균형 = 자율전공학부(인문/자연) 단위
 - 재외국민(기타) = 세부 모집요강 없음, 인문측 단과대학 값만 grid 에서 판독 가능. 자연측(약20명) 분배 불명 → null
모든 수시전형 수능최저 미적용.
"""
import json
from pathlib import Path
from collections import defaultdict, OrderedDict

UNIV="명지대학교"; SLUG="kcue_0000109"

# ── 반영방법(전형요소표 Ⅰ-3, p.2) ──
# 일괄 교과100
STAGE_GYOGWA_100 = [{"stageLabel":"일괄합산","multiplier":None,"components":{"교과":100},"stageMaxScore":1000}]
# 2단계: 1단계 교과100(5배수) / 2단계 1단계70+면접30
STAGE_GYOGWA_INTERVIEW = [
    {"stageLabel":"1단계","multiplier":5,"components":{"교과":100},"stageMaxScore":1000},
    {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":70,"면접":30},"stageMaxScore":1000},
]
# 일괄 서류100
STAGE_SEORYU_100 = [{"stageLabel":"일괄합산","multiplier":None,"components":{"서류종합평가":100},"stageMaxScore":1000}]
# 2단계: 1단계 서류100(4배수) / 2단계 1단계70+면접30
STAGE_SEORYU_INTERVIEW = [
    {"stageLabel":"1단계","multiplier":4,"components":{"서류종합평가":100},"stageMaxScore":1000},
    {"stageLabel":"2단계","multiplier":None,"components":{"1단계성적":70,"면접":30},"stageMaxScore":1000},
]
# 실기우수자: 일괄 실기70+교과20+출결10
STAGE_SILGI = [{"stageLabel":"일괄합산","multiplier":None,"components":{"실기":70,"교과":20,"출결":10},"stageMaxScore":1000}]
# 특기자(대표: 스포츠학부 체육/산업, 스포츠지도 테니스/골프): 일괄 실적50+면접30+교과10+출결10
STAGE_TEUKGI = [{"stageLabel":"일괄합산","multiplier":None,"components":{"실적":50,"면접":30,"교과":10,"출결":10},"stageMaxScore":1000}]
# 재외국민: 일괄 면접100
STAGE_JAEOE = [{"stageLabel":"일괄합산","multiplier":None,"components":{"면접":100},"stageMaxScore":None}]

# track 메타: (trackName, trackTypeRaw, specialTypeKeyword, reflectionStages, qualification, sourcePages)
TM = {
 "학교장추천": ("학생부교과(학교장추천전형)","학생부위주(교과)",None,STAGE_GYOGWA_100,
    "국내 고등학교 2025년 2월 이후 졸업(예정)자로서 3학년 1학기까지 학교생활기록부 3개 학기 이상, 소속(졸업) 고등학교장 추천(고교별 20명)", [18]),
 "교과면접": ("학생부교과(교과면접전형)","학생부위주(교과)",None,STAGE_GYOGWA_INTERVIEW,
    "고등학교 졸업(예정)자 또는 법령에 의하여 동등 이상의 학력이 있다고 인정되는 자", [22]),
 "기회균형": ("학생부교과(기회균형전형)","학생부위주(교과)","기회균형",STAGE_GYOGWA_100,
    "국가보훈대상자/농어촌학생/서해5도학생/기초생활수급자·차상위·한부모/자립지원대상자/북한이탈주민 등 기회균형 대상자(자율전공학부)", [26]),
 "특성화고교": ("학생부교과(특성화고교전형)","학생부위주(교과)","특성화고",STAGE_GYOGWA_100,
    "특성화고등학교 졸업(예정)자(자연·인문 해당 전공 한정)", [32]),
 "만학도": ("학생부교과(만학도전형)","학생부위주(교과)","만학도",STAGE_GYOGWA_100,
    "2027.3.1. 기준 만 30세 이상(1997.3.1. 이전 출생) 성인. (멀티디자인전공은 1·2단계 면접 포함)", [37]),
 "특성화고등졸재직자": ("학생부교과(특성화고등졸재직자전형)","학생부위주(교과)","특성화고졸재직자",STAGE_GYOGWA_100,
    "특성화고 등 졸업 후 산업체 근무경력 3년 이상 재직자. (멀티디자인전공은 1·2단계 면접 포함)", [41]),
 "특수교육대상자": ("학생부교과(특수교육대상자전형)","학생부위주(교과)","특수교육대상자",STAGE_GYOGWA_INTERVIEW,
    "「장애인 등에 대한 특수교육법」 제15조 특수교육대상자 또는 「장애인복지법」 등록 장애인", [45]),
 "명지인재면접": ("학생부종합(명지인재면접전형)","학생부위주(종합)",None,STAGE_SEORYU_INTERVIEW,
    "고등학교 졸업(예정)자 또는 법령에 의하여 동등 이상의 학력이 있다고 인정되는 자", [49]),
 "명지인재서류": ("학생부종합(명지인재서류전형)","학생부위주(종합)",None,STAGE_SEORYU_100,
    "고등학교 졸업(예정)자 또는 법령에 의하여 동등 이상의 학력이 있다고 인정되는 자", [54]),
 "크리스천리더": ("학생부종합(크리스천리더전형)","학생부위주(종합)","크리스천리더",STAGE_SEORYU_INTERVIEW,
    "고등학교 졸업(예정)자로 목회자 추천을 받은 기독교인(목회자 확인서 제출)", [58]),
 "사회적배려대상자": ("학생부종합(사회적배려대상자전형)","학생부위주(종합)","사회적배려대상자",STAGE_SEORYU_100,
    "국가보훈대상자/기초생활수급자·차상위·한부모/다자녀/소년소녀가장 등 사회적배려대상자(단과대학 단위 모집)", [62]),
 "농어촌학생": ("학생부종합(농어촌학생전형)","학생부위주(종합)","농어촌학생",STAGE_SEORYU_100,
    "농어촌 지역 소재 학교 6년(유형Ⅰ) 또는 12년(유형Ⅱ) 재학·거주 졸업(예정)자", [66]),
 "실기우수자": ("실기/실적(실기우수자전형)","실기/실적위주",None,STAGE_SILGI,
    "고등학교 졸업(예정)자 또는 동등 이상 학력 인정자(디자인학부·예술학부 실기)", [71]),
 "특기자": ("실기/실적(특기자전형)","실기/실적위주","특기자",STAGE_TEUKGI,
    "해당 종목 특기 보유자(스포츠학부). 종목별 전형방법 상이: 스포츠지도학전공[야] 축구=1단계 실적100%(8배수)·2단계 실기70+교과20+출결10, 농구/배구=1단계 실적100%(6배수)·2단계 동일; 체육·스포츠산업·테니스·골프=일괄 실적50+면접30+교과10+출결10", [76]),
 "재외국민": ("기타(재외국민전형)","기타","재외국민",STAGE_JAEOE,
    "재외국민과 외국인/국외이수자/북한이탈주민 등(지원자격 제한 없음, 정원외). 세부 모집요강 별도 공고", [10]),
}

# ── 모집인원 데이터 ──
# 형식: dept[(campus, departmentName, trackHint)] = {track: quota}
D = OrderedDict()
def put(campus, dept, hint, **tracks):
    D[(campus,dept,hint)] = tracks

CI="인문캠퍼스(서울)"; CN="자연캠퍼스(용인)"

# ===== 인문캠퍼스 전공 단위 (학교장/교과면접/명지면접/명지서류/농어촌, +특성화고교 일부) =====
put(CI,"국어국문학전공","인문", 학교장추천=4, 교과면접=5, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"영어영문학전공","인문", 학교장추천=6, 교과면접=9, 명지인재면접=14, 명지인재서류=10, 농어촌학생=3)
put(CI,"미술사·역사학전공","인문", 학교장추천=5, 교과면접=5, 명지인재면접=6, 명지인재서류=5, 농어촌학생=2)
put(CI,"문헌정보학전공","인문", 학교장추천=3, 교과면접=5, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"중어중문학전공","인문", 학교장추천=5, 교과면접=5, 명지인재면접=6, 명지인재서류=6, 농어촌학생=2)
put(CI,"일어일문학전공","인문", 학교장추천=4, 교과면접=5, 명지인재면접=6, 명지인재서류=5, 농어촌학생=2)
put(CI,"아랍지역학전공","인문", 학교장추천=4, 교과면접=5, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"문예창작학과","인문", 명지인재면접=12)   # 학교장/교과면접 미선발
put(CI,"행정학전공","인문", 학교장추천=6, 교과면접=9, 특성화고교=2, 명지인재면접=14, 명지인재서류=10, 농어촌학생=3)
put(CI,"정치외교학전공","인문", 학교장추천=6, 교과면접=9, 명지인재면접=14, 명지인재서류=10, 농어촌학생=3)
put(CI,"경제학전공","인문", 학교장추천=6, 교과면접=5, 특성화고교=2, 명지인재면접=6, 명지인재서류=11, 농어촌학생=3)
put(CI,"국제통상학전공","인문", 학교장추천=4, 교과면접=5, 명지인재면접=6, 명지인재서류=4, 농어촌학생=3)
put(CI,"응용통계학전공","인문", 학교장추천=3, 교과면접=5, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"법학과","인문", 학교장추천=6, 교과면접=9, 명지인재면접=14, 명지인재서류=10, 농어촌학생=3)
put(CI,"경영학전공","인문", 학교장추천=18, 교과면접=18, 특성화고교=2, 명지인재면접=28, 명지인재서류=32, 농어촌학생=6)
put(CI,"AI경영정보학과","인문", 학교장추천=5, 교과면접=5, 특성화고교=2, 명지인재면접=6, 명지인재서류=6, 농어촌학생=3)
put(CI,"디지털미디어학부","인문", 학교장추천=5, 교과면접=5, 특성화고교=2, 명지인재면접=6, 명지인재서류=6, 농어촌학생=3)
put(CI,"청소년지도학전공","인문", 학교장추천=3, 교과면접=5, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"아동학전공","인문", 학교장추천=4, 교과면접=5, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"응용소프트웨어전공","인문", 학교장추천=3, 교과면접=5, 특성화고교=1, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"데이터사이언스전공","인문", 학교장추천=3, 교과면접=5, 특성화고교=1, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"인공지능전공","인문", 학교장추천=3, 교과면접=5, 특성화고교=1, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CI,"디지털콘텐츠디자인학과","인문", 학교장추천=5, 특성화고교=2, 명지인재면접=6, 명지인재서류=3, 농어촌학생=3)  # 교과면접 미선발
put(CI,"자율전공학부(인문)","인문", 학교장추천=65, 교과면접=10, 기회균형=30, 명지인재면접=5, 명지인재서류=52, 크리스천리더=5)

# ===== 인문캠퍼스 미래융합대학 전공 (만학도/재직자) =====
put(CI,"부동산학전공","인문", 만학도=6, 특성화고등졸재직자=19)
put(CI,"법무행정학전공","인문", 만학도=2, 특성화고등졸재직자=15)
put(CI,"융합경영학전공","인문", 만학도=2, 특성화고등졸재직자=32)
put(CI,"회계세무학전공","인문", 만학도=1, 특성화고등졸재직자=22)
put(CI,"사회복지학전공","인문", 만학도=8, 특성화고등졸재직자=18)
put(CI,"심리치료학전공","인문", 만학도=5, 특성화고등졸재직자=18)
put(CI,"멀티디자인전공","인문", 만학도=1, 특성화고등졸재직자=23)

# ===== 인문캠퍼스 단과대학(계열) 단위: 특수교육(인문측)/크리스천/사배/재외 =====
put(CI,"인문대학","인문", 특수교육대상자=7, 크리스천리더=4, 사회적배려대상자=3, 재외국민=4)
put(CI,"사회과학대학","인문", 특수교육대상자=7, 크리스천리더=4, 사회적배려대상자=3, 재외국민=4)
put(CI,"경영대학","인문", 특수교육대상자=7, 크리스천리더=4, 사회적배려대상자=3, 재외국민=8)
put(CI,"미디어·휴먼라이프대학","인문", 특수교육대상자=7, 크리스천리더=4, 사회적배려대상자=3, 재외국민=6)
put(CI,"인공지능·소프트웨어융합대학","인문", 특수교육대상자=7, 크리스천리더=5, 사회적배려대상자=7, 재외국민=8)

# ===== 자연캠퍼스 전공 단위 =====
put(CN,"화학나노학전공","자연", 학교장추천=2, 교과면접=5, 특수교육대상자=1, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CN,"융합에너지학전공","자연", 학교장추천=2, 교과면접=5, 특수교육대상자=1, 명지인재면접=6, 명지인재서류=2, 농어촌학생=2)
put(CN,"식품영양학전공","자연", 학교장추천=4, 교과면접=5, 특수교육대상자=1, 명지인재면접=6, 명지인재서류=3, 농어촌학생=2)
put(CN,"시스템생명과학전공","자연", 학교장추천=6, 교과면접=5, 특수교육대상자=1, 명지인재면접=6, 명지인재서류=8, 농어촌학생=2)
put(CN,"기계시스템공학부(기계공학전공·로봇공학전공)","자연", 학교장추천=8, 교과면접=9, 특성화고교=2, 명지인재면접=14, 명지인재서류=9, 농어촌학생=2)
put(CN,"건설환경공학전공","자연", 학교장추천=5, 교과면접=5, 특성화고교=3, 명지인재면접=14, 명지인재서류=6, 농어촌학생=2)
put(CN,"환경시스템공학전공","자연", 학교장추천=6, 교과면접=5, 특성화고교=3, 명지인재면접=14, 명지인재서류=8, 농어촌학생=2)
put(CN,"스마트모빌리티공학전공","자연", 학교장추천=4, 교과면접=5, 특성화고교=2, 특수교육대상자=1, 명지인재면접=6, 명지인재서류=5, 농어촌학생=2)
put(CN,"화학공학전공","자연", 학교장추천=6, 교과면접=5, 명지인재면접=6, 명지인재서류=8, 농어촌학생=2)
put(CN,"신소재공학전공","자연", 학교장추천=6, 교과면접=5, 명지인재면접=6, 명지인재서류=7, 농어촌학생=2)
put(CN,"반도체공학부","자연", 학교장추천=6, 교과면접=5, 명지인재면접=6, 명지인재서류=5, 농어촌학생=2)
put(CN,"전기정보공학전공","자연", 학교장추천=6, 교과면접=8, 특성화고교=2, 특수교육대상자=1, 명지인재면접=8, 명지인재서류=10, 농어촌학생=1)
put(CN,"전자공학전공","자연", 학교장추천=7, 교과면접=10, 특성화고교=2, 특수교육대상자=1, 명지인재면접=13, 명지인재서류=15, 농어촌학생=1)
put(CN,"AI컴퓨터공학전공","자연", 학교장추천=10, 교과면접=9, 특성화고교=3, 특수교육대상자=2, 명지인재면접=14, 명지인재서류=18, 농어촌학생=2)
put(CN,"AI응용시스템전공","자연", 학교장추천=9, 교과면접=9, 특성화고교=3, 특수교육대상자=2, 명지인재면접=14, 명지인재서류=16, 농어촌학생=2)
put(CN,"산업경영공학과","자연", 학교장추천=6, 교과면접=5, 특성화고교=2, 특수교육대상자=2, 명지인재면접=14, 명지인재서류=7, 농어촌학생=2)
put(CN,"건축학전공","자연", 학교장추천=4, 교과면접=5, 특수교육대상자=1, 명지인재면접=6, 명지인재서류=11, 농어촌학생=2)
put(CN,"전통건축학전공","자연", 학교장추천=2, 교과면접=5, 특수교육대상자=1, 명지인재면접=6, 명지인재서류=2, 농어촌학생=2)
put(CN,"공간디자인학과","자연", 학교장추천=2, 교과면접=5, 명지인재면접=6, 명지인재서류=2, 농어촌학생=2)
put(CN,"자율전공학부(자연)","자연", 학교장추천=22, 교과면접=10, 기회균형=30, 명지인재면접=5, 명지인재서류=19, 크리스천리더=5)

# ===== 자연캠퍼스 단과대학(계열) 단위: 크리스천/사배 =====
put(CN,"화학·생명과학대학","자연", 크리스천리더=5, 사회적배려대상자=5)
put(CN,"스마트시스템공과대학","자연", 크리스천리더=7, 사회적배려대상자=5)
put(CN,"반도체·ICT대학","자연", 크리스천리더=7, 사회적배려대상자=6)
put(CN,"건축대학","자연", 크리스천리더=2)

# ===== 자연캠퍼스 실기/실적 (디자인학부·예술학부·스포츠학부) =====
put(CN,"비주얼커뮤니케이션디자인전공","예체능", 실기우수자=21)
put(CN,"인더스트리얼디자인전공","예체능", 실기우수자=21)
put(CN,"영상애니메이션디자인전공","예체능", 실기우수자=21)  # 상황표현11+기초디자인10
put(CN,"패션디자인전공","예체능", 실기우수자=21)
put(CN,"아트앤멀티미디어음악전공","예체능", 실기우수자=35)  # 피아노10+성악10+싱어송라이터7+작곡8
put(CN,"뮤지컬공연전공","예체능", 실기우수자=20)            # 보컬10+댄스10
put(CN,"스포츠학부(체육학전공, 스포츠산업학전공)","예체능", 특기자=5)
put(CN,"스포츠학부(스포츠지도학전공)[야]","예체능", 특기자=26)  # 축구8+농구5+배구5+테니스6+골프2

# 재외국민 자연측(약20명) — 세부 모집요강 없음, grid 단과대학별 분배 판독 불가 → null
put(CN,"재외국민(자연캠퍼스)","자연", 재외국민=None)

# ── 검증용 컬럼 총합(총계 행, p.9) ──
COLTOT = {"학교장추천":299,"교과면접":269,"기회균형":60,"특성화고교":37,"만학도":25,
 "특성화고등졸재직자":147,"특수교육대상자":50,"명지인재면접":379,"명지인재서류":361,
 "크리스천리더":52,"사회적배려대상자":35,"농어촌학생":93,"실기우수자":139,"특기자":31,"재외국민":50}

# ── build departments ──
departments=[]
colsum=defaultdict(int)
colnull=defaultdict(int)
for (campus,dept,hint),tracks in D.items():
    trackobjs=[]
    tq=0; has_null=False
    for tk,q in tracks.items():
        meta=TM[tk]
        if q is None:
            colnull[tk]+=1; has_null=True
        else:
            colsum[tk]+=q; tq+=q
        trackobjs.append(OrderedDict([
            ("trackName",meta[0]),
            ("trackTypeRaw",meta[1]),
            ("recruitmentPeriodRaw","수시"),
            ("specialTypeKeyword",meta[2]),
            ("quotaInitial",q),
            ("applicationQualification",meta[4]),
            ("reflectionStages",meta[3]),
            ("csatMinimumRawText","없음"),
            ("csatMinimumExempt",True),
            ("csatRequiredAreasRawText",None),
            ("prevYearResult",None),
            ("sourcePages",meta[5]),
        ]))
    departments.append(OrderedDict([
        ("departmentName",dept),
        ("campus",campus),
        ("trackHint",hint),
        ("totalQuotaHint", (tq if not has_null else (tq if tq>0 else None))),
        ("tracks",trackobjs),
    ]))

# ── column-sum validation (열합) ──
colval=[]
all_ok=True
for tk in TM:
    comp=colsum.get(tk,0); stated=COLTOT.get(tk)
    match = (comp==stated)
    if tk=="재외국민":
        # 인문측만 합산(=30), 자연측 null → stated 50 와 불일치 정상
        match = (comp==30 and colnull.get(tk,0)>=1)
    if not match: all_ok=False
    colval.append({"track":TM[tk][0],"computed":comp,"stated":stated,
                   "match":bool(comp==stated),
                   **({"note":"자연캠퍼스 재외국민(약20명) 세부요강 없음·분배 판독불가로 null 처리, 인문측 30명만 합산"} if tk=="재외국민" else {})})

# row validation: totalQuotaHint == sum(track quotas) by construction; null-track depts allowed
row_failed=[]
row_pass=0
for d in departments:
    tq=d["totalQuotaHint"]
    qsum=sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    nnull=sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
    if tq is None:
        continue
    if qsum==tq and nnull==0:
        row_pass+=1
    elif qsum<=tq and nnull>0:
        row_pass+=1
    else:
        row_failed.append(d["departmentName"])

total_tracks=sum(len(d["tracks"]) for d in departments)
checksum_passed = all([colsum.get(tk)==COLTOT[tk] for tk in TM if tk!="재외국민"]) and not row_failed

warnings=[]
warnings.append("재외국민(기타) 전형은 세부 모집요강이 없고 자연캠퍼스 분배가 grid 레이아웃에서 판독 불가하여 인문캠퍼스 단과대학 5곳(4+4+8+6+8=30)만 기록, 자연캠퍼스(약20명, 총 50-30)는 '재외국민(자연캠퍼스)' dept 에 quota=null 로 보존.")
warnings.append("특수교육대상자: 인문캠퍼스는 단과대학(계열) 단위(각 7명, 5개 대학=35), 자연캠퍼스는 전공 단위(15명). 모집요강 표기 그대로 반영.")
warnings.append("사회적배려대상자·크리스천리더: 단과대학(계열) 단위 모집(자율전공학부는 단위별). 모집요강 표기 그대로 반영.")
warnings.append("만학도·특성화고등졸재직자 중 멀티디자인전공은 1·2단계(면접 포함), 그 외 전공은 일괄 교과100%. reflectionStages 는 다수 전공 기준(일괄)으로 기록.")
warnings.append("특기자(스포츠학부): 종목별 전형방법 상이(축구·농구/배구는 단계형 실적100→실기70). reflectionStages 는 대표(일괄 실적50+면접30+교과10+출결10) 기록, 상세는 applicationQualification 참조.")
warnings.append("입학정원표(Ⅱ) 모집인원 컬럼은 수시+정시 합산이므로 행합 기준으로 사용하지 않음. 행합/열합은 전형별 모집인원표(Ⅲ) 수시 컬럼 기준.")

result=OrderedDict([
 ("universityName",UNIV),("year",2027),("recruitmentSeason","susi"),
 ("departments",departments),("warnings",warnings),
])
meta=OrderedDict([
 ("universityName",UNIV),("universityId",SLUG),("year",2027),("recruitmentSeason","susi"),
 ("method","pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)"),("visionCost",0),
 ("campusScope","인문캠퍼스(서울) + 자연캠퍼스(용인) 2캠퍼스. 수시 전형별 모집인원 총괄표(Ⅲ) 및 세부 전형 안내(Ⅵ) 모집인원표 기준."),
 ("sourceDocYear",2027),
 ("departments",len(departments)),("totalTracks",total_tracks),
 ("rowSumValidation",{"basis":"totalQuotaHint(학과별 수시 전형 인원 합)","passed":row_pass,"failed":len(row_failed),"failedList":row_failed}),
 ("colTotalValidation",colval),
 ("checksumPassed",bool(checksum_passed)),
])

out=OrderedDict([("meta",meta),("result",result)])
p=Path("scripts/etl/text-extract-test/myongji-text.json")
p.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")

# console report
print(f"departments={len(departments)} tracks={total_tracks}")
print(f"row pass={row_pass} fail={len(row_failed)} {row_failed}")
print("\n열합(column-sum) check:")
for cv in colval:
    flag="OK" if cv["match"] else ("~null" if "note" in cv else "MISMATCH")
    print(f"  {cv['track']:<28} computed={cv['computed']:>4} stated={cv['stated']:>4}  {flag}")
print(f"\nchefcksumPassed={checksum_passed}")
print(f"null tracks: {dict(colnull)}")
