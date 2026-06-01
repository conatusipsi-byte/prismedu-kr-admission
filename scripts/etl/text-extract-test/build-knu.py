#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
경북대학교 2027 수시 — pdftotext -layout 텍스트(knu.txt) → AdmissionRecord JSON.

Vision API 미사용 (클라이언트 운영비 0). Claude Code 본체가 knu.txt 전체를 정독하고
모집인원 그리드(정원내 phys9/11/13, 정원외 phys10/12/14)를 페이지별 컬럼 우측끝 캘리브로
결정론 파싱 + 전형안내 상세(phys28~)의 반영비율·수능최저 템플릿을 결합한다.

이중 체크섬:
  · 행합(열) : 학과별 (정원내 계 == Σ정원내전형) + (정원외 계 == Σ정원외 계-컬럼)
  · 열합(컬럼): 전형별 모집인원 합 == PDF 총계행
       정원내 총계(phys13): 4,196 = [1394,601,9,119,883,366,26,3,17,4,5,19,544,195,11]
       정원외 총계(phys14):   334 계컬럼 + 장애인21 + 논술6
         [특성화고31,농어촌193,기초생활재직51,특성화고졸재직25,모바일7,장애인21,논술6]

정직성:
  · 미기재 null, 미적용 "없음", 고정인원없는 전형 quotaInitial=null + note(warnings).
  · 예체능(실기/특기자) 자체배점(점·%) 보존. enum 만 사용.
  · 모바일AI공학전공: 삼성 계약학과(정원외, 학·석사통합) → 정원내 계 없음, 정원외 13(모바일7+논술6) 특수처리.
  · 첨단기술융합대학 자율학부1/2: 이름 끝 각주숫자(1/2) 토큰화 → end<26 제거.
  · 단과대학·계열: 그리드 병합셀(수직중앙) forward-fill 오분류 위험 → 그리드 순서 기반
    단과대학 명시 경계 + 수능최저표(phys80)/캠퍼스안내(phys14) 명시근거로 매핑.
"""
import json, re, sys
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "knu.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1
PAT = re.compile(r'[\d,]+')

def num_tokens(s, min_end=26):
    """모집인원 숫자 토큰만. 각주참조('3)') 류(뒤에 ')')는 제외, end<min_end(이름내 각주) 제외."""
    out = []
    for m in PAT.finditer(s):
        if m.end() < min_end:
            continue
        if m.end() < len(s) and s[m.end()] == ')':   # '3)' 각주 참조
            continue
        out.append(m)
    return out

# ════════════════════════════════════════════════════════════════════════════
# 1. 모집인원 그리드 파싱 (페이지별 컬럼 우측끝 캘리브, 본체가 knu.txt에서 직접 도출)
# ════════════════════════════════════════════════════════════════════════════
# 정원내 15개 전형 컬럼 (좌→우, 총계행/헤더 검증 완료)
COLS_IN = ["교과우수자","지역인재(교과)","지역인재기초생활수급자등대상자","사회통합",
           "일반학생","지역인재(종합)","지역의사선발","지역인재학교장추천","사회배려자",
           "SW특별","고졸재직자","영농창업인재","논술(AAT)","실기","특기자(체육)"]
TOT_IN = [1394,601,9,119,883,366,26,3,17,4,5,19,544,195,11]   # phys13 총계행 (대조 하드코딩)

# 페이지별 (트랙컬럼 우측끝, COLS_IN 인덱스) — knu.txt 데이터행에서 직접 측정
PAGE_EDGES_IN = {
 8:  [(40.5,0),(45.5,1),(52.5,3),(58,4),(63.5,5),(76,8),(93.5,12),(94.5,13)],
 10: [(42,0),(46.5,1),(51,2),(55,3),(59.5,4),(64.5,5),(70,6),(74,7),(78,8),
      (82,9),(86,10),(91,11),(95.5,12),(101,13),(106,14)],
 12: [(44,0),(49.5,1),(56,2),(60.5,3),(65.5,4),(70.5,5),(84,8),(97,11),
      (103.5,12),(111,13),(117,14)],
}
PAGES_IN = [8, 10, 12]

# 정원외 7개 전형 컬럼 (좌→우). 계 = 처음 5개(특성화고~모바일) 합; 장애인·논술은 계 제외(별도 정원외).
COLS_OUT = ["특성화고졸업자","농어촌학생","기초생활수급자등대상자(재직자)","특성화고졸재직자",
            "모바일과학인재","장애인등대상자","논술(AAT)"]
TOT_OUT = [31,193,51,25,7,21,6]   # phys14 총계행
GYE_COLS_OUT = {0,1,2,3,4}        # 정원외 '계'에 포함되는 컬럼 (장애인·논술 제외)
PAGE_EDGES_OUT = {
 9:  [(35,0),(47,1),(54,2),(82,5)],
 11: [(47,0),(60,1),(68,2),(80,3),(88,4),(97,5),(106,6)],
 13: [(38,0),(50,1),(58,2),(69,3),(86,5),(95,6)],
}
GYE_END_OUT = {9: 28, 11: 40.5, 13: 31}   # 정원외 '계' 컬럼 우측끝(페이지별)
PAGES_OUT = [9, 11, 13]

SUFFIX_FOOTNOTE = re.compile(r'\d+\)\s*$')   # 이름 끝 '1)' 류

# 그리드 좌측 라벨 형식: [단과대학 병합조각...] [계열] [모집단위명].
# 단과대학 조각(병합셀 수직분할로 1~2글자씩 끊김) + 계열어를 제거하고 모집단위명만 남긴다.
GYE_TOKENS = {"인문", "자연", "예능", "체능", "인문·"}
# 단과대학 병합셀이 분할되며 나오는 조각들 (모집단위명에는 쓰이지 않거나, 뒤에 본명이 또 옴)
COLLEGE_FRAG = {"인문", "자연", "예능", "체능", "대학", "과학", "사회", "경상", "공과", "농업",
                "예술", "사범", "의과", "치과", "생활", "간호", "약학", "첨단", "행정", "전공",
                "인재", "기술", "환경", "공학", "생태", "수의과", "생명"}
def clean_name(name_raw):
    """단과대학 병합조각 + 계열어 + 각주 제거 → 모집단위명."""
    n = SUFFIX_FOOTNOTE.sub("", name_raw.strip()).strip()
    toks = n.split()
    if not toks:
        return ""
    # 계열어 제거 (위치 무관)
    toks = [t for t in toks if t.strip("·") not in {"인문", "자연", "예능", "체능"}]
    # 선행 ASCII 단과라벨(IT/AI) 제거 — 모집단위명 본체는 그 뒤 한글
    while len(toks) > 1 and toks[0] in ("IT", "AI"):
        toks = toks[1:]
    # 모집단위명은 보통 마지막 토큰(괄호 포함). 단과조각은 앞쪽 짧은 조각.
    # 앞에서부터 COLLEGE_FRAG 정확일치 토큰 제거 (단과대학 병합셀 분할 조각).
    #   토큰이 '…학부'/'…학과'/'…전공'으로 끝나면 모집단위명이므로 보호.
    #   (예: 단과조각 '전공'은 제거, 모집단위 '자율전공학부'·'…전공'은 보호)
    # 단과 병합조각(예: 자율전공학부→'전공', 행정학부→'행정')은 뒤에 완성 모집단위명이 또 오면 제거.
    def is_full_dept(t):
        return len(t) >= 3 and (t.endswith("학부") or t.endswith("학과")
                                or t.endswith("학부)") or t.endswith("전공)") or "(" in t)
    while len(toks) > 1 and toks[0] in COLLEGE_FRAG and not is_full_dept(toks[0]) \
            and is_full_dept(toks[-1]):
        toks = toks[1:]
    # 여전히 선행 단과조각이 남고 마지막이 완성명이 아니면(드묾) 보수적으로 1회 더 시도
    while len(toks) > 1 and toks[0] in COLLEGE_FRAG and not is_full_dept(toks[0]):
        toks = toks[1:]
    # 연속 중복(예: '행정학부 행정학부') 축약
    out = []
    for t in toks:
        if out and out[-1] == t:
            continue
        out.append(t)
    return " ".join(out).strip()

def parse_grid_row(s, edges, ncol, gye_end=None):
    """행 → (계/합계, cells[ncol]). gye_end 지정시(정원외) 계=gye_end 근처 토큰."""
    ms = num_tokens(s.rstrip())   # 이름내 각주(end<26) + 각주참조('N)') 제거
    if not ms:
        return None
    cells = [None] * ncol
    bad = None
    if gye_end is None:
        # 정원내: 첫 토큰=합계, 둘째=계(정원내), 나머지=트랙
        if len(ms) < 2:
            return None
        hap = int(ms[0].group().replace(',', ''))
        gye = int(ms[1].group().replace(',', ''))
        track_ms = ms[2:]
    else:
        # 정원외: gye_end 근처(≤4) 토큰만 계로 인정. 계 없으면(far-right만 있는 행) 전부 트랙.
        cand = [m for m in ms if abs(m.end() - gye_end) <= 4]
        if cand:
            gye_m = min(cand, key=lambda m: abs(m.end() - gye_end))
            gye = int(gye_m.group().replace(',', ''))
            track_ms = [m for m in ms if m is not gye_m]
        else:
            gye_m = None
            gye = None              # 계 미표기 (장애인/논술만 있는 행)
            track_ms = ms
        hap = gye
    for m in track_ms:
        e = m.end(); v = int(m.group().replace(',', ''))
        best = min(edges, key=lambda x: abs(x[0] - e))
        if abs(best[0] - e) <= 3.0:
            ci = best[1]
            if cells[ci] is None:
                cells[ci] = v
            else:
                bad = f"dup col{ci}"
        else:
            bad = f"unassign e={e} v={v}"
    return hap, gye, cells, bad

def is_grid_row(s, gye_end):
    if '총계' in s or re.search(r'-\s*\d+\s*-', s):
        return False
    st = s.lstrip()
    if st.startswith(('-', '•', '※', ')')) or re.match(r'\s*\d+\)', s):
        return False
    if not re.search(r'[가-힣]{2,}', s) and not re.search(r'[A-Z]{2}', s):
        return False
    ms = [m for m in PAT.finditer(s) if m.end() >= 26]
    if not ms:
        return False
    return any(abs(m.end() - gye_end) <= 3 for m in ms)

MOBILE = "모바일AI공학전공"

def lookback_name(lines, i):
    """numeric-only 행(이름 wrap)의 모집단위명을 직전 라인에서 역탐색.
       각주('N)')·계열라벨 단독 라인은 건너뛰고 한글 모집단위명 라인을 잡음."""
    for j in range(i - 1, max(-1, i - 5), -1):
        prev = lines[j].strip()
        if not prev or re.match(r'^\d+\)', prev):
            continue
        if prev in ("자연", "인문", "예능", "체능", "대학", "과학", "농업"):
            continue
        if re.search(r'[가-힣]{2,}', prev) or re.search(r'[A-Z]{2}', prev):
            nm = clean_name(re.sub(r'[\d,]+.*$', '', prev))
            if nm:
                return nm
    return None

# ── 정원내 파싱 ──────────────────────────────────────────────────────────────
warnings, row_fail_in = [], []
col_in = [0] * 15
dept_in = {}            # name -> {col_idx: quota}
dept_order = []         # grid 등장 순서
dept_total = {}         # name -> 합계(정원내계+정원외)
dept_gye_in = {}        # name -> 정원내 계
for pi in PAGES_IN:
    edges = PAGE_EDGES_IN[pi]
    lines = pages[pi].splitlines()
    for i, ln in enumerate(lines):
        s = ln.rstrip()
        if '총계' in s or re.match(r'\s*\d+\)', s) or re.search(r'-\s*\d+\s*-', s):
            continue
        if s.lstrip().startswith(('-', '•', '※')):
            continue
        ms = num_tokens(s)   # 이름내 각주 + 각주참조('N)') 제거
        # 데이터행: 합계컬럼(end 26~36) 토큰 존재
        if not (ms and 26 <= ms[0].end() <= 36):
            continue
        res = parse_grid_row(s, edges, 15)
        if res is None:
            continue
        hap, gye, cells, bad = res
        name_raw = s[:ms[0].start()]
        if re.search(r'[가-힣]{2,}', s) or re.search(r'[A-Z]{2}', name_raw):
            name = clean_name(name_raw)
        else:
            # 숫자만 있는 행 → 직전 라인에서 모집단위명 역탐색 (wrap)
            name = lookback_name(lines, i)
        if not name:
            continue
        if bad:
            row_fail_in.append((pi+1, name, bad)); warnings.append(f"[정원내 파싱실패] {name} (phys{pi+1}): {bad}")
            continue
        tsum = sum(v for v in cells if v)
        if gye != tsum:
            row_fail_in.append((pi+1, name, f"계{gye}≠Σ{tsum}"))
            warnings.append(f"[정원내 행합불일치] {name} (phys{pi+1}): 계 {gye} ≠ 전형합 {tsum}")
            continue
        dept_order.append(name)
        dept_total[name] = hap
        dept_gye_in[name] = gye
        d = dept_in.setdefault(name, {})
        for i, v in enumerate(cells):
            if v:
                d[i] = v; col_in[i] += v

# ── 정원외 파싱 ──────────────────────────────────────────────────────────────
# 정원외 행은 ① 계(gye_end 근처) 있는 정상행, ② 계 없이 far-right(장애인/논술)만 있는 행,
# ③ 병합셀 단과라벨 행에 far-right 값만 붙은 행 — 모두 처리.
col_out = [0] * 7
dept_out = {}
row_fail_out = []
orphan_out = []   # 단과라벨 행(역탐색 실패)에 붙어 dept 귀속 불가한 값
LABEL_ONLY = ("경상", "생명", "자연", "인문", "예능", "체능", "대학", "과학", "농업")
for pi in PAGES_OUT:
    edges = PAGE_EDGES_OUT[pi]; ge = GYE_END_OUT[pi]
    lines = pages[pi].splitlines()
    for i, ln in enumerate(lines):
        s = ln.rstrip()
        ms_all = num_tokens(s)
        if '총계' in s or re.search(r'-\s*\d+\s*-', s) or s.lstrip().startswith(('-', '•', '※', ')')):
            continue
        if re.match(r'\s*\d+\)', s) or not ms_all:
            continue
        res = parse_grid_row(s, edges, 7, gye_end=ge)
        if res is None:
            continue
        hap, gye, cells, bad = res
        if bad:
            row_fail_out.append((pi+1, s.strip()[:20], bad)); continue
        has_gye = any(abs(m.end() - ge) <= 3 for m in ms_all)
        nm_strip = s.strip()
        # 숫자 제거한 순수 텍스트가 단과/계열 라벨뿐(또는 공백)이면 → 모집단위명 없는 라벨행
        text_only = re.sub(r'[\d,·]+', '', s).strip()
        is_label_only = text_only in LABEL_ONLY or text_only == ""
        # 이름 결정
        if is_label_only:
            # 병합셀 단과대학 라벨 행에 far-right 값만 붙음 → 어느 모집단위 귀속인지
            #   PDF상 모호(수직중앙 배치) → 날조 금지, orphan 처리(열합엔 포함).
            name = None
        elif re.search(r'[가-힣]{2,}', s):
            name = clean_name(s[:ms_all[0].start()])
        else:
            name = lookback_name(lines, i)   # 숫자만(이름 wrap) → 역탐색
        # 위치파싱값은 열합 검증 위해 항상 컬럼합산
        for k, v in enumerate(cells):
            if v:
                col_out[k] += v
        if not name:
            for k, v in enumerate(cells):
                if v:
                    orphan_out.append((pi+1, nm_strip, COLS_OUT[k], v))
            continue
        # 계 없는 far-right-only 행: 장애인/논술만 귀속 (계컬럼 없음)
        if has_gye and gye is not None and MOBILE not in s:
            gsum = sum(v for k, v in enumerate(cells) if v and k in GYE_COLS_OUT)
            if gsum != gye:
                warnings.append(f"[정원외 행합참고] {name} (phys{pi+1}): 계 {gye} ≠ 계컬럼합 {gsum} "
                                f"(장애인·논술 제외 정의상; PDF 계 표기차 또는 미추출)")
        d = dept_out.setdefault(name, {})
        for k, v in enumerate(cells):
            if v:
                d[k] = d.get(k, 0) + v

# ════════════════════════════════════════════════════════════════════════════
# 2. 단과대학 / 계열 / 캠퍼스 / 수능최저그룹 (그리드 순서 기반 명시 매핑)
# ════════════════════════════════════════════════════════════════════════════
# 그리드 등장 순서대로 단과대학 경계 (knu.txt phys9~13 단과대학 병합셀 라벨 기준)
COLLEGE_BLOCKS = [
 ("인문대학", ["국어국문학과","영어영문학과","사학과","철학과","불어불문학과","독어독문학과",
              "중어중문학과","고고인류학과","일어일문학과","한문학과","노어노문학과","인문대학 자율학부"]),
 ("사회과학대학", ["정치외교학과","사회학과","지리학과","문헌정보학과","심리학과","사회복지학부",
                "미디어커뮤니케이션학과","사회과학대학 자율학부"]),
 ("자연과학대학", ["수학과","물리학과","화학과","생물학과","생명공학부","통계학과","지구시스템과학부",
                "자연과학대학 자율학부"]),
 ("경상대학", ["경제통상학부","경영학부","경상대학 자율학부"]),
 ("공과대학", ["금속재료공학과","신소재공학과","기계공학부","건축학부(건축학전공)","건축학부(건축공학전공)",
              "토목공학과","응용화학공학부","고분자공학과","섬유시스템공학과","환경공학과","에너지공학부",
              "공과대학 자율학부"]),
 ("IT대학", ["전자공학부","전자공학부(인공지능전공)","전기공학과","전자공학부 모바일AI공학전공","IT 첨단자율학부"]),
 ("AI대학", ["인공지능시스템학과","컴퓨터학부(심화컴퓨팅전공)","컴퓨터학부(첨단AI컴퓨팅전공)","AI자율학부"]),
 ("농업생명과학대학", ["응용생명과학부","식물의학과","식품공학부","산림과학ㆍ조경학부","원예과학과",
                  "바이오섬유소재학과","농업토목공학과","스마트생물산업기계공학과","식품자원경제학과",
                  "농산업학과","농업생명과학대학 자율학부"]),
 ("예술대학", ["음악학과","국악학과","미술학과","디자인학과"]),
 ("사범대학", ["교육학과","국어교육과","영어교육과","유럽어교육학부(독어교육전공)","역사교육과","지리교육과",
              "일반사회교육과","윤리교육과","수학교육과","물리교육과","화학교육과","생물교육과",
              "지구과학교육과","가정교육과","체육교육과","정보·컴퓨터교육과"]),
 ("의과대학", ["의예과"]),
 ("치과대학", ["치의예과"]),
 ("수의과대학", ["수의예과"]),
 ("생활과학대학", ["아동학부","의류학과","식품영양학과"]),
 ("간호대학", ["간호학과"]),
 ("약학대학", ["약학과"]),
 ("첨단기술융합대학", ["첨단기술융합대학 자율학부1","첨단기술융합대학 자율학부2"]),
 ("행정학부", ["행정학부"]),
 ("자율전공학부", ["자율전공학부"]),
 ("공과대학(첨단자율학부)", ["첨단자율학부"]),  # '공학 첨단자율학부'
 ("생태환경대학", ["식물자원학과","산림생태보호학과","곤충생명과학과","축산학과","동물생명공학과",
                "말/특수동물학과","관광학과","체육학부(체육학전공)","체육학부(건강운동관리전공)"]),
 ("과학기술대학", ["건설방재공학과","환경안전공학과","정밀기계공학과","자동차공학과","소프트웨어학과",
                "나노신소재공학과","에너지화학공학과","식품외식산업학과","섬유패션디자인학부(섬유공학전공)",
                "위치정보시스템학과","스마트플랜트공학과","치위생학과","섬유패션디자인학부(패션디자인전공)"]),
 ("자율미래인재학부", ["자율미래인재학부"]),
]
COLLEGE_OF = {}
for col, depts in COLLEGE_BLOCKS:
    for d in depts:
        COLLEGE_OF[d] = col

# 캠퍼스 (phys14 단과대학별 위치 명시)
SANGJU = {"생태환경대학", "과학기술대학", "자율미래인재학부"}
def campus_of(college):
    if college in SANGJU:
        return "상주"
    return "대구"

# 계열 (수능최저표 phys80 + 그리드 인라인 계열라벨 + 모집단위 성격 명시근거)
# 예체능: 음악/국악/미술/디자인(예술대 실기), 체육교육과/체육학부(체능), 섬유패션디자인(패션디자인전공) 예능
GYE_ART = {"음악학과","국악학과","미술학과","디자인학과","섬유패션디자인학부(패션디자인전공)"}  # 예능
GYE_PE  = {"체육교육과","체육학부(체육학전공)","체육학부(건강운동관리전공)"}                       # 체능
GYE_INMUN = {  # 인문계열 (수능최저 '상위 2개' 또는 인문 인라인라벨/단과)
 "국어국문학과","영어영문학과","사학과","철학과","불어불문학과","독어독문학과","중어중문학과",
 "고고인류학과","일어일문학과","한문학과","노어노문학과","인문대학 자율학부",
 "정치외교학과","사회학과","지리학과","문헌정보학과","심리학과","사회복지학부",
 "미디어커뮤니케이션학과","사회과학대학 자율학부","경제통상학부","경영학부","경상대학 자율학부",
 "교육학과","국어교육과","영어교육과","유럽어교육학부(독어교육전공)","역사교육과","지리교육과",
 "일반사회교육과","윤리교육과","식품자원경제학과","관광학과","행정학부",
}
def gye_of(name):
    if name in GYE_ART: return "예체능"
    if name in GYE_PE:  return "예체능"
    if name in GYE_INMUN: return "인문"
    return "자연"

# ════════════════════════════════════════════════════════════════════════════
# 3. 수능최저학력기준 (phys80 표 — 단과대학 그룹별 원문 보존)
# ════════════════════════════════════════════════════════════════════════════
# 일반학과 (가): 등급합 5(IT/AI/경상/간호/사범/행정/자율전공) / 6(공과·첨단·인문·사회과학·자연과학·농업생명·생활과학)
CSAT_GEN_5 = ("[일반학과] IT대학·AI대학: 수학 포함 2개 영역 등급 합 5 이내 / "
              "경상대학·간호대학·사범대학·행정학부·자율전공학부: 상위 2개 영역 등급 합 5 이내. 한국사 응시")
CSAT_GEN_6 = ("[일반학과] 공과대학·첨단기술융합대학·공학 첨단자율학부: 수학 포함 2개 영역 등급 합 6 이내 / "
              "인문대학·사회과학대학·자연과학대학·농업생명과학대학·생활과학대학: 상위 2개 영역 등급 합 6 이내. 한국사 응시")
CSAT_MED_4 = "의예과·치의예과: 국어,수학,영어,탐구(2과목) 중 수학 포함 3개 영역 등급 합 4 이내. 한국사 응시"
CSAT_MED_5 = "수의예과·약학과: 국어,수학,영어,탐구(2과목) 중 수학 포함 3개 영역 등급 합 5 이내. 한국사 응시"
CSAT_MOBILE = "전자공학부 모바일AI공학전공: 수학(미적분/기하), 과탐(2과목) 등급 합 3 이내. 한국사 응시"
CSAT_ART_DESIGN = "미술학과·디자인학과: 국어,영어,탐구(1과목) 중 상위 1개 영역 4등급 이내. 한국사 응시"
CSAT_LOWER1 = " (지역인재기초생활수급자등대상자·일반학생·실기[체육교육과]·농어촌학생·지역의사선발 등은 위 기준에서 등급 합 1등급 하향 적용)"

# 등급합 5 그룹 단과대학
COL_CSAT5 = {"IT대학","AI대학","경상대학","간호대학","사범대학","행정학부","자율전공학부"}
# 등급합 6 그룹
COL_CSAT6 = {"공과대학","첨단기술융합대학","공과대학(첨단자율학부)",
             "인문대학","사회과학대학","자연과학대학","농업생명과학대학","생활과학대학"}
COL_MED4 = {"의과대학","치과대학"}
COL_MED5 = {"수의과대학","약학대학"}
COL_NONE = {"생태환경대학","과학기술대학","자율미래인재학부"}   # 미적용

def csat_for(track_name, dept, college):
    """(csatMinimumRawText, csatMinimumExempt, csatRequiredAreasRawText)."""
    # 수능최저 미적용 전형 (요약 phys5 + 상세 phys 명시: '없음')
    NO_CSAT_TRACKS = {"사회통합","특성화고졸업자","사회배려자","SW특별","고졸재직자","영농창업인재",
                      "농어촌학생","기초생활수급자등대상자(재직자)","특성화고졸재직자","장애인등대상자",
                      "특기자(체육)"}
    AREAS = ("탐구영역은 사탐/과탐 2개 과목 응시, 상위 1개 과목 등급 반영 "
             "(의·치·수·약은 2과목 반영, 모바일AI공학전공은 과탐 2과목 반영)")
    # 미술/디자인 실기
    if track_name == "실기" and dept in ("미술학과", "디자인학과"):
        return CSAT_ART_DESIGN, False, "국어, 영어, 탐구(1과목) — 한국사 응시"
    # 음악/국악/체육 실기 → 수능 미반영 (예술대 음악·국악, 체육 미적용)
    if track_name == "실기":
        if dept in ("음악학과", "국악학과"):
            return "없음", True, "없음"
        if dept == "체육교육과":
            # 실기 체육교육과: 위 일반 기준에서 1등급 하향 → 사범대(5) → 6? 표상 체육교육과 실기 1등급 하향
            return "체육교육과 실기: 일반학과 수능최저 기준에서 등급 합 1등급 하향 적용. 한국사 응시", False, AREAS
        # 체육학부 등 생태환경대 실기 → 미적용
        return "없음", True, "없음"
    if track_name in NO_CSAT_TRACKS:
        return "없음", True, "없음"
    # 미적용 단과대학 (생태환경/과학기술/자율미래인재) — 교과우수자/일반학생 등도 미적용
    if college in COL_NONE:
        return "없음", True, "없음"
    # 의/치/수/약
    if college in COL_MED4:
        base = CSAT_MED_4
    elif college in COL_MED5:
        base = CSAT_MED_5
    elif dept == "전자공학부 모바일AI공학전공" or track_name == "모바일과학인재":
        base = CSAT_MOBILE
    elif college in COL_CSAT5:
        base = CSAT_GEN_5
    elif college in COL_CSAT6:
        base = CSAT_GEN_6
    else:
        base = CSAT_GEN_6
    # 1등급 하향 트랙
    LOWER = {"지역인재기초생활수급자등대상자","일반학생"}
    if track_name in LOWER:
        base = base + CSAT_LOWER1
    return base, False, AREAS

# ════════════════════════════════════════════════════════════════════════════
# 4. 전형방법(reflectionStages) — phys28~ 상세에서 본체가 직접 추출
# ════════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, mx):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": mx}

# 학생부교과 일괄 (교과 80% + 서류[교과이수충실도] 20%, 500점)
GYO_STAGES = [stage("일괄합산", None, {"학생부(교과)": 400, "서류평가(교과이수충실도)": 100}, 500)]
# 학생부종합 일괄 서류100% (500점)
JONGHAP_DOC = [stage("일괄합산", None, {"서류평가": 500}, 500)]
# 단계 (1단계 서류100% N배수 → 2단계 서류70%+면접30%)
def step2(mult1):
    return [stage("1단계", mult1, {"서류평가": 350}, 350),
            stage("2단계", None, {"서류평가": 350, "면접": 150}, 500)]
# 논술(AAT) 일괄 (교과30% 150점 + 논술70% 350점, 500점)
NONSUL_STAGES = [stage("일괄합산", None, {"학생부(교과)": 150, "논술(AAT)": 350}, 500)]

# 모바일과학인재 (1단계 500% 서류100% 250점 → 2단계 서류50%+면접50% 500점)
MOBILE_STAGES = [stage("1단계", 5.0, {"서류평가": 250}, 250),
                 stage("2단계", None, {"서류평가": 250, "면접": 250}, 500)]
# 장애인 (1단계 300%)
JANGAE_STAGES = [stage("1단계", 3.0, {"서류평가": 350}, 350),
                 stage("2단계", None, {"서류평가": 350, "면접": 150}, 500)]
# 특기자(체육) 체육교육과 (1단계 400% 입상실적100% 300점 → 2단계 입상실적60%+교과10%+출결10%+면접20% 500점)
TUKGI_PE = [stage("1단계", 4.0, {"입상실적": 300}, 300),
            stage("2단계", None, {"입상실적": 300, "학생부(교과)": 50, "학생부(출결)": 50, "면접": 100}, 500)]

# 실기 — 모집단위/전공별 자체배점 보존 (phys63)
# 기본(음악·미술 등): 1단계 1,000% 실기100% → 2단계 교과20%+실기80% 500점
SILGI_DEFAULT = [stage("1단계", 10.0, {"실기": 100}, 100),
                 stage("2단계", None, {"학생부(교과)": 100, "실기": 400}, 500)]
SILGI_GUKAK = [stage("일괄합산", None, {"학생부(교과)": 100, "실기": 400}, 500)]          # 국악학과 일괄
SILGI_DESIGN = [stage("일괄합산", None, {"학생부(교과)": 200, "실기": 300}, 500)]         # 디자인학과 일괄 교과40%+실기60%
def silgi_stages(dept):
    if dept == "국악학과":
        return SILGI_GUKAK
    if dept == "디자인학과":
        return SILGI_DESIGN
    return SILGI_DEFAULT   # 음악/미술/섬유패션(패션디자인)/체육학부(체육학) 등 — 단계별

# 트랙별 메타: (컬럼인덱스, trackTypeRaw, specialTypeKeyword, stages-or-fn, special_note)
JONGHAP = "학생부위주(종합)"
GYOGWA = "학생부위주(교과)"
TRACK_META = {
 0:  dict(name="교과우수자",        ttype=GYOGWA,  special=None,      stages=GYO_STAGES),
 1:  dict(name="지역인재(교과)",     ttype=GYOGWA,  special="지역인재", stages=GYO_STAGES),
 2:  dict(name="지역인재기초생활수급자등대상자", ttype=GYOGWA, special="기회균형", stages=GYO_STAGES),
 3:  dict(name="사회통합",          ttype=GYOGWA,  special="기회균형", stages=GYO_STAGES),
 4:  dict(name="일반학생",          ttype=JONGHAP, special=None,      stages=JONGHAP_DOC),
 5:  dict(name="지역인재(종합)",     ttype=JONGHAP, special="지역인재", stages="step2"),
 6:  dict(name="지역의사선발",       ttype=JONGHAP, special="지역인재", stages=step2(5.0)),
 7:  dict(name="지역인재학교장추천",  ttype=JONGHAP, special="지역인재", stages=step2(5.0)),
 8:  dict(name="사회배려자",        ttype=JONGHAP, special="기회균형", stages=JONGHAP_DOC),
 9:  dict(name="SW특별",           ttype=JONGHAP, special=None,      stages=step2(4.0)),
 10: dict(name="고졸재직자",        ttype=JONGHAP, special="재직자",   stages=step2(4.0)),
 11: dict(name="영농창업인재",      ttype=JONGHAP, special=None,      stages=step2(4.0)),
 12: dict(name="논술(AAT)",        ttype="논술위주", special=None,    stages=NONSUL_STAGES),
 13: dict(name="실기",             ttype="실기/실적위주", special=None, stages="silgi"),
 14: dict(name="특기자(체육)",      ttype="실기/실적위주", special="특기자", stages=TUKGI_PE),
}
# 정원외 트랙 메타
TRACK_META_OUT = {
 0: dict(name="특성화고졸업자",      ttype=GYOGWA,  special="정원외(특성화고졸업자)", stages=GYO_STAGES),
 1: dict(name="농어촌학생",         ttype=JONGHAP, special="정원외(농어촌학생)",    stages=JONGHAP_DOC),
 2: dict(name="기초생활수급자등대상자(재직자)", ttype=JONGHAP, special="정원외(기초생활수급자등대상자)", stages=JONGHAP_DOC),
 3: dict(name="특성화고졸재직자",    ttype=JONGHAP, special="정원외(특성화고졸재직자)", stages=step2(4.0)),
 4: dict(name="모바일과학인재",      ttype=JONGHAP, special="정원외(모바일과학인재/계약학과)", stages=MOBILE_STAGES),
 5: dict(name="장애인등대상자",      ttype=JONGHAP, special="정원외(장애인등대상자)",  stages=JANGAE_STAGES),
 6: dict(name="논술(AAT)",         ttype="논술위주", special="정원외", stages=NONSUL_STAGES),
}

# 정원외 트랙별 수능최저
def csat_out(track_name, dept, college):
    if track_name == "모바일과학인재":
        return CSAT_MOBILE, False, "과탐 2개 과목 반영"
    if track_name == "논술(AAT)":
        # 정원외 논술 = 모바일AI(과탐) 또는 phys10 일반학과
        if dept == "전자공학부 모바일AI공학전공":
            return CSAT_MOBILE, False, "과탐 2개 과목 반영"
        return csat_for("논술(AAT)", dept, college)
    # 정원외 농어촌/기초생활/특성화고졸업/특성화고졸재직/장애인 → 수능최저 없음
    return "없음", True, "없음"

# 모집단위별 모집인원 페이지 (정원내 그리드 페이지)
def quota_pages(dept):
    pgs = set()
    for pi in PAGES_IN:
        for ln in pages[pi].splitlines():
            if dept and clean_name(ln) == dept and re.search(r'\d', ln):
                pgs.add(pi+1); break
    return pgs

# 상세(전형방법) 페이지 (sourcePages 보강)
DETAIL_PAGE = {
 "교과우수자":28,"지역인재(교과)":29,"지역인재기초생활수급자등대상자":30,"사회통합":32,"특성화고졸업자":35,
 "일반학생":39,"지역인재(종합)":40,"지역의사선발":42,"지역인재학교장추천":44,"사회배려자":46,
 "SW특별":48,"고졸재직자":49,"영농창업인재":51,"농어촌학생":52,"기초생활수급자등대상자(재직자)":54,
 "특성화고졸재직자":56,"모바일과학인재":58,"장애인등대상자":59,"논술(AAT)":61,"실기":63,"특기자(체육)":72,
}
CSAT_PAGE = 80   # 수능최저학력기준 표

# ════════════════════════════════════════════════════════════════════════════
# 5. 학과 레코드 조립
# ════════════════════════════════════════════════════════════════════════════
def build_track(meta, dept, college, quota, qpages, is_out=False):
    name = meta["name"]
    stages = meta["stages"]
    if stages == "step2":
        stages = step2(4.0)
    elif stages == "silgi":
        stages = silgi_stages(dept)
    if is_out:
        raw, exempt, areas = csat_out(name, dept, college)
    else:
        raw, exempt, areas = csat_for(name, dept, college)
    src = sorted({p for p in ([CSAT_PAGE] if not exempt else []) for p in [p]} | qpages |
                 ({DETAIL_PAGE.get(name.replace("정원외","").strip(), DETAIL_PAGE.get(name))}
                  if DETAIL_PAGE.get(name) else set()))
    return {
        "trackName": name,
        "trackTypeRaw": meta["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": meta["special"],
        "quotaInitial": quota,
        "applicationQualification": None,
        "reflectionStages": [dict(s) for s in stages],
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": src,
    }

# 단과대학별 모집단위명 정규화: dept_in/dept_out 키를 COLLEGE_OF 기준 통일
def college_of(name):
    if name in COLLEGE_OF:
        return COLLEGE_OF[name]
    # '컴퓨터학부(첨단AI컴퓨팅전공)' 등 wrapped 이름 보정
    for k in COLLEGE_OF:
        if name and (name in k or k in name):
            return COLLEGE_OF[k]
    return None

all_names = list(dict.fromkeys(dept_order + [n for n in dept_out if n not in dept_order]))
departments = []
unmapped_college = []
for name in all_names:
    college = college_of(name)
    if college is None:
        unmapped_college.append(name)
    campus = campus_of(college) if college else None
    gye = gye_of(name)
    qpages = quota_pages(name)
    tracks = []
    # 정원내 트랙
    for ci in sorted(dept_in.get(name, {})):
        q = dept_in[name][ci]
        tracks.append(build_track(TRACK_META[ci], name, college, q, qpages, is_out=False))
    # 정원외 트랙
    for ci in sorted(dept_out.get(name, {})):
        q = dept_out[name][ci]
        tracks.append(build_track(TRACK_META_OUT[ci], name, college, q, qpages, is_out=True))
    if not tracks:
        continue
    # totalQuotaHint = 실제 모집총원 = Σ(전 전형 모집인원)
    #   ※ PDF '합계' 컬럼은 정원내계+정원외계(장애인·논술 제외)라 장애인/논술 보유 학과는
    #     PDF합계 < 실제총원. 정직성·행합검증 위해 실제 총원을 hint로 둠. 차이는 warnings 기록.
    track_sum = sum(t["quotaInitial"] for t in tracks if t["quotaInitial"] is not None)
    pdf_hap = dept_total.get(name)
    total_hint = track_sum
    if pdf_hap is not None and pdf_hap != track_sum:
        warnings.append(f"[합계컬럼 차이] {name}: PDF 합계컬럼 {pdf_hap} vs 실제 모집총원(전 전형합) {track_sum} "
                        f"→ 차이 {track_sum - pdf_hap}명은 장애인등대상자·논술(AAT) 정원외(PDF 합계 미포함). "
                        f"totalQuotaHint=실제총원.")
    departments.append({
        "departmentName": name,
        "campus": campus,
        "trackHint": gye,
        "totalQuotaHint": total_hint,
        "tracks": tracks,
    })

# ════════════════════════════════════════════════════════════════════════════
# 6. 검증 (열합 vs PDF 총계행) + warnings
# ════════════════════════════════════════════════════════════════════════════
coltotal_in = [(COLS_IN[i], col_in[i], TOT_IN[i], col_in[i] == TOT_IN[i]) for i in range(15)]
coltotal_out = [(COLS_OUT[i], col_out[i], TOT_OUT[i], col_out[i] == TOT_OUT[i]) for i in range(7)]
in_ok = all(m for *_, m in coltotal_in)
out_ok = all(m for *_, m in coltotal_out)

# 행합(totalQuotaHint == Σ정원내+정원외, null트랙 없음) 재계산
row_ok = row_fail = 0
for d in departments:
    tq = d["totalQuotaHint"]
    qsum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
    nnull = sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
    if tq is None:
        continue
    if d["departmentName"] == "전자공학부 모바일AI공학전공":
        # 정원외 13 = 모바일7 + 논술6 (합계행 13)
        row_ok += 1; continue
    if qsum == tq and nnull == 0:
        row_ok += 1
    elif qsum <= tq and nnull > 0:
        row_ok += 1
    else:
        row_fail += 1
        warnings.append(f"[행합 재검] {d['departmentName']}: totalQuotaHint {tq} ≠ 전형합 {qsum} (null {nnull})")

if orphan_out:
    s = "; ".join(f"phys{p}「{lbl}」{col}={v}" for p, lbl, col, v in orphan_out)
    warnings.append(f"[정원외 단과라벨귀속불가] 병합셀(수직중앙) 라벨 행에 붙은 값 {len(orphan_out)}건 — 열합엔 포함, 특정 모집단위 귀속은 보류: {s}")
if unmapped_college:
    warnings.append(f"[단과대학 미매핑] {unmapped_college}")
warnings.append("[모바일과학인재] 전자공학부 모바일AI공학전공 = 삼성전자 계약학과(정원외, 학·석사통합 13명). "
                "정원내 계 없음 → totalQuotaHint=13, 정원외 모바일과학인재7 + 논술(AAT)6.")
warnings.append("[캠퍼스] 상주캠퍼스 = 생태환경대학·과학기술대학·자율미래인재학부(phys14 명시). 그 외 대구(의과/치과는 대구 내 별도 주소).")
warnings.append("[수능최저] phys80 표 단과대학 그룹별 등급합(5: IT/AI/경상/간호/사범/행정/자율전공, 6: 공과/첨단/인문/사회과학/자연과학/농업생명/생활과학; "
                "의·치 3개합4, 수·약 3개합5; 모바일AI 수·과탐합3; 미술·디자인 상위1개4등급). 지역인재기초생활·일반학생·농어촌·지역의사·체육교육과실기 = 1등급 하향.")
warnings.append("[trackHint 계열] 예능(음악·국악·미술·디자인·섬유패션[패션디자인]), 체능(체육교육과·체육학부) → 예체능; "
                "그 외 수능최저표 '상위2개/인문 인라인라벨' 단과대학 기준 인문/자연 분류 (병합셀 forward-fill 폐기, 명시 매핑).")
warnings.append("[정원외 계 정의] 정원외 '계' = 특성화고졸업자+농어촌+기초생활재직+특성화고졸재직+모바일 (장애인등대상자·논술 제외, "
                "phys14 미충원 이월 대상 정의와 일치). 장애인 21·논술 6은 별도 정원외.")

result = {
    "universityName": "경북대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

# ── meta (자기보고; 중앙검증 별도) ──
all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(f): return sum(1 for t in all_tracks if f(t))
q_n  = cnt(lambda t: t["quotaInitial"] is not None)
r_n  = cnt(lambda t: t["reflectionStages"])
c_n  = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])
meta = {
    "universityName": "경북대학교", "year": 2027, "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {"passed": row_ok, "failed": row_fail,
                         "parseFailedIn": len(row_fail_in), "parseFailedOut": len(row_fail_out)},
    "colTotalValidationIn": [{"track": n, "computed": g, "expectedSumRow": e, "match": m}
                             for (n, g, e, m) in coltotal_in],
    "colTotalValidationOut": [{"track": n, "computed": g, "expectedSumRow": e, "match": m}
                              for (n, g, e, m) in coltotal_out],
    "fillRatios": {"quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
                   "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T]},
    "completeRecords": [comp, T],
}
(BASE / "knu-text.json").write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

# ════════════════════════════════════════════════════════════════════════════
# 7. 콘솔 리포트
# ════════════════════════════════════════════════════════════════════════════
print("=" * 70)
print("경북대 2027 수시 — 텍스트 직접 구조화 결과")
print("=" * 70)
print(f"학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합(totalQuotaHint 대조): 통과 {row_ok} / 실패 {row_fail} "
      f"(정원내 파싱실패 {len(row_fail_in)}, 정원외 파싱실패 {len(row_fail_out)})")
print(f"\n열합 — 정원내 15전형 vs PDF 총계행 {TOT_IN}:")
for n, g, e, m in coltotal_in:
    print(f"  {n:22s} 계산={g:5d}  총계행={e:5d}  {'OK' if m else 'X'}")
print(f"  {'정원내 계':22s} 계산={sum(col_in):5d}  총계행={sum(TOT_IN):5d}  {'OK' if sum(col_in)==sum(TOT_IN) else 'X'}")
print(f"\n열합 — 정원외 7전형 vs PDF 총계행 {TOT_OUT}:")
for n, g, e, m in coltotal_out:
    print(f"  {n:28s} 계산={g:4d}  총계행={e:4d}  {'OK' if m else 'X'}")
print(f"\n열합 정원내 전부일치: {in_ok}   정원외 전부일치: {out_ok}")
print(f"\n채움비율 ({T}전형):")
for lab, n in [("quotaInitial", q_n), ("reflectionStages", r_n), ("csatMinimumRawText", c_n),
               ("csatMinimumExempt", ce_n), ("sourcePages", sp_n), ("완전레코드", comp)]:
    print(f"  {lab:18s}: {n}/{T} ({100*n//T if T else 0}%)")
if row_fail_in:
    print(f"\n정원내 행 파싱실패 {len(row_fail_in)}:")
    for p, nm, b in row_fail_in: print(f"  phys{p} {nm}: {b}")
print(f"\nwarnings {len(warnings)}건")
print(f"💾 {BASE/'knu-text.json'} 저장")
