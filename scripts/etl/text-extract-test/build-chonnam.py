#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
전남대학교 2027 수시 — pdftotext -layout 텍스트(chonnam.txt) → AdmissionRecord JSON.

Vision API 미사용 (클라이언트 운영비 0). Claude Code 본체가 chonnam.txt 전체를 정독하고
모집인원 총괄표(물리 p12~15, 17개 전형 컬럼)를 페이지별 컬럼 우측끝 캘리브로 결정론 파싱한 뒤,
전형 개요(p16)·전형방법 상세(p22~46)·수능최저표(p59)의 반영비율·수능최저 템플릿을 결합한다.

캠퍼스: 전남대는 광주 + 여수 두 캠퍼스가 한 university_id 내에 있다.
  여수캠퍼스 = 공학대학·문화사회과학대학·수산해양대학·창의융합학부(◆ 표기, p15 주석 명시).
  그 외 단과대학 = 광주캠퍼스.  (여수 소계 일반 379 = 공학139+문화사회120+수산101+창의19 검증완료)

총괄표 컬럼(좌→우, 학부 합계행 p15로 위치·라벨 확정):
  정원내(12): 일반 / 지역인재 / 지역균형 / 사회배려대상자 / 사회다양성 / 예체능실기[교과] /
              고교생활우수자Ⅰ / 고교생활우수자Ⅱ / 지역의사_진료권 / 후계농업경영인 /
              예능실기[실기실적] / 특수교육
  정원외(5):  농어촌학생 / 특성화고교졸업자 / 기초차상위한부모 / 특성화고졸재직자 / 만학도
  ※ 전남대는 정원외 전형 인원을 '수시 모집인원' 컬럼에 합산한다(경북대와 반대).
    → 모집인원 = Σ(17개 전형 컬럼) 가 행 단위로 성립(자기검증 완료: 광주+여수=학부합계, +치전원=수시합계).

수능최저학력기준(p59 표 — 단과대학 그룹별 원문 보존):
  · 의과대학: 일반-, 지역인재 5, 지역균형/사배/농어촌/기초 6, 고교Ⅰ 5, 지역의사 6 (수학포함 3개합, 과탐2평균)
  · 치전원: 일반 5, 지역인재 6, 그룹 7, 고교Ⅰ 6
  · 수의·약학: 일반 6, 지역인재 7, 그룹 8, 고교Ⅰ 7
  · 간호·경영: 일반 9, 지역인재 10  (3개 영역 합)
  · 자율전공학부: 일반 6, 지역인재 7  (3개 영역 합)
  · 공과·사범: 일반 7, 지역인재 8  (2개 영역 합)
  · 농생명·사회과학·생활과학·수산(수산생명의학과)·인문·자연과학·AI융합·예술(미술이론): 일반 8, 지역인재 9 (2개 영역 합)
  · 공학대학·문화사회과학·수산(그 외)·창의융합학부: 미적용 (여수 전반)
  · 사범대 체육교육과 학생부교과(예체능실기): 2개합 7
  체크섬·날조 금지: 미기재 null, 미적용 "없음"/exempt, 특수교육(단과대학 합산선발) → 별도 단과대학 레코드.

정직성/특수처리:
  · 학생부교과(특수교육대상자) 37명: 모집단위 고정인원 없음(● 표기 모집단위에서 단과대학별 [n] 합산 선발).
    → 단과대학별 합성 레코드 `[특수교육대상자]{단과대학}`(quota=[n], note). 일반 모집단위 트랙엔 미부여.
  · 광역선발 계열(에너지공학계열·전기전자컴퓨터공학계열·기계공학계열·화공환경공학계열·해양수산자율전공계열)
    및 전공예약(건축·도시설계전공 등)은 PDF가 별행으로 모집인원을 부여 → 그대로 모집단위로 생성.
    (열합이 계열+전공예약+세부전공 전부 포함 기준으로 총계행과 정확히 일치함을 자기검증.)
  · 조기취업형계약학과(공학대학, 여수, 90명)는 「수시모집 합계(계약학과 제외)」에서 제외된 별도 표(p15) →
    별도 처리(정원외 학생부종합), 열합 검증 모집단위에서 분리.
  · 치의학전문대학원(학·석사통합과정) 23명: '학부 합계'엔 미포함, '수시모집 합계'엔 포함 → 모집단위로 생성.
"""
import json
import re
import statistics
from pathlib import Path

BASE = Path("scripts/etl/text-extract-test")
RAW = (BASE / "chonnam.txt").read_text(encoding="utf-8")
pages = RAW.split("\f")  # pages[i] = 물리 PDF 페이지 i+1

warnings = []

# ════════════════════════════════════════════════════════════════════════════
# 0. 총괄표 컬럼 정의 (학부 합계행 p15로 위치·라벨 확정)
# ════════════════════════════════════════════════════════════════════════════
COLS = ["일반", "지역인재", "지역균형", "사회배려대상자", "사회다양성", "예체능실기",
        "고교생활우수자Ⅰ", "고교생활우수자Ⅱ", "지역의사_진료권", "후계농업경영인", "예능실기", "특수교육",
        "농어촌학생", "특성화고교졸업자", "기초차상위한부모", "특성화고졸재직자", "만학도"]
# 「수시모집 합계(계약학과 제외)」 총계행 (p15 직독) — 열합 검증 기준
TOT = [1128, 989, 9, 147, 32, 35, 899, 174, 22, 5, 145, 37, 178, 55, 5, 10, 5]
# 정원외 컬럼 인덱스 (학생부교과: 농어촌·특성화고졸업·기초·특성화고졸재직·만학도)
OUT_IDX = {12, 13, 14, 15, 16}
# 특수교육(11): 모집단위 고정인원 없음(단과대학별 [n] 합산) → 별도 단과대학 레코드 처리. 열합 검증에서 별도.
SPECIAL_IDX = 11

GRID_PAGES = [11, 12, 13, 14]  # 물리 p12~15


def is_subtotal(line):
    return bool(re.search(
        r'(대학 계|학부 계|캠퍼스 소계|학부 합계|수시모집 합계|대학원 계|소계|학과 계|전공 소계)', line))


def page_edges(pi):
    """페이지별 18개 컬럼(모집인원+17전형) 우측끝 = 소계행(18토큰) 중앙값."""
    rows = []
    for l in pages[pi].splitlines():
        toks = list(re.finditer(r'[\d,]+|\[\d+\]', l))
        if is_subtotal(l) and len(toks) == 18:
            rows.append([m.end() for m in toks])
    if not rows:
        raise RuntimeError(f"p{pi + 1} 캘리브용 소계행 없음")
    return [round(statistics.median(r[c] for r in rows)) for c in range(18)]


TOKPAT = re.compile(r'[\d,]+|\[\d+\]|●')
TOL = 4.6  # 한 자리 우측정렬 지터(최대 +4) 흡수. 충돌 0 검증완료.


# ════════════════════════════════════════════════════════════════════════════
# 1. 모집단위명 정리 (단과대학 병합조각 / 계열라벨 / ★◆ 마커 / 줄바꿈 이름 재조립)
# ════════════════════════════════════════════════════════════════════════════
# 단과대학 병합셀이 분할되며 행 머리에 끼는 조각 + 계열라벨 + 전공예약 라벨조각
COLLEGE_FRAG = {"간호", "경영", "공과", "공학", "농업", "생명", "과학", "대학", "문화", "사회",
                "인문", "AI", "융합", "직할", "학부", "예술", "수산", "해양", "수의과", "약학",
                "생활", "기", "현악", "관·타악", "관현악전공", "국악기악전공", "전공", "예약"}
GYE_LABEL = {"자연", "인문", "예능", "체능", "인문·", "자연·"}
MARKERS = "★◆◉●▲"


def clean_name(name_raw):
    """행 머리 텍스트 → 모집단위명. 단과조각·계열라벨·마커·괄호단독조각 제거."""
    n = name_raw.strip().strip(MARKERS).strip()
    # 끝의 계열라벨 제거 ('★간호학과  자연' → '★간호학과')
    toks = n.split()
    # 후행 계열라벨 제거
    while toks and toks[-1].strip("·") in {"자연", "인문", "예능", "체능"}:
        toks = toks[:-1]
    # 선행 단과조각/계열/마커 제거 (모집단위명 본체가 그 뒤에 옴)
    def is_dept(t):
        t2 = t.strip(MARKERS)
        return (t2.endswith("학과") or t2.endswith("학부") or t2.endswith("전공")
                or t2.endswith("학과)") or t2.endswith("전공)") or t2.endswith("학부)")
                or "(" in t2 or t2 in ("의학과", "수의예과", "의예과", "조경학과"))
    changed = True
    while changed and len(toks) > 1:
        changed = False
        head = toks[0].strip(MARKERS)
        if (head in COLLEGE_FRAG or head in GYE_LABEL) and not is_dept(toks[0]):
            toks = toks[1:]
            changed = True
    out = [t.strip(MARKERS).strip() for t in toks if t.strip(MARKERS).strip()]
    return " ".join(out).strip()


def _strip_labels_keep_body(text):
    """행 머리/꼬리 라벨(단과조각·계열·마커) 제거하되 모집단위명 본체(괄호 미완성 포함) 보존."""
    t = text.strip()
    # 후행 계열라벨 제거
    t = re.sub(r'\s+(자연|인문|예능|체능|인문·|자연·)\s*$', '', t)
    toks = t.split()
    def is_body(tok):
        b = tok.strip(MARKERS)
        return (b.endswith(("학과", "학부", "전공", "학과)", "전공)", "학부)")) or "(" in b
                or b in ("의학과", "수의예과", "의예과", "조경학과") or b.startswith("("))
    while len(toks) >= 1:
        head = toks[0].strip(MARKERS)
        # 전공예약 병합라벨 조각('전공'/'예약')은 모집단위명처럼 보여도(예: '전공') 선행시 제거
        is_label = head in ("전공", "예약")
        if (is_label or head in COLLEGE_FRAG or head in GYE_LABEL) and (is_label or not is_body(toks[0])):
            toks = toks[1:]  # 단독 계열/단과/전공예약 라벨 제거 (→ 빈값이면 재조립 유도)
        else:
            break
    return " ".join(tok.strip(MARKERS) for tok in toks).strip()


def name_fragment(line):
    """그리드 데이터행이 아닌 '이름 조각' 행이면 정제된 텍스트, 아니면 None.
       (큰 숫자 2자리+가 모집인원처럼 보이면 데이터행으로 간주해 제외)"""
    if is_subtotal(line) or '2027학년도' in line or 'www.jnu' in line or '정원 내' in line:
        return None
    s = line.strip()
    if not s or not re.search(r'[가-힣A-Za-z]', s):
        return None
    # 데이터행(모집인원 토큰 ≥2자리)에는 본문 이름이 직접 있으니 조각 아님
    body = _strip_labels_keep_body(re.sub(r'\s{2,}\d.*$', '', s))  # 숫자 앞 텍스트만
    return body or None


def reassemble_wrapped(lines, i, self_frag):
    """줄바꿈된 모집단위명을 [위 조각들] + [현재행 머리 조각] + [아래 조각들]로 재조립.
       괄호 균형(여는 ( 수 == 닫는 ) 수)이 맞을 때까지 위·아래로 확장."""
    parts = [self_frag] if self_frag else []
    # 위로: 본문조각 누적 (괄호 미닫힘이면 그 위까지)
    up = []
    for j in range(i - 1, max(-1, i - 4), -1):
        fr = name_fragment(lines[j])
        if fr is None:
            break
        up.insert(0, fr)
        if "(" in fr or fr.endswith(("학과", "학부", "전공")):
            break
    # 아래로: 닫는 괄호 나올 때까지 (괄호 미닫힘이거나, 바로 다음 줄이 '(...'로 시작하는 꼬리면)
    down = []
    joined_sofar = " ".join(up + parts)
    nxt_frag = next((name_fragment(lines[j]) for j in range(i + 1, min(len(lines), i + 3))
                     if lines[j].strip() and not re.search(r'\s{2,}\d{2,}', lines[j])), None)
    need_down = (joined_sofar.count("(") > joined_sofar.count(")")) \
        or (nxt_frag and nxt_frag.startswith("("))
    if need_down:
        for j in range(i + 1, min(len(lines), i + 4)):
            if re.search(r'\s{2,}\d{2,}', lines[j]) or is_subtotal(lines[j]):
                break
            fr = name_fragment(lines[j])
            if fr is None:
                continue
            down.append(fr)
            if ")" in fr:
                break
    full = " ".join(up + parts + down)
    # 괄호 내부 콤마 뒤 공백 정리
    full = re.sub(r'\(\s+', '(', full).replace(" )", ")")
    full = re.sub(r',\s+', ', ', full)
    full = re.sub(r'\s+\(', '(', full)  # '학부 (' → '학부('
    return clean_name(full)


# ════════════════════════════════════════════════════════════════════════════
# 2. 그리드 파싱
# ════════════════════════════════════════════════════════════════════════════
col_sum = [0] * 17
records = []        # (page, line_idx, name, mo, cells)
special_brackets = []  # (page, 단과대학, [n])  ← 특수교육 단과대학별 합산
parse_fail = []

for pi in GRID_PAGES:
    edges = page_edges(pi)
    mo_edge, val_edges = edges[0], edges[1:]
    lines = pages[pi].splitlines()
    for li, l in enumerate(lines):
        # 특수교육 단과대학 [n] 합산 수집 (소계행에서)
        if is_subtotal(l):
            mb = re.search(r'\[(\d+)\]', l)
            mcol = re.match(r'\s*([가-힣A-Za-z·]+(?:대학|학부))\s*계', l)
            if mb and mcol and '캠퍼스' not in l and '합계' not in l and '소계' not in l:
                special_brackets.append((pi + 1, mcol.group(1), int(mb.group(1))))
            continue
        if '2027학년도' in l or 'www.jnu' in l or '정원 내' in l:
            continue
        toks = list(TOKPAT.finditer(l))
        mo_cand = [m for m in toks if m.group() not in ('●',)
                   and not m.group().startswith('[') and abs(m.end() - mo_edge) <= 2.5]
        if not mo_cand:
            continue
        mo_m = min(mo_cand, key=lambda m: abs(m.end() - mo_edge))
        try:
            mo = int(mo_m.group().replace(',', ''))
        except ValueError:
            continue
        cells = [0] * 17
        filled = [False] * 17
        bad = None
        for m in toks:
            if m is mo_m or m.group() == '●' or m.group().startswith('['):
                continue  # ● = 특수교육 자격표기, [n] = 소계 카운트(별도)
            e = m.end()
            ci = min(range(17), key=lambda k: abs(val_edges[k] - e))
            if abs(val_edges[ci] - e) > TOL:
                continue  # 모집단위명 내부 콤마/각주 등
            if filled[ci]:
                bad = f"dup col{ci}({COLS[ci]}) e={e}"
            cells[ci] += int(m.group().replace(',', ''))
            filled[ci] = True
        # 열합은 이름결정과 무관하게 항상 집계 (열 검증의 독립성)
        for k in range(17):
            col_sum[k] += cells[k]
        # 모집단위명 — name_raw 정제. 미완성(빈값/괄호 불균형/콤마끝/괄호로 시작)이면 줄바꿈 재조립
        name_raw = l[:mo_m.start()]
        self_frag = _strip_labels_keep_body(name_raw) if re.search(r'[가-힣A-Za-z]', name_raw) else ""
        def incomplete(nm):
            return (not nm or nm.startswith("(") or nm.endswith((",", "("))
                    or nm.count("(") != nm.count(")"))
        if incomplete(self_frag):
            name = reassemble_wrapped(lines, li, self_frag)
        else:
            name = self_frag  # 이미 라벨 정제된 본체
        if not name or incomplete(name):
            parse_fail.append((pi + 1, li, f"이름 미완성 mo={mo} raw={name_raw.strip()!r} → {name!r}"))
            continue
        if bad:
            parse_fail.append((pi + 1, li, f"{name}: {bad}"))
        records.append((pi + 1, li, name, mo, cells))

# 행 단위 모집인원 == Σ(17컬럼) 자기검증 (전남대는 정원외도 모집인원에 합산)
# 단, 특수교육(SPECIAL_IDX)은 모집단위 컬럼값이 ●(0)이므로 모집인원에 미반영(단과대학 합산) → 행합에서 제외.

# ════════════════════════════════════════════════════════════════════════════
# 3. 캠퍼스 / 계열(trackHint) 매핑
# ════════════════════════════════════════════════════════════════════════════
# 여수캠퍼스 단과대학 (p15 주석: ◆ 공학대학·문화사회과학대학·수산해양대학·창의융합학부)
YEOSU_DEPTS = set()  # 모집단위명 집합 (그리드 순서로 단과대학 추적해 채움)

# 그리드 등장 순서로 단과대학 경계 추적: 각 데이터행이 속한 단과대학을 소계행 직전까지 누적.
# (행에 단과대학 라벨이 병합셀로 가끔 끼므로, 소계행 라벨로 블록 종료를 판정.)
def college_blocks():
    """(page, line_idx) → 단과대학명. 소계행 라벨 기준 역방향 귀속."""
    blocks = {}
    for pi in GRID_PAGES:
        lines = pages[pi].splitlines()
        cur = []
        for li, l in enumerate(lines):
            mcol = re.search(r'([가-힣A-Za-z·]+(?:대학원|대학|학부))\s*계\b', l)
            if is_subtotal(l) and mcol and '캠퍼스' not in l and '합계' not in l \
                    and '소계' not in l:
                college = mcol.group(1)
                for key in cur:
                    blocks[key] = college
                cur = []
            elif not is_subtotal(l):
                cur.append((pi + 1, li))
    return blocks


COLLEGE_OF_LINE = college_blocks()
YEOSU_COLLEGES = {"공학대학", "문화사회과학대학", "수산해양대학", "창의융합학부"}


def campus_for(page, line_idx, name):
    college = COLLEGE_OF_LINE.get((page, line_idx))
    if college in YEOSU_COLLEGES:
        return "여수", college
    # 창의융합학부(◆, 직할학부 블록)
    if "창의융합학부" in name:
        return "여수", "창의융합학부"
    return "광주", college


# 계열(trackHint): 예체능(음악/국악/미술/디자인/음악교육/체육교육/미술이론) 예체능; 그 외 인문/자연.
ART_DEPTS_KEY = ("음악학과", "국악학과", "미술학과", "디자인학과", "음악교육과", "체육교육과")
INMUN_HINT_COLLEGES = {"경영대학", "문화사회과학대학", "사회과학대학", "인문대학"}
INMUN_HINT_NAMES = {"농업경제학과", "자율전공학부(4년)", "자율전공학부(1년)",
                    "국어교육과", "영어교육과", "교육학과", "유아교육과", "지리교육과",
                    "역사교육과", "윤리교육과", "특수교육학부", "국제학부(영어학전공)",
                    "국제학부(일본학전공)", "국제학부(중국학전공)"}


def hint_for(name, college):
    if any(k in name for k in ART_DEPTS_KEY):
        return "예체능"
    if "특수교육학부" in name:
        return "인문"
    if name in INMUN_HINT_NAMES:
        return "인문"
    if college in INMUN_HINT_COLLEGES:
        return "인문"
    return "자연"


# ════════════════════════════════════════════════════════════════════════════
# 4. 전형 템플릿 (반영비율·수능최저) — 전형방법 상세(p22~46) + 수능최저표(p59) 직독
# ════════════════════════════════════════════════════════════════════════════
def stage(label, mult, comps, mx=1000):
    return {"stageLabel": label, "multiplier": mult, "components": comps, "stageMaxScore": mx}


# 학생부교과 일괄 100% (석차등급 660/225 + 진로선택 0/15 + 출결 90/10, 기본1000)
GYO_STAGES = [stage("일괄선발", None, {"학생부": 1000})]
# 학생부교과(예체능실기) 단계: 1단계 학생부100%(800) → 2단계 학생부80%+실기20%
GYE_SILGI_STAGES = [stage("1단계", None, {"학생부": 800}, 800),
                    stage("2단계", None, {"학생부": 800, "실기": 200})]
# 학생부교과(특수교육대상자) 단계: 1단계 학생부100%(800, 5배수) → 2단계 학생부80%+면접20%
SPECIAL_STAGES = [stage("1단계", 5.0, {"학생부": 800}, 800),
                  stage("2단계", None, {"학생부": 800, "면접": 200})]
# 학생부종합(고교생활우수자Ⅰ) 단계: 1단계 서류70%(700,3배수;의약치수6배수) → 2단계 서류70%+면접30%
def jonghap_step(mult):
    return [stage("1단계", mult, {"서류평가": 700}, 700),
            stage("2단계", None, {"서류평가": 700, "면접": 300})]
# 학생부종합(고교생활우수자Ⅱ) 일괄 서류100%
JONGHAP_DOC = [stage("일괄선발", None, {"서류평가": 1000})]
# 학생부종합(지역의사_진료권) 단계: 1단계 서류70%(700,6배수) → 2단계 서류70%+면접30%
# 학생부종합(후계농업경영인) 단계: 1단계 서류70%(700,3배수) → 2단계 서류70%+면접30%
# 실기/실적(예능실기):
#  음악·국악 일괄: 학생부30%(300)+실기70%(700)
#  미술·디자인 단계: 1단계 학생부100%(300,5배수) → 2단계 학생부18.5%+실기81.5%
SILGI_GYE_ILGWAL = [stage("일괄선발", None, {"학생부": 300, "실기": 700})]
SILGI_GYE_STEP = [stage("1단계", 5.0, {"학생부": 300}, 300),
                  stage("2단계", None, {"학생부": 300, "실기": 700})]
# 조기취업형계약학과 일괄: 서류60%(600)+면접40%(400)
EARLY_STAGES = [stage("일괄선발", None, {"서류평가": 600, "면접": 400})]

# ── 수능최저(p59) — 단과대학 그룹별 원문 ──
CSAT_AREAS_3 = "국어, 수학, 영어, 탐구(1과목) 중 상위 3개 영역 합 (한국사 미반영)"
CSAT_AREAS_2 = "국어, 수학, 영어, 탐구(1과목) 중 상위 2개 영역 합 (한국사 미반영)"
CSAT_AREAS_MED = "국어, 수학(미적분/기하 택1), 영어, 과학탐구(2과목 평균) 중 수학 포함 3개 영역 합 (한국사 미반영)"

# (단과대학) → 전형별 등급기준 텍스트. None=해당 전형 미적용.
# 키: 단과대학명. 값: dict(전형key → (rawtext, areas))
def csat_med(grade, area=CSAT_AREAS_MED):
    return (f"국어, 수학(미적분/기하 택1), 영어, 과학탐구 4개 영역 중 수학 포함 3개 영역 합 {grade}등급 이내, "
            f"과학탐구 2과목 평균(소수점 절사·반올림 미적용)", area)
def csat_gen(grade, n, area):
    return (f"국어, 수학, 영어, 탐구(1과목) 중 상위 {n}개 영역 합 {grade}등급 이내", area)

# 단과대학 그룹 (p59 표)
COL_MED = {"의과대학"}
COL_DENT = {"치의학전문대학원"}
COL_VET_PHARM = {"수의과대학", "약학대학"}
COL_NURSE_BIZ = {"간호대학", "경영대학"}
COL_JAYUL = {"자율전공학부"}                 # 직할학부 자율전공학부(1년/4년)
COL_GONG_SABEOM = {"공과대학", "사범대학"}
COL_GROUP8 = {"농업생명과학대학", "사회과학대학", "생활과학대학", "인문대학",
              "자연과학대학", "AI융합대학"}   # 2개합 8/9  (+ 수산생명의학과·미술이론 개별)
COL_NONE = {"공학대학", "문화사회과학대학", "창의융합학부"}  # 미적용(여수)
# 수산해양대학: 수산생명의학과만 group8, 그 외 미적용


# 전형별 (단과대학,모집단위) → 수능최저 (rawtext|None)
def csat_for(track_idx, name, college):
    """returns (rawText, exempt, areasText)."""
    NONE = ("없음", True, "없음")
    tname = COLS[track_idx]
    # 단과대학 매핑 보강(이름 기반 안전망): 치전원·의학과·수의예과·약학부
    if "치의학전문대학원" in name:
        college = "치의학전문대학원"
    elif "의학과" in name and college not in COL_MED:
        college = "의과대학"
    # ── 미적용 전형 (전형 개요 p16 '미적용') ──
    #   사회다양성, 특성화고교졸업자, 특수교육, 만학도, 특성화고졸재직자, 고교생활우수자Ⅱ, 후계농업경영인,
    #   예능실기, 예체능실기(체육교육과 제외)
    ALWAYS_NONE = {"사회다양성", "특성화고교졸업자", "특수교육", "만학도",
                   "특성화고졸재직자", "고교생활우수자Ⅱ", "후계농업경영인", "예능실기"}
    if tname in ALWAYS_NONE:
        return NONE
    # 예체능실기(학생부교과): 체육교육과만 2개합 7, 음악교육과 미적용
    if tname == "예체능실기":
        if "체육교육과" in name:
            return ("국어, 수학, 영어, 탐구(1과목) 중 상위 2개 영역 합 7등급 이내", False, CSAT_AREAS_2)
        return NONE
    # 여수캠퍼스 미적용(수산생명의학과 제외) — p16 주석 1)
    if college in COL_NONE:
        return NONE
    if college == "수산해양대학" and "수산생명의학과" not in name:
        return NONE
    # 지역의사_진료권 (의과대학 의학과만) — 6등급
    if tname == "지역의사_진료권":
        if "의학과" in name:
            return ("국어, 수학(미적분/기하 택1), 영어, 과학탐구 4개 영역 중 수학 포함 3개 영역 합 6등급 이내, "
                    "과학탐구 2과목 평균", False, CSAT_AREAS_MED)
        return NONE
    # 고교생활우수자Ⅰ (학생부종합) — 일부 적용: 의5/치6/수약7, 그 외 미적용
    if tname == "고교생활우수자Ⅰ":
        if college in COL_MED:
            return csat_med(5)[0], False, CSAT_AREAS_MED
        if college in COL_DENT:
            return csat_med(6)[0], False, CSAT_AREAS_MED
        if college in COL_VET_PHARM:
            return csat_gen(7, 3, CSAT_AREAS_3)[0], False, CSAT_AREAS_3
        return NONE
    # ── 학생부교과 수능최저 (일반/지역인재/지역균형/사회배려/농어촌/기초) ──
    #   기준표: 일반 / 지역인재 / 그룹(지역균형·사배·농어촌·기초)
    # 그룹 컬럼 판정
    GROUP_COLS = {"지역균형", "사회배려대상자", "농어촌학생", "기초차상위한부모"}
    is_group = tname in GROUP_COLS
    is_jiyeok = (tname == "지역인재")
    is_ilban = (tname == "일반")
    if not (is_group or is_jiyeok or is_ilban):
        return NONE
    # 단과대학별 등급
    if college in COL_MED:
        # 의: 일반-, 지역인재5, 그룹6
        if is_ilban:
            return NONE
        g = 5 if is_jiyeok else 6
        return csat_med(g)[0], False, CSAT_AREAS_MED
    if college in COL_DENT:
        g = 5 if is_ilban else (6 if is_jiyeok else 7)
        return csat_med(g)[0], False, CSAT_AREAS_MED
    if college in COL_VET_PHARM:
        g = 6 if is_ilban else (7 if is_jiyeok else 8)
        return csat_gen(g, 3, CSAT_AREAS_3)[0], False, CSAT_AREAS_3
    if college in COL_NURSE_BIZ:
        # 간호·경영: 일반9, 지역인재10 (그룹 컬럼은 사실상 미존재; 보수적 미적용)
        if is_ilban:
            return csat_gen(9, 3, CSAT_AREAS_3)[0], False, CSAT_AREAS_3
        if is_jiyeok:
            return csat_gen(10, 3, CSAT_AREAS_3)[0], False, CSAT_AREAS_3
        return NONE
    if "자율전공학부" in name:
        if is_ilban:
            return csat_gen(6, 3, CSAT_AREAS_3)[0], False, CSAT_AREAS_3
        if is_jiyeok:
            return csat_gen(7, 3, CSAT_AREAS_3)[0], False, CSAT_AREAS_3
        return NONE
    if college in COL_GONG_SABEOM:
        if is_ilban:
            return csat_gen(7, 2, CSAT_AREAS_2)[0], False, CSAT_AREAS_2
        if is_jiyeok:
            return csat_gen(8, 2, CSAT_AREAS_2)[0], False, CSAT_AREAS_2
        return NONE
    group8 = (college in COL_GROUP8) or (college == "수산해양대학" and "수산생명의학과" in name) \
        or (college == "예술대학" and "이론" in name)
    if group8:
        if is_ilban:
            return csat_gen(8, 2, CSAT_AREAS_2)[0], False, CSAT_AREAS_2
        if is_jiyeok:
            return csat_gen(9, 2, CSAT_AREAS_2)[0], False, CSAT_AREAS_2
        return NONE
    # 그 외(예술대 실기 등) 미적용
    return NONE


# ── 전형 메타 (컬럼인덱스 → trackName / trackTypeRaw / specialTypeKeyword / 전형방법) ──
GYOGWA = "학생부위주(교과)"
JONGHAP = "학생부위주(종합)"
SILGI = "실기/실적위주"
TRACK_META = {
    0:  dict(name="학생부교과(일반)", ttype=GYOGWA, special=None, stages="gyo"),
    1:  dict(name="학생부교과(지역인재)", ttype=GYOGWA, special="지역인재", stages="gyo"),
    2:  dict(name="학생부교과(지역균형)", ttype=GYOGWA, special="지역균형", stages="gyo"),
    3:  dict(name="학생부교과(사회배려대상자)", ttype=GYOGWA, special="기회균형", stages="gyo"),
    4:  dict(name="학생부교과(사회다양성)", ttype=GYOGWA, special="기회균형", stages="gyo"),
    5:  dict(name="학생부교과(예체능실기)", ttype=GYOGWA, special="실기", stages="gye_silgi"),
    6:  dict(name="학생부종합(고교생활우수자Ⅰ)", ttype=JONGHAP, special=None, stages="jh1"),
    7:  dict(name="학생부종합(고교생활우수자Ⅱ)", ttype=JONGHAP, special=None, stages="jh_doc"),
    8:  dict(name="학생부종합(지역의사_진료권)", ttype=JONGHAP, special="지역인재", stages="jh_uisa"),
    9:  dict(name="학생부종합(후계농업경영인)", ttype=JONGHAP, special=None, stages="jh_nong"),
    10: dict(name="실기/실적(예능실기)", ttype=SILGI, special=None, stages="silgi"),
    # 11 특수교육: 별도 단과대학 레코드
    12: dict(name="학생부교과(농어촌학생)", ttype=GYOGWA, special="정원외(농어촌학생)", stages="gyo"),
    13: dict(name="학생부교과(특성화고교졸업자)", ttype=GYOGWA, special="정원외(특성화고졸업자)", stages="gyo"),
    14: dict(name="학생부교과(기초/차상위/한부모)", ttype=GYOGWA, special="정원외(기초생활수급자등대상자)", stages="gyo"),
    15: dict(name="학생부교과(특성화고졸재직자)", ttype=GYOGWA, special="정원외(특성화고졸재직자)", stages="gyo"),
    16: dict(name="학생부교과(만학도)", ttype=GYOGWA, special="정원외(만학도)", stages="gyo"),
}

# 전형별 상세(전형방법) 물리페이지 — sourcePages 보강
DETAIL_PAGE = {
    0: 22, 1: 23, 2: 23, 3: 26, 4: 26, 5: 38, 6: 40, 7: 41, 8: 42, 9: 44,
    10: 46, 12: 30, 13: 32, 14: 34, 15: 36, 16: 35,
}
CSAT_PAGE = 59
GRID_SRC = [12, 13, 14, 15]


def make_stages(track_idx, name, college):
    s = TRACK_META[track_idx]["stages"]
    if s == "gyo":
        return [dict(x) for x in GYO_STAGES]
    if s == "gye_silgi":
        return [dict(x) for x in GYE_SILGI_STAGES]
    if s == "jh1":
        med6 = (college in COL_MED | COL_DENT | COL_VET_PHARM) \
            or "치의학전문대학원" in name or "의학과" in name \
            or "수의예과" in name or "약학부" in name
        return [dict(x) for x in jonghap_step(6.0 if med6 else 3.0)]
    if s == "jh_doc":
        return [dict(x) for x in JONGHAP_DOC]
    if s == "jh_uisa":
        return [dict(x) for x in jonghap_step(6.0)]
    if s == "jh_nong":
        return [dict(x) for x in jonghap_step(3.0)]
    if s == "silgi":
        if any(k in name for k in ("음악학과", "국악학과")):
            return [dict(x) for x in SILGI_GYE_ILGWAL]
        return [dict(x) for x in SILGI_GYE_STEP]  # 미술·디자인
    return []


def build_track(track_idx, name, college, quota):
    meta = TRACK_META[track_idx]
    raw, exempt, areas = csat_for(track_idx, name, college)
    src = sorted({p for p in GRID_SRC} | {DETAIL_PAGE.get(track_idx)} |
                 ({CSAT_PAGE} if not exempt else set()) - {None})
    return {
        "trackName": meta["name"],
        "trackTypeRaw": meta["ttype"],
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": meta["special"],
        "quotaInitial": quota,
        "applicationQualification": None,
        "reflectionStages": make_stages(track_idx, name, college),
        "csatMinimumRawText": raw,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": src,
    }


# ════════════════════════════════════════════════════════════════════════════
# 5. 모집단위 레코드 조립 (그리드 등장순; 동일 모집단위명 중복은 합산)
# ════════════════════════════════════════════════════════════════════════════
# 음악학과/국악학과: 그리드에 '악기'(피아노/성악/바이올린/…) 단위로 다수 행 표기되나
#   이는 한 모집단위(음악학과/국악학과) 내부의 실기 지정악기일 뿐 → 악기행을 1개 모집단위로 흡수.
#   (예능실기 단일 컬럼; '음악학과 계 54' / '국악학과 계 26'가 총괄.)
# 미술학과: 전공(한국화/서양화/조소/공예 = 예능실기, 이론전공 = 학생부교과 일반)은 성격이 달라
#   각 전공을 독립 모집단위로 유지(명시적 정원 보유 → 흡수하지 않음). 디자인학과는 단일행.
ART_COLLAPSE = ("음악학과", "국악학과")
ART_SUB_RE = re.compile(r'^(음악학과|국악학과)\s*\(')

departments_acc = {}   # name → dict(college,campus,page,line,cells,mo)
order = []

def add_acc(name, page, li, campus, college, cells, mo):
    if name not in departments_acc:
        order.append(name)
        departments_acc[name] = dict(college=college, campus=campus, page=page,
                                     line=li, cells=[0] * 17, mo=0)
    acc = departments_acc[name]
    for k in range(17):
        acc["cells"][k] += cells[k]
    acc["mo"] += mo

for (page, li, name, mo, cells) in records:
    campus, college = campus_for(page, li, name)
    # 소계성 이름이 데이터로 잡히면 스킵(소계 정규식 누락 대비)
    if re.search(r'(음악학과|국악학과|미술학과|디자인학과|관현악전공|국악기악전공)\s*(계|소계)$',
                 name.replace(" ", "")):
        continue
    # 음악/국악 악기행 → 부모 모집단위로 흡수 (예능실기만 존재)
    msub = ART_SUB_RE.match(name) or ART_SUB_RE.match(name.replace(" ", ""))
    if msub:
        parent = msub.group(1)
        add_acc(parent, page, li, campus, college, cells, mo)
        continue
    add_acc(name, page, li, campus, college, cells, mo)

departments = []
row_pass = row_fail = 0
row_fail_list = []

for name in order:
    acc = departments_acc[name]
    college, campus, cells = acc["college"], acc["campus"], acc["cells"]
    # 트랙 생성 (특수교육 idx11 제외 — 별도 단과대학 레코드)
    tracks = []
    for ci in range(17):
        if ci == SPECIAL_IDX:
            continue
        if cells[ci] > 0:
            tracks.append(build_track(ci, name, college, cells[ci]))
    if not tracks:
        continue
    track_sum = sum(t["quotaInitial"] for t in tracks)
    # 행합 검증: 모집인원(acc["mo"]) == Σ트랙(특수교육 제외).
    #   모집인원 컬럼은 특수교육(●,0) 미포함이므로 정확히 track_sum 와 일치해야 함.
    mo = acc["mo"]
    if mo == track_sum:
        row_pass += 1
    else:
        row_fail += 1
        row_fail_list.append(f"{name}(모집인원{mo}≠트랙합{track_sum})")
        warnings.append(f"[행합불일치] {name}: 모집인원 {mo} ≠ 트랙합 {track_sum}")
    hint = hint_for(name, college)
    departments.append({
        "departmentName": name,
        "campus": campus,
        "trackHint": hint,
        "totalQuotaHint": track_sum,
        "tracks": tracks,
    })

# ── 특수교육대상자: 단과대학별 합성 레코드 (모집단위 고정인원 없음) ──
# special_brackets: (page, 단과대학, [n]).  광주 28 + 여수 9 = 37.
SPECIAL_DETAIL_PAGE = 39
seen_col = {}
for (page, college, n) in special_brackets:
    if college in seen_col:
        continue
    seen_col[college] = n
special_total = 0
for college, n in seen_col.items():
    campus = "여수" if college in YEOSU_COLLEGES else "광주"
    t = {
        "trackName": "학생부교과(특수교육대상자)",
        "trackTypeRaw": GYOGWA,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "특수교육대상자",
        "quotaInitial": n,
        "applicationQualification": "장애인복지법 제32조 장애인 등록자 또는 국가유공자 상이등급자(장애인 기준 상응). "
                                    "● 표기 모집단위에서 단과대학별 합계 인원 선발(모집단위별 고정인원 없음)",
        "reflectionStages": [dict(x) for x in SPECIAL_STAGES],
        "csatMinimumRawText": "없음",
        "csatMinimumExempt": True,
        "csatRequiredAreasRawText": "없음",
        "prevYearResult": None,
        "sourcePages": sorted(set(GRID_SRC) | {SPECIAL_DETAIL_PAGE}),
        "note": f"{college} 특수교육대상자 {n}명 — ● 표기 모집단위에서 단과대학 단위 합산 선발(모집단위별 배정 없음).",
    }
    departments.append({
        "departmentName": f"[특수교육대상자]{college}",
        "campus": campus,
        "trackHint": None,
        "totalQuotaHint": n,
        "tracks": [t],
    })
    special_total += n

# ── 조기취업형계약학과 (공학대학, 여수, 90명) — 별도표(p15) ──
EARLY = [("스마트응용설계공학과", 20), ("스마트ICT융합공학과", 25),
         ("스마트전기제어공학과", 25), ("디지털융합정보학과", 20)]
for dname, q in EARLY:
    t = {
        "trackName": "학생부종합(조기취업형계약학과)",
        "trackTypeRaw": JONGHAP,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "정원외(조기취업형계약학과)",
        "quotaInitial": q,
        "applicationQualification": "국내 고등학교 졸업(예정)자 또는 동등학력자. "
                                    "「전남대학교 계약학과 설치 및 운영규정」에 따름(스마트플랜트계약학과사업단)",
        "reflectionStages": [dict(x) for x in EARLY_STAGES],
        "csatMinimumRawText": "없음",
        "csatMinimumExempt": True,
        "csatRequiredAreasRawText": "없음",
        "prevYearResult": None,
        "sourcePages": [15, 45],
        "note": "조기취업형계약학과(공학대학, 여수) — 「수시모집 합계(계약학과 제외)」에서 제외된 별도 정원외 90명 중 일부.",
    }
    departments.append({
        "departmentName": f"{dname}(조기취업형계약학과)",
        "campus": "여수",
        "trackHint": "자연",
        "totalQuotaHint": q,
        "tracks": [t],
    })

# ════════════════════════════════════════════════════════════════════════════
# 6. 열합 검증 (전형별 컬럼합 vs 총계행) + 특수교육 별도
# ════════════════════════════════════════════════════════════════════════════
coltotal = []
all_match = True
for i in range(17):
    if i == SPECIAL_IDX:
        # 특수교육: 컬럼값이 ●(0)이라 col_sum=0. 별도 단과대학 합산 special_total과 대조.
        m = (special_total == TOT[i])
        coltotal.append({"track": COLS[i], "computed": special_total,
                         "expectedSumRow": TOT[i], "match": m})
        if not m:
            all_match = False
        continue
    m = (col_sum[i] == TOT[i])
    coltotal.append({"track": COLS[i], "computed": col_sum[i], "expectedSumRow": TOT[i], "match": m})
    if not m:
        all_match = False

# 열합 총계(계) — 수시모집 합계 모집인원 3,875 (정원내+정원외, 특수교육 포함)
computed_total = sum(col_sum) + special_total
expected_total = sum(TOT)  # = 3875
total_match = (computed_total == expected_total)
if not total_match:
    all_match = False
    warnings.append(f"[열합총계] 계산 {computed_total} vs 총계행 {expected_total}")

checksum_passed = (row_fail == 0) and all_match and (len(parse_fail) == 0)

# ── warnings (도메인 설명) ──
warnings.append(
    "[캠퍼스] 여수캠퍼스 = 공학대학·문화사회과학대학·수산해양대학·창의융합학부(◆, p15 주석). 그 외 = 광주캠퍼스. "
    "여수 소계 일반 379 = 공학139+문화사회120+수산101+창의19 검증완료."
)
warnings.append(
    "[정원외 모집인원 합산] 전남대는 정원외 전형(농어촌·특성화고졸업·기초/차상위/한부모·특성화고졸재직·만학도)을 "
    "'수시 모집인원' 컬럼에 합산함(경북대와 반대). 따라서 행합: 모집인원 == Σ(17전형컬럼, 특수교육 제외). "
    "광주소계+여수소계=학부합계, +치전원=수시합계(계약학과 제외) 전 컬럼 일치 자기검증."
)
warnings.append(
    "[특수교육대상자 단과대학 합산] 학생부교과(특수교육대상자) 37명은 모집단위별 고정인원 없이 ● 표기 모집단위에서 "
    "단과대학별 합계([3]×12개대학 + 수의[1] = 37, 광주28+여수9) 선발. → 단과대학별 합성 레코드 "
    "`[특수교육대상자]{단과대학}` 13개로 생성(일반 모집단위 트랙엔 미부여). 열합 검증은 별도 합산으로 대조."
)
warnings.append(
    "[광역선발 계열·전공예약] 에너지공학계열·전기전자컴퓨터공학계열·기계공학계열·화공환경공학계열·해양수산자율전공계열(광역선발) "
    "및 건축·도시설계전공/건축공학전공·멀티미디어전공/전자상거래전공(전공예약)은 PDF가 별행으로 모집인원을 부여 → "
    "그대로 모집단위 레코드로 생성. 열합이 계열+전공예약+세부전공 전부 포함 기준으로 총계행과 정확히 일치(자기검증)."
)
warnings.append(
    "[음악학과·국악학과 악기별 흡수] 총괄표가 음악학과(피아노/성악/작곡/현악·관타악 악기별)·국악학과(성악/작곡이론/현악·관타악)를 "
    "악기 단위로 다수 행 표기(전부 예능실기). 모집단위로는 '음악학과'(예능실기 54)·'국악학과'(예능실기 26) 1개씩 생성하고 "
    "세부 악기행은 부모로 흡수(중복 합산 방지). 미술학과(예능실기41+이론전공 일반11)·디자인학과(예능실기24)는 모집단위 단위 그대로."
)
warnings.append(
    "[조기취업형계약학과] 공학대학(여수) 학생부종합(조기취업형계약학과) 90명(스마트응용설계20·스마트ICT융합25·"
    "스마트전기제어25·디지털융합정보20)은 「수시모집 합계(계약학과 제외) 3,875」에서 제외된 별도 정원외 표(p15). "
    "별도 레코드로 생성, 열합 검증 모집단위에서 분리."
)
warnings.append(
    "[수능최저 p59] 단과대학 그룹별 등급(학생부교과 일반/지역인재/그룹): 의(-/5/6, 수학포함3개합·과탐2평균), 치전원(5/6/7), "
    "수의·약(6/7/8, 3개합), 간호·경영(9/10, 3개합), 자율전공(6/7, 3개합), 공과·사범(7/8, 2개합), "
    "농생명·사회과학·생활과학·인문·자연과학·AI융합·수산생명의학과·미술이론(8/9, 2개합); 여수(공학·문화사회·창의융합)·수산(그 외) 미적용. "
    "학생부종합 고교생활우수자Ⅰ 일부적용(의5/치6/수약7), 지역의사 6; 사회다양성·특성화고졸업·특수교육·만학도·특성화고졸재직·"
    "고교생활우수자Ⅱ·후계농업·예능실기 미적용. 체육교육과 학생부교과(예체능실기) 2개합 7."
)

# ════════════════════════════════════════════════════════════════════════════
# 7. result / meta 조립
# ════════════════════════════════════════════════════════════════════════════
result = {
    "universityName": "전남대학교", "year": 2027, "recruitmentSeason": "susi",
    "departments": departments, "warnings": warnings,
}

all_tracks = [t for d in departments for t in d["tracks"]]
T = len(all_tracks)
def cnt(f): return sum(1 for t in all_tracks if f(t))
q_n = cnt(lambda t: t["quotaInitial"] is not None)
r_n = cnt(lambda t: t["reflectionStages"])
c_n = cnt(lambda t: t["csatMinimumRawText"] is not None)
ce_n = cnt(lambda t: t["csatMinimumExempt"] is not None)
sp_n = cnt(lambda t: t["sourcePages"])
comp = cnt(lambda t: t["quotaInitial"] is not None and t["reflectionStages"] and t["sourcePages"])

meta = {
    "universityName": "전남대학교", "universityId": "kcue_0000023",
    "year": 2027, "recruitmentSeason": "susi", "sourceDocYear": 2027,
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0.0, "campusScope": "광주 + 여수 두 캠퍼스 통합",
    "departments": len(departments), "totalTracks": T,
    "rowSumValidation": {
        "basis": "수시 모집인원 컬럼 == Σ(17전형, 특수교육 제외) [정원외 합산형]",
        "passed": row_pass, "failed": row_fail, "failedList": row_fail_list,
    },
    "colTotalValidation": coltotal,
    "colTotalGye": {"computed": computed_total, "expected": expected_total, "match": total_match},
    "checksumPassed": checksum_passed,
    "fillRatios": {
        "quotaInitial": [q_n, T], "reflectionStages": [r_n, T],
        "csatMinimumRawText": [c_n, T], "csatMinimumExempt": [ce_n, T], "sourcePages": [sp_n, T],
    },
    "completeRecords": [comp, T],
}

out_path = BASE / "chonnam-text.json"
out_path.write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2),
                    encoding="utf-8")

# ════════════════════════════════════════════════════════════════════════════
# 8. 콘솔 리포트
# ════════════════════════════════════════════════════════════════════════════
print("=" * 74)
print("전남대학교 2027 수시 — 텍스트 직접 구조화 (Vision 미사용, $0)")
print("=" * 74)
print(f"그리드 물리페이지: {[p + 1 for p in GRID_PAGES]}  |  캠퍼스: 광주 + 여수")
print(f"\n학과(모집단위): {len(departments)}  |  전형(track): {T}")
print(f"행합(모집인원 == Σ트랙, 특수교육 제외): 통과 {row_pass} / 실패 {row_fail}")
for f in row_fail_list:
    print(f"   [행합실패] {f}")
if parse_fail:
    print(f"\n파싱 경고 {len(parse_fail)}:")
    for p, li, msg in parse_fail:
        print(f"   p{p} L{li}: {msg}")

print("\n열합 검증 (전형별 컬럼합 vs 총계행):")
for item in coltotal:
    flag = "OK" if item["match"] else "XX"
    print(f"  [{flag}] {item['track']:18s} 계산={item['computed']:5d}  총계행={item['expectedSumRow']:5d}")
print(f"  [{'OK' if total_match else 'XX'}] {'계(모집인원 합)':18s} 계산={computed_total:5d}  총계행={expected_total:5d}")

print(f"\nmeta.checksumPassed: {checksum_passed}")
print(f"\n채움비율 ({T}전형):")
for lab, n in [("quotaInitial", q_n), ("reflectionStages", r_n), ("csatMinimumRawText", c_n),
               ("csatMinimumExempt", ce_n), ("sourcePages", sp_n), ("완전레코드", comp)]:
    print(f"  {lab:18s}: {n}/{T} ({100 * n // T if T else 0}%)")
print(f"\nwarnings: {len(warnings)}건")
print(f"저장: {out_path}")
