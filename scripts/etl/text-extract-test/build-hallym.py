#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한림대학교 2027 수시 — pdftotext -layout 텍스트 → AdmissionRecord(PdfAnalysisResult) JSON.

Vision API 미사용 (클라이언트 운영비 보호, $0). Claude Code 본체가 kcue_0000198.txt /
물리 p19 의 "Ⅲ. 전형별 모집인원" 총괄표를 정독해 (학과 × 전형) grid 를 결정론적으로 인코딩하고,
전형별 템플릿(반영비율·수능최저·지원자격)을 결합한다.

캠퍼스: 한림대학교 춘천캠퍼스 단독본. 모든 학과 campus="춘천".

────────────────────────────────────────────────────────────────────────────
모집인원 총괄표(물리 p19) 구조 — Claude Code 본체가 컬럼위치+열합으로 검증한 16개 숫자컬럼:
  [모집인원(=입학정원,정원내, track 아님),
   학생부종합 정원내: 학교생활우수자, 지역의사, 지역인재, 지역인재_기초생활,
   학생부종합 정원외: 농어촌, (장애인등대상자=제한없음→숫자없음),
   학생부교과 정원내: 교과우수자, 지역인재, 지역인재_기초생활, 한림케어1, 한림케어2,
   학생부교과 정원외: 농어촌, 기초생활,
   특기자 정원내: 외국어특기자, 체육특기자,
   재외국민및외국인 정원내: 재외국민, (북한이탈주민=제한없음→숫자없음)]

열합(col) 독립검증 — 합계행(L93) 및 "나. 전형별 모집인원" 요약표(L351~)와 100% 일치:
  학교생활우수자=557 지역의사=7 지역인재(종합)=42 지역인재_기초(종합)=2 농어촌(종합외)=2
  교과우수자=605 지역인재(교과)=269 지역인재_기초(교과)=3 한림케어1=118 한림케어2=17
  농어촌(교과외)=79 기초생활(교과외)=27 외국어특기자=19 체육특기자=9 재외국민=5

특이 구조 (정직성 — 본문 직독으로 확인, 날조 없음):
  · 모집인원(=입학정원, 정원내) 컬럼은 track 아님 → totalQuotaHint 에 사용하지 않음.
    totalQuotaHint = 해당 학과 수시 전형 quota 합(정원내+정원외).
  · 장애인등대상자전형(종합 기회균형, 정원외) = "제한없음"(물리 p36) → quota=null,
    학과 배정 없음 → 단일 가상 모집단위 "전 모집단위(장애인등대상자전형)".
  · 북한이탈주민전형 = "제한없음"(물리 p13 전형요소표) → 본 총괄표에 컬럼 존재하나 전부 제한없음.
    별도 모집단위 표기 없음 → 가상 모집단위 "일반학과(북한이탈주민전형)" quota=null.
  · 기초생활수급자및차상위계층전형(교과 기회균형, 정원외, 총27명) — 물리 p58 "1.모집인원 27명
    (※모집단위별 모집인원은 19쪽 참고)" 이나 p19 grid 에서 학과별 itemize 가 합계행에만
    존재(개별 학과행엔 숫자 없음, pdftotext 4중 확인). → 학과별 배정 불명 → null 정직성:
    단일 가상 모집단위 "전계열(기초생활수급자및차상위계층전형)" quota=27(합계, 학과배분 null).
  · 재외국민및외국인전형(정원외 별도모집, 입학처 홈페이지 별도요강) — grid 합계 5 중
    의학과 1명만 학과 itemize, 나머지 4명은 계열 단위 "(4)" 표기. 학교생활우수자~한림케어2 와
    동일 grid 에 있으나 본 전형은 "별도 모집"(L329 각주 1) → 수시 일반전형과 분리.
    → 의학과 재외국민(1) + 가상 모집단위 "전계열(재외국민및외국인전형)"(4) 로 인코딩.
  · 괄호 "(n)" (예 (15) (12) (4)) = "계열별 총 선발인원"(grid 각주), 학과별 quota 아님 →
    개별 학과 quota 에 반영하지 않음. (체육특기자·재외국민의 계열총선발 표기)

행합(row): 학과별 track quota 합 == totalQuotaHint. 본 grid 엔 학과별 '수시 총인원' 별도
  컬럼이 없으므로 totalQuotaHint = (해당 학과 정원내 전형 합 + 정원외 전형 합) 으로 자체 산출
  → 정의상 행합은 항상 통과(failed=0). 무결성의 핵심은 열합(전형별 합 == 원문 합계/요약표).

sourceDocYear: 표지(L1) "2027학년도 한림대학교 수시모집요강" 확인 → 2027.
"""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
UNIV = "한림대학교"
SLUG = "kcue_0000198"
CAMPUS = "춘천"
PG_GRID = 19  # 물리 PDF 페이지 (= 인쇄 p19, "Ⅲ. 전형별 모집인원")

# ── 전형별 모집인원 grid (물리 p19) — 본체가 컬럼정렬+열합으로 검증한 값 ─────────────
# 각 학과: (대학, 학과명원문, trackHint, {전형키: 인원})
# 전형키: 종합_학교생활우수자, 종합_지역의사, 종합_지역인재, 종합_지역인재_기초, 종합외_농어촌,
#         교과_교과우수자, 교과_지역인재, 교과_지역인재_기초, 교과_한림케어1, 교과_한림케어2,
#         교과외_농어촌, 특기_외국어, 특기_체육, 재외_재외국민
# (장애인·북한이탈·기초생활(교과외)·재외(계열4) 는 학과배정 불명/제한없음 → 별도 가상 모집단위)
# '-' / 미기재 = 0 (해당 전형 미선발). 모든 값은 p19 grid 직독 + 열합 검증 통과.
DEPTS = [
    # 대학, 학과명, trackHint, 입학정원(정원내,참고), tracks
    ("인문대학", "인문학부(국어국문학, 철학, 사학)", "인문", 110,
     {"종합_학교생활우수자": 25, "교과_교과우수자": 34, "교과_지역인재": 20, "교과_한림케어1": 6, "교과_한림케어2": 2, "교과외_농어촌": 3}),
    ("인문대학", "영어영문학과", "인문", 38,
     {"종합_학교생활우수자": 10, "교과_교과우수자": 10, "교과_지역인재": 6, "교과_한림케어1": 3, "교과외_농어촌": 2}),
    ("인문대학", "중국학과", "인문", 39,
     {"종합_학교생활우수자": 12, "교과_교과우수자": 12, "교과_지역인재": 5, "교과_한림케어1": 2, "교과외_농어촌": 2}),
    ("인문대학", "일본학과", "인문", 35,
     {"종합_학교생활우수자": 10, "교과_교과우수자": 8, "교과_지역인재": 6, "교과_한림케어1": 3, "교과외_농어촌": 2}),
    ("인문대학", "러시아학과", "인문", 33,
     {"종합_학교생활우수자": 8, "교과_교과우수자": 10, "교과_지역인재": 5, "교과_한림케어1": 2}),
    ("인문대학", "심리학과", "인문", 39,
     {"종합_학교생활우수자": 13, "교과_교과우수자": 10, "교과_지역인재": 5, "교과_한림케어1": 2, "교과외_농어촌": 3}),
    ("사회과학대학", "사회학과", "인문", 39,
     {"종합_학교생활우수자": 10, "교과_교과우수자": 12, "교과_지역인재": 5, "교과_한림케어1": 3, "교과외_농어촌": 2}),
    ("사회과학대학", "사회복지학부(사회복지학, 노인복지학)", "인문", 59,
     {"종합_학교생활우수자": 28, "교과_교과우수자": 5, "교과_지역인재": 12, "교과_한림케어1": 5, "교과_한림케어2": 2, "교과외_농어촌": 4}),
    ("사회과학대학", "정치행정학과", "인문", 38,
     {"종합_학교생활우수자": 8, "교과_교과우수자": 12, "교과_지역인재": 7, "교과_한림케어1": 3, "교과외_농어촌": 2}),
    ("사회과학대학", "광고홍보학과", "인문", 37,
     {"종합_학교생활우수자": 20, "종합_지역인재": 4, "교과_교과우수자": 10, "교과_한림케어1": 3, "교과외_농어촌": 3}),
    ("사회과학대학", "법학과", "인문", 60,
     {"종합_학교생활우수자": 12, "교과_교과우수자": 20, "교과_지역인재": 10, "교과_한림케어1": 4, "교과_한림케어2": 2, "교과외_농어촌": 2}),
    ("경영대학", "경제학과", "인문", 52,
     {"종합_학교생활우수자": 14, "교과_교과우수자": 29, "교과_지역인재": 6, "교과_한림케어1": 3, "교과외_농어촌": 2}),
    ("경영대학", "경영대학(경영학과, 금융재무학과)", "인문", 157,
     {"종합_학교생활우수자": 48, "교과_교과우수자": 48, "교과_지역인재": 28, "교과_한림케어1": 10, "교과_한림케어2": 3, "교과외_농어촌": 6}),
    ("자연과학대학", "화학과", "자연", 26,
     {"종합_학교생활우수자": 7, "교과_교과우수자": 11, "교과_지역인재": 2, "교과_한림케어1": 2, "교과외_농어촌": 1}),
    ("자연과학대학", "환경생명공학과", "자연", 30,
     {"종합_학교생활우수자": 10, "교과_교과우수자": 11, "교과_지역인재": 3, "교과_한림케어1": 2, "교과외_농어촌": 1}),
    ("자연과학대학", "언어청각학부(언어병리학, 청각학)", "자연", 52,
     {"종합_학교생활우수자": 10, "교과_교과우수자": 20, "교과_지역인재": 8, "교과_한림케어1": 2, "교과_한림케어2": 1, "교과외_농어촌": 3}),
    ("자연과학대학", "체육학과", "예체능", 42,
     {"종합_학교생활우수자": 5, "교과_교과우수자": 4, "교과_지역인재": 4, "교과_한림케어1": 2, "교과외_농어촌": 4, "특기_체육": 9}),
    ("자연과학대학", "자연과학대학 자율전공(화학과, 환경생명공학과, 언어병리학, 청각학, 체육학과)", "자연", 36,
     {"종합_학교생활우수자": 10, "교과_교과우수자": 10, "교과_지역인재": 5, "교과_한림케어1": 3}),
    ("의생명과학대학", "생명과학과", "자연", 34,
     {"종합_학교생활우수자": 11, "교과_교과우수자": 12, "교과_지역인재": 3, "교과_한림케어1": 2, "교과외_농어촌": 1}),
    ("의생명과학대학", "바이오메디컬학과", "자연", 37,
     {"종합_학교생활우수자": 13, "교과_교과우수자": 13, "교과_지역인재": 4, "교과_한림케어1": 2, "교과외_농어촌": 2}),
    ("의생명과학대학", "식품영양학과", "자연", 37,
     {"종합_학교생활우수자": 13, "교과_교과우수자": 13, "교과_지역인재": 4, "교과_한림케어1": 2, "교과외_농어촌": 2}),
    ("의생명과학대학", "의생명과학대학 자율전공(생명과학과, 바이오메디컬학과, 식품영양학과)", "자연", 34,
     {"종합_학교생활우수자": 9, "교과_교과우수자": 10, "교과_지역인재": 5, "교과_한림케어1": 4, "교과외_농어촌": 1}),
    ("정보과학대학", "인공지능컴퓨팅학부(인공지능, 컴퓨터공학, 의료AI공학)", "자연", 262,
     {"종합_학교생활우수자": 70, "교과_교과우수자": 90, "교과_지역인재": 35, "교과_한림케어1": 16, "교과_한림케어2": 5, "교과외_농어촌": 9}),
    ("정보과학대학", "데이터사이언스학부(데이터테크, 임상의학통계, 디지털금융정보)", "자연", 60,
     {"종합_학교생활우수자": 16, "교과_교과우수자": 20, "교과_지역인재": 10, "교과_한림케어1": 3, "교과외_농어촌": 2}),
    ("의과대학", "의학과", "자연", 83,
     {"종합_학교생활우수자": 31, "종합_지역의사": 7, "종합_지역인재": 18, "종합_지역인재_기초": 2, "종합외_농어촌": 2, "재외_재외국민": 1}),
    ("간호대학", "간호학과", "자연", 105,
     {"종합_학교생활우수자": 30, "종합_지역인재": 20, "교과_교과우수자": 13, "교과_지역인재_기초": 3, "교과_한림케어1": 4, "교과외_농어촌": 2}),
    ("글로벌융합대학", "글로벌학부(글로벌비즈니스)", "인문", 29,
     {"교과_교과우수자": 10, "특기_외국어": 19}),
    ("글로벌융합대학", "융합과학수사학과", "자연", 40,
     {"종합_학교생활우수자": 10, "교과_교과우수자": 15, "교과_지역인재": 8, "교과_한림케어1": 2, "교과외_농어촌": 2}),
    ("글로벌융합대학", "글로컬MICE학과", "인문", 20,
     {"종합_학교생활우수자": 6, "교과_교과우수자": 5, "교과_지역인재": 3, "교과_한림케어1": 2, "교과외_농어촌": 1}),
    ("미디어스쿨", "미디어스쿨(미디어커뮤니케이션, 디지털미디어콘텐츠)", "인문", 84,
     {"종합_학교생활우수자": 26, "교과_교과우수자": 21, "교과_지역인재": 15, "교과_한림케어1": 5, "교과_한림케어2": 2, "교과외_농어촌": 5}),
    ("반도체·디스플레이스쿨", "반도체·디스플레이스쿨(반도체, 디스플레이)", "자연", 66,
     {"종합_학교생활우수자": 14, "교과_교과우수자": 26, "교과_지역인재": 10, "교과_한림케어1": 4, "교과외_농어촌": 1}),
    ("미래융합스쿨", "미래융합스쿨(디지털인문예술, 융합관광경영)", "인문", 40,
     {"종합_학교생활우수자": 13, "교과_교과우수자": 11, "교과_지역인재": 5, "교과_한림케어1": 2, "교과외_농어촌": 1}),
    ("자유전공학부", "자유전공학부(전 모집단위(의학과, 간호학과 제외))", None, 185,
     {"종합_학교생활우수자": 35, "교과_교과우수자": 70, "교과_지역인재": 30, "교과_한림케어1": 10, "교과외_농어촌": 8}),
]

# ── 열합 검증 기준값 (요약표 L351~ + 합계행 L93) ──────────────────────────────
COL_GT = {
    "종합_학교생활우수자": 557, "종합_지역의사": 7, "종합_지역인재": 42, "종합_지역인재_기초": 2, "종합외_농어촌": 2,
    "교과_교과우수자": 605, "교과_지역인재": 269, "교과_지역인재_기초": 3, "교과_한림케어1": 118, "교과_한림케어2": 17,
    "교과외_농어촌": 79, "특기_외국어": 19, "특기_체육": 9, "재외_재외국민": 1,  # 재외 학과itemize분(의학과1); 계열4는 별도
}
# 합계행 재외국민=5 = 의학과 itemize 1 + 계열 "(4)" 4. COL_GT 의 재외=1 은 학과배정분만.

# ── 전형 메타 템플릿 (전형방법·수능최저·지원자격, 본문 직독) ──────────────────────
# components: 한글 키 + 비율(%). 단계형/일괄합산 구분. (물리 p13 전형요소표 + 각 전형 상세페이지)
NONGEO = ("국내 정규 고등학교 졸업(예정)자로서 학교의 장이 정하는 농어촌 지역 또는 도서·벽지의 학생으로 "
          "유형1(학생·부모 6년 거주)·유형2(학생 12년 거주) 중 하나에 해당하는 자")

TRACK_META = {
    # key: (trackName, trackTypeRaw, specialTypeKeyword, applicationQualification,
    #        reflectionStages, csatMinimumRawText, csatMinimumExempt, csatRequiredAreasRawText, sourcePages)
    "종합_학교생활우수자": (
        "학생부종합(일반전형) 학교생활우수자", "학생부위주(종합)", None,
        "국내외 정규 고등학교 졸업(예정)자 또는 관련 법령에 의하여 이와 동등의 학력이 있다고 인정된 자",
        [{"stageLabel": "1단계", "multiplier": 4, "components": {"서류종합평가": 100}, "stageMaxScore": None},
         {"stageLabel": "2단계", "multiplier": None, "components": {"1단계성적": 70, "면접": 30}, "stageMaxScore": None}],
        # 의학과만 수능최저 적용, 그 외 없음 → 학과별로 분기(아래 build 시 처리)
        "없음", True, None, [13, 19, 24, 26]),
    "종합_지역의사": (
        "학생부종합(지역의사전형) 지역의사", "학생부위주(종합)", "지역인재",
        "강원 지역에서 거주하며 지역 소재의 중학교 및 고등학교에서 입학부터 졸업까지의 모든 교육과정을 이수하고 "
        "졸업(예정)한 자 (의사면허 취득 후 강원지역 10년 의무복무 지역의사 희망자; 권역별 선발)",
        [{"stageLabel": "1단계", "multiplier": 5, "components": {"서류종합평가": 100}, "stageMaxScore": None},
         {"stageLabel": "2단계", "multiplier": None, "components": {"1단계성적": 70, "면접": 30}, "stageMaxScore": None}],
        "국어, 영어, 수학, 과학탐구(2과목 평균) 4개 영역 중 3개 합 5등급 이내 (단, 영어 포함하여 반영할 경우 영어는 2등급 이내) "
        "* 수학 지정과목: 미적분 또는 기하 / * 탐구 지정영역: 과학",
        False, "국어, 수학(미적분/기하), 영어, 과학탐구(2과목 평균)", [13, 14, 15, 19, 28]),
    "종합_지역인재": (
        "학생부종합(지역인재전형) 지역인재", "학생부위주(종합)", "지역인재",
        "강원 지역 소재의 고등학교에서 입학부터 졸업까지의 모든 교육과정을 이수하고 졸업(예정)한 자",
        [{"stageLabel": "1단계", "multiplier": 5, "components": {"서류종합평가": 100}, "stageMaxScore": None},
         {"stageLabel": "2단계", "multiplier": None, "components": {"1단계성적": 70, "면접": 30}, "stageMaxScore": None}],
        # 의학과만 최저, 광고홍보·간호 등은 없음 → build 시 학과 분기
        "없음", True, None, [13, 14, 19, 30]),
    "종합_지역인재_기초": (
        "학생부종합(지역인재전형) 지역인재_기초생활수급자및차상위계층", "학생부위주(종합)", "지역인재",
        "강원 지역 소재의 고등학교에서 입학부터 졸업까지의 모든 교육과정을 이수하고 졸업(예정)한 자로서 "
        "기초생활수급자·차상위계층·한부모가족지원대상자 중 하나에 해당하는 자",
        [{"stageLabel": "1단계", "multiplier": 5, "components": {"서류종합평가": 100}, "stageMaxScore": None},
         {"stageLabel": "2단계", "multiplier": None, "components": {"1단계성적": 70, "면접": 30}, "stageMaxScore": None}],
        # 의학과 대상 → 최저 적용
        "국어, 영어, 수학, 과학탐구(2과목 평균) 4개 영역 중 3개 합 5등급 이내 (단, 영어 포함하여 반영할 경우 영어는 1등급) "
        "* 수학 지정과목: 미적분 또는 기하 / * 탐구 지정영역: 과학",
        False, "국어, 수학(미적분/기하), 영어, 과학탐구(2과목 평균)", [13, 19, 32]),
    "종합외_농어촌": (
        "학생부종합(기회균형전형) 농어촌학생", "학생부위주(종합)", "농어촌",
        NONGEO + " (정원 외)",
        [{"stageLabel": "1단계", "multiplier": 5, "components": {"서류종합평가": 100}, "stageMaxScore": None},
         {"stageLabel": "2단계", "multiplier": None, "components": {"1단계성적": 70, "면접": 30}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 34]),
    # ── 학생부교과 (일괄합산, 학생부100 = 교과90 + 출결10) ──
    "교과_교과우수자": (
        "학생부교과(일반전형) 교과우수자", "학생부위주(교과)", None,
        "국내외 정규 고등학교 졸업(예정)자 또는 관련 법령에 의하여 이와 동등의 학력이 있다고 인정된 자",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부교과": 90, "출결": 10}, "stageMaxScore": None}],
        # 간호학과만 최저 → build 시 분기
        "없음", True, None, [13, 19, 38, 40]),
    "교과_지역인재": (
        "학생부교과(지역인재전형) 지역인재", "학생부위주(교과)", "지역인재",
        "강원 지역 소재의 고등학교에서 입학부터 졸업까지의 모든 교육과정을 이수하고 졸업(예정)한 자",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부교과": 90, "출결": 10}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 42]),
    "교과_지역인재_기초": (
        "학생부교과(지역인재전형) 지역인재_기초생활수급자및차상위계층", "학생부위주(교과)", "지역인재",
        "강원 지역 소재의 고등학교에서 입학부터 졸업까지의 모든 교육과정을 이수하고 졸업(예정)한 자 중 "
        "기초생활수급자·차상위계층·한부모가족지원대상자에 해당하는 자",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부교과": 90, "출결": 10}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 44]),
    "교과_한림케어1": (
        "학생부교과(기회균형전형) 한림케어1", "학생부위주(교과)", "기회균형",
        "국내외 정규 고등학교 졸업(예정)자로서 국가보훈대상자 등 한림케어1 지원 자격(보훈·다자녀 등)에 해당하는 자",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부교과": 90, "출결": 10}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 46]),
    "교과_한림케어2": (
        "학생부교과(독자전형) 한림케어2", "학생부위주(교과)", "기회균형",
        "국내외 정규 고등학교 졸업(예정)자로서 직업군인·소방·경찰·교정직 공무원 자녀, 환경미화원·집배원 자녀, "
        "조손가정, 다문화가정, 다자녀가정 등 한림케어2 지원 자격에 해당하는 자",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부교과": 90, "출결": 10}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 60]),
    "교과외_농어촌": (
        "학생부교과(기회균형전형) 농어촌학생", "학생부위주(교과)", "농어촌",
        NONGEO + " (정원 외)",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부교과": 90, "출결": 10}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 56]),
    # ── 특기자 (일괄합산) ──
    "특기_외국어": (
        "특기자전형 외국어특기자", "실기/실적위주", "특기자",
        "국내외 정규 고등학교 졸업(예정)자 또는 관련 법령에 의하여 이와 동등의 학력이 있다고 인정된 자 (글로벌학부 외국어 특기자)",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"서류": 60, "면접": 40}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 63]),
    "특기_체육": (
        "특기자전형 체육특기자", "실기/실적위주", "특기자",
        "국내외 정규 고등학교 졸업(예정)자 또는 관련 법령에 의하여 이와 동등의 학력이 있다고 인정된 자 "
        "(체육학과; 배드민턴 2, 씨름 3, 테니스 4)",
        [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부": 20, "면접": 20, "경기실적": 60}, "stageMaxScore": None}],
        "없음", True, None, [13, 19, 67]),
    # ── 재외국민및외국인 (별도 모집; 의학과 itemize분) ──
    "재외_재외국민": (
        "재외국민및외국인전형 재외국민및외국인_의학과", "기타", "재외국민",
        "재외국민 및 외국인 지원 자격에 해당하는 자 (의학과; 정원 외 별도 모집, 입학처 홈페이지 별도요강 확인)",
        [{"stageLabel": "1단계", "multiplier": 5, "components": {"서류": 100}, "stageMaxScore": None},
         {"stageLabel": "2단계", "multiplier": None, "components": {"1단계성적": 50, "면접": 50}, "stageMaxScore": None}],
        "없음", True, None, [13, 19]),
}

# 의학과 학교생활우수자 / 지역인재 수능최저 (의학과 전용; 위 템플릿은 비의학과 기본값)
MED_CSAT = {
    "종합_학교생활우수자": ("국어, 영어, 수학, 과학탐구(2과목 평균) 4개 영역 중 3개 합 4등급 이내 "
                     "(단, 영어 포함하여 반영할 경우 영어는 1등급) * 수학 지정과목: 미적분 또는 기하 / * 탐구 지정영역: 과학",
                     False, "국어, 수학(미적분/기하), 영어, 과학탐구(2과목 평균)"),
    "종합_지역인재": ("국어, 영어, 수학, 과학탐구(2과목 평균) 4개 영역 중 3개 합 5등급 이내 "
                 "(단, 영어 포함하여 반영할 경우 영어는 1등급) * 수학 지정과목: 미적분 또는 기하 / * 탐구 지정영역: 과학",
                 False, "국어, 수학(미적분/기하), 영어, 과학탐구(2과목 평균)"),
}
# 간호학과 교과우수자 수능최저 (간호학과 전용)
NURSE_GYOWA_CSAT = ("국어, 영어, 수학, 사회/과학탐구(2과목 평균) 4개 영역 중 3개 합 10등급 이내 "
                    "(단, 수학 선택과목을 미적분 또는 기하로 선택하여 반영할 시 12등급 이내) * 지정과목 없음",
                    False, "국어, 수학, 영어, 사회/과학탐구(2과목 평균)")

# ── 빌드 ──────────────────────────────────────────────────────────────────────
warnings = []


def build_track(key, quota, dept_name):
    (tn, ttr, spk, qual, stages, csat, exempt, areas, pages) = TRACK_META[key]
    csat, exempt, areas = csat, exempt, areas
    # 학과별 수능최저 분기 (의학과 종합·간호 교과)
    if dept_name == "의학과" and key in MED_CSAT:
        csat, exempt, areas = MED_CSAT[key]
    elif dept_name == "간호학과" and key == "교과_교과우수자":
        csat, exempt, areas = NURSE_GYOWA_CSAT
    return {
        "trackName": tn,
        "trackTypeRaw": ttr,
        "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": spk,
        "quotaInitial": quota,
        "applicationQualification": qual,
        "reflectionStages": stages,
        "csatMinimumRawText": csat,
        "csatMinimumExempt": exempt,
        "csatRequiredAreasRawText": areas,
        "prevYearResult": None,
        "sourcePages": pages,
    }


# 정규 학과 (grid itemized tracks)
ORDER = ["종합_학교생활우수자", "종합_지역의사", "종합_지역인재", "종합_지역인재_기초", "종합외_농어촌",
         "교과_교과우수자", "교과_지역인재", "교과_지역인재_기초", "교과_한림케어1", "교과_한림케어2",
         "교과외_농어촌", "특기_외국어", "특기_체육", "재외_재외국민"]

departments = []
col_computed = {k: 0 for k in COL_GT}
row_fail = []

for (coll, name, hint, jeongwon, tracks) in DEPTS:
    track_list = []
    total = 0
    for key in ORDER:
        if key in tracks and tracks[key] and tracks[key] > 0:
            q = tracks[key]
            col_computed[key] += q
            track_list.append(build_track(key, q, name))
            total += q
    # 행합: track quota 합 == totalQuotaHint (자체 산출 → 항상 통과)
    tqh = total
    if sum(t["quotaInitial"] or 0 for t in track_list) != tqh:
        row_fail.append(name)
    departments.append({
        "departmentName": name,
        "campus": CAMPUS,
        "trackHint": hint,
        "totalQuotaHint": tqh,
        "tracks": track_list,
    })

# ── 가상 모집단위 (학과배정 불명/제한없음 정원외 전형 — null 정직성) ──────────────
# 1) 장애인등대상자전형 (종합 기회균형, 정원외, 제한없음)
departments.append({
    "departmentName": "전 모집단위(장애인등대상자전형)",
    "campus": CAMPUS, "trackHint": None, "totalQuotaHint": None,
    "tracks": [{
        "trackName": "학생부종합(기회균형전형) 장애인등대상자",
        "trackTypeRaw": "학생부위주(종합)", "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "장애인", "quotaInitial": None,
        "applicationQualification": "장애인복지법 제32조 등록 장애인 또는 장애인 등에 대한 특수교육법 대상자 (정원 외, 모집인원 제한없음, 1단계 선발인원 제한없음)",
        "reflectionStages": [
            {"stageLabel": "1단계", "multiplier": None, "components": {"서류종합평가": 100}, "stageMaxScore": None},
            {"stageLabel": "2단계", "multiplier": None, "components": {"1단계성적": 70, "면접": 30}, "stageMaxScore": None}],
        "csatMinimumRawText": "없음", "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": [13, 19, 36],
    }],
})
warnings.append("장애인등대상자전형(종합 기회균형, 정원외): 모집인원 '제한없음' → quotaInitial=null. 가상 모집단위로 인코딩.")

# 2) 기초생활수급자및차상위계층전형 (교과 기회균형, 정원외, 총27명; 학과배정 불명)
departments.append({
    "departmentName": "전계열(기초생활수급자및차상위계층전형)",
    "campus": CAMPUS, "trackHint": None, "totalQuotaHint": 27,
    "tracks": [{
        "trackName": "학생부교과(기회균형전형) 기초생활수급자및차상위계층",
        "trackTypeRaw": "학생부위주(교과)", "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "기회균형", "quotaInitial": 27,
        "applicationQualification": "국내외 정규 고등학교 졸업(예정)자로서 국민기초생활보장법상 수급권자·차상위계층 또는 한부모가족지원법 대상자 (정원 외, 총 27명; 모집단위별 배정 비공개)",
        "reflectionStages": [{"stageLabel": "일괄합산", "multiplier": None, "components": {"학생부교과": 90, "출결": 10}, "stageMaxScore": None}],
        "csatMinimumRawText": "없음", "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": [13, 19, 58],
    }],
})
warnings.append("기초생활수급자및차상위계층전형(교과 기회균형, 정원외, 27명): p19 grid 합계행에만 27 표기, 학과별 itemize 없음 → 단일 가상 모집단위(quota=27, 학과배분 null). 열합 기준은 27.")

# 3) 재외국민및외국인전형 계열분 (의학과 제외 4명; 별도 모집)
departments.append({
    "departmentName": "전계열(재외국민및외국인전형)",
    "campus": CAMPUS, "trackHint": None, "totalQuotaHint": 4,
    "tracks": [{
        "trackName": "재외국민및외국인전형 재외국민및외국인",
        "trackTypeRaw": "기타", "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "재외국민", "quotaInitial": 4,
        "applicationQualification": "재외국민 및 외국인 지원 자격에 해당하는 자 (의학과 제외 전계열, 정원 외 별도 모집, 계열별 총 선발 4명; 입학처 홈페이지 별도요강 확인)",
        "reflectionStages": [{"stageLabel": "일괄합산", "multiplier": None, "components": {"면접": 100}, "stageMaxScore": None}],
        "csatMinimumRawText": "없음", "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": [13, 19],
    }],
})
warnings.append("재외국민및외국인전형: 별도 모집(입학처 별도요강). p19 grid 합계 5 = 의학과 itemize 1 + 계열 '(4)' 4. 계열 4명은 가상 모집단위로 인코딩.")

# 4) 북한이탈주민전형 (제한없음, 학과배정 없음)
departments.append({
    "departmentName": "일반학과(북한이탈주민전형)",
    "campus": CAMPUS, "trackHint": None, "totalQuotaHint": None,
    "tracks": [{
        "trackName": "재외국민및외국인전형 북한이탈주민",
        "trackTypeRaw": "기타", "recruitmentPeriodRaw": "수시",
        "specialTypeKeyword": "기회균형", "quotaInitial": None,
        "applicationQualification": "북한이탈주민 지원 자격에 해당하는 자 (일반학과, 정원 외, 모집인원 제한없음)",
        "reflectionStages": [{"stageLabel": "일괄합산", "multiplier": None, "components": {"면접": 100}, "stageMaxScore": None}],
        "csatMinimumRawText": "없음", "csatMinimumExempt": True,
        "csatRequiredAreasRawText": None, "prevYearResult": None, "sourcePages": [13, 19],
    }],
})
warnings.append("북한이탈주민전형(재외국민과외국인, 정원외): 모집인원 '제한없음' → quotaInitial=null. 가상 모집단위로 인코딩.")

# ── 체크섬 (열합 = 핵심 무결성) ───────────────────────────────────────────────
col_validation = []
all_col_ok = True
for k, gt in COL_GT.items():
    c = col_computed[k]
    m = (c == gt)
    if not m:
        all_col_ok = False
    col_validation.append({"track": k, "computed": c, "stated": gt, "match": m})

# 추가 검증: 입학정원(정원내) 합 (참고; 합계행 2,038)
jeongwon_sum = sum(d for (_, _, _, d, _) in DEPTS)
JEONGWON_GT = 2038
# 정원내 수시 전형 총합 검증 (요약표 '수시 계' 1,761 = 정원내 전형들; 정원외/별도모집 제외 비교는 복잡)
# 핵심: 위 14개 열합이 요약표/합계행과 일치 → checksum 근거.

total_tracks = sum(len(d["tracks"]) for d in departments)
checksumPassed = (all_col_ok and len(row_fail) == 0)

if jeongwon_sum != JEONGWON_GT:
    warnings.append(f"입학정원(정원내) 합 {jeongwon_sum} != 합계행 {JEONGWON_GT} (참고치, track 아님)")

meta = {
    "universityName": UNIV,
    "universityId": SLUG,
    "year": 2027,
    "recruitmentSeason": "susi",
    "method": "pdftotext -layout + Claude Code 본체 직접 구조화 (Vision API 미사용)",
    "visionCost": 0,
    "campusScope": "한림대학교 춘천캠퍼스 단독 (단일 캠퍼스)",
    "sourceDocYear": 2027,
    "departments": len(departments),
    "totalTracks": total_tracks,
    "rowSumValidation": {
        "basis": "totalQuotaHint(학과별 전형 인원 합; p19 grid 엔 학과별 수시총인원 별도컬럼 없어 전형합으로 산출)",
        "passed": len(departments) - len(row_fail),
        "failed": len(row_fail),
        "failedList": row_fail,
    },
    "colTotalValidation": [
        {"track": cv["track"], "computed": cv["computed"], "stated": cv["stated"], "match": cv["match"]}
        for cv in col_validation
    ],
    "checksumPassed": checksumPassed,
}

result = {
    "universityName": UNIV,
    "year": 2027,
    "recruitmentSeason": "susi",
    "departments": departments,
    "warnings": warnings,
}

out = BASE / "hallym-text.json"
out.write_text(json.dumps({"meta": meta, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")

# ── 콘솔 리포트 ───────────────────────────────────────────────────────────────
print("=" * 72)
print("한림대학교 2027 수시 — 텍스트 직접 구조화 (Vision 미사용, $0)")
print("=" * 72)
print(f"캠퍼스: 춘천 단독  |  grid 물리페이지: p{PG_GRID}")
print(f"학과(모집단위): {len(departments)} (정규 {len(DEPTS)} + 가상 4)  |  전형(track): {total_tracks}")
print(f"\n행합 검증: 통과 {len(departments) - len(row_fail)} / 실패 {len(row_fail)}")
for x in row_fail:
    print(f"   FAIL {x}")
print(f"\n열합 검증 (전형별 합 vs 요약표/합계행):")
for cv in col_validation:
    print(f"  {cv['track']:22s} 계산={cv['computed']:5d}  기준={cv['stated']:5d}  {'OK' if cv['match'] else 'FAIL'}")
print(f"  {'입학정원(정원내)합':18s} 계산={jeongwon_sum:5d}  기준={JEONGWON_GT:5d}  {'OK' if jeongwon_sum == JEONGWON_GT else 'FAIL'} (참고, track 아님)")
print(f"\nsourceDocYear: {meta['sourceDocYear']}  |  checksumPassed: {checksumPassed}")
print(f"warnings: {len(warnings)}건")
for w in warnings:
    print(f"   - {w}")
print(f"\n저장: {out}")
