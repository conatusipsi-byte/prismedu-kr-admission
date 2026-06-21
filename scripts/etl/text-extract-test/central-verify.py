#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
중앙 독립 검증 — 각 {univ}-text.json 의 result 만 보고 (meta 자기보고 무시)
체크섬·채움비율·완전레코드를 재계산. 서브에이전트 신뢰 X, 데이터 자체로 검증.

검증:
  1. result 구조 무결성 (departments/tracks 카운트)
  2. 행합 재계산: totalQuotaHint 가 있으면 tracks quota 합 == totalQuotaHint
  3. quota null 분포 (재직자·통합선발 등 정상 null)
  4. 채움비율: quotaInitial / reflectionStages / csatMinimumRawText / csatMinimumExempt / sourcePages
  5. 완전레코드: quotaInitial≠null AND reflectionStages(비어있지 않음) AND sourcePages(비어있지 않음)
  6. trackTypeRaw / recruitmentPeriodRaw enum 분포
  7. 이상치: sourcePages 빈 track, reflectionStages components 합이 100 아닌 단계(경고만)
"""
import json, sys
from pathlib import Path
from collections import Counter

BASE = Path("scripts/etl/text-extract-test")
FILES = {
    "고려대": BASE / "korea-text.json",
    "가톨릭": BASE / "catholic-text.json",
    "경희":   BASE / "kyunghee-text.json",
    "연세":   BASE / "yonsei-text.json",
    "울산":   BASE / "ulsan-text.json",
    "성균관": BASE / "sungkyunkwan-text.json",
    "한양":   BASE / "hanyang-text.json",
    "부산":   BASE / "pusan-text.json",
    "강원대(춘천·삼척)": BASE / "kangwon_chuncheon-text.json",
    "경북대": BASE / "knu-text.json",
    # ── Phase 2 batch 2 (2026-06-03) — 신규 9개 (아주대는 브로셔=모집그리드 없음) ──
    "서울시립": BASE / "uos-text.json",
    "이화여대": BASE / "ewha-text.json",
    "인하대":   BASE / "inha-text.json",
    "건국대":   BASE / "konkuk-text.json",
    "동국대":   BASE / "dongguk-text.json",
    "홍익대":   BASE / "hongik-text.json",
    "가천대":   BASE / "gachon-text.json",
    "중앙대":   BASE / "cau-text.json",
    "아주대":   BASE / "aju-text.json",
    # ── Phase 2 batch 3 (2026-06-03) — 신규 9개 거점국립대 ──
    "부경대":     BASE / "pukyong-text.json",
    "제주대":     BASE / "jeju-text.json",
    "공주대":     BASE / "kongju-text.json",
    "한밭대":     BASE / "hanbat-text.json",
    "전남대":     BASE / "chonnam-text.json",
    "충북대":     BASE / "chungbuk-text.json",
    "전북대":     BASE / "jeonbuk-text.json",
    "서울과기대": BASE / "seoultech-text.json",
    "경상국립대": BASE / "gnu-text.json",
    # ── 추가 (2026-06-14) ──
    "숭실대":     BASE / "soongsil-text.json",
    "숙명여대":   BASE / "sookmyung-text.json",
    "세종대":     BASE / "sejong-text.json",
    "명지대":     BASE / "myongji-text.json",
    "단국대(죽전·천안)": BASE / "dankook-text.json",
    "경남대":     BASE / "kyungnam-text.json",
    "한남대":     BASE / "hannam-text.json",
    "동아대":     BASE / "donga-text.json",
    "충남대":     BASE / "cnu-text.json",
    "국립창원대": BASE / "changwon-text.json",
    # ── Phase 2 batch 6 (2026-06-21) — 지방 국립·사립 15교 (자동입수 한계까지) ──
    "군산대":     BASE / "kunsan-text.json",
    "목포해양대": BASE / "mmu-text.json",
    "금오공대":   BASE / "kumoh-text.json",
    "조선대":     BASE / "chosun-text.json",
    "원광대":     BASE / "wonkwang-text.json",
    "동의대":     BASE / "dongeui-text.json",
    "대구가톨릭": BASE / "dcu-text.json",
    "동서대":     BASE / "dongseo-text.json",
    "청주대":     BASE / "cheongju-text.json",
    "우석대":     BASE / "woosuk-text.json",
    "대전대":     BASE / "daejeonu-text.json",
    "백석대":     BASE / "baekseok-text.json",
    "선문대":     BASE / "sunmoon-text.json",
    "목원대":     BASE / "mokwon-text.json",
    "한동대":     BASE / "handong-text.json",
}

TRACKTYPE_ENUM = {"학생부위주(교과)","학생부위주(종합)","논술위주","실기/실적위주","수능위주","기타"}
PERIOD_ENUM = {"수시","정시(가)","정시(나)","정시(다)","추가","기타"}

def verify(name, path):
    data = json.loads(path.read_text(encoding="utf-8"))
    r = data["result"]
    depts = r["departments"]
    tracks = [(d, t) for d in depts for t in d["tracks"]]
    T = len(tracks)
    print(f"\n{'='*72}\n{name}  ({path.name})\n{'='*72}")
    print(f"학과(모집단위): {len(depts)}   전형(track): {T}")

    # 행합 재계산 (totalQuotaHint 기준) — 독립
    row_ok = row_fail = row_na = 0
    fails = []
    for d in depts:
        tq = d.get("totalQuotaHint")
        qsum = sum(t["quotaInitial"] for t in d["tracks"] if t["quotaInitial"] is not None)
        nnull = sum(1 for t in d["tracks"] if t["quotaInitial"] is None)
        if tq is None:
            row_na += 1
        elif qsum == tq and nnull == 0:
            row_ok += 1
        elif qsum <= tq and nnull > 0:
            # null track 존재 → 합이 작거나 같음 (정상 가능)
            row_ok += 1
        else:
            row_fail += 1
            fails.append((d["departmentName"], tq, qsum, nnull))
    print(f"행합(totalQuotaHint 대조): 통과 {row_ok} / 실패 {row_fail} / N/A(hint없음) {row_na}")
    for nm, tq, qs, nn in fails[:8]:
        print(f"   ⚠ {nm}: hint={tq} quota합={qs} null트랙={nn}")

    # 채움비율
    def cnt(f): return sum(1 for _, t in tracks if f(t))
    q_n  = cnt(lambda t: t["quotaInitial"] is not None)
    q_null = T - q_n
    r_n  = cnt(lambda t: t.get("reflectionStages"))
    c_n  = cnt(lambda t: t.get("csatMinimumRawText") is not None)
    ce_n = cnt(lambda t: t.get("csatMinimumExempt") is not None)
    sp_n = cnt(lambda t: t.get("sourcePages"))
    comp = cnt(lambda t: t["quotaInitial"] is not None and t.get("reflectionStages") and t.get("sourcePages"))
    pct = lambda n: f"{100*n//T if T else 0}%"
    print(f"채움비율 ({T}전형):")
    print(f"   quotaInitial      {q_n}/{T} ({pct(q_n)})   [null={q_null}]")
    print(f"   reflectionStages  {r_n}/{T} ({pct(r_n)})")
    print(f"   csatMinimumRawText {c_n}/{T} ({pct(c_n)})")
    print(f"   csatMinimumExempt {ce_n}/{T} ({pct(ce_n)})")
    print(f"   sourcePages       {sp_n}/{T} ({pct(sp_n)})")
    print(f"   완전레코드        {comp}/{T} ({pct(comp)})   [null-quota {q_null} 제외 시 {comp}/{T-q_null if T-q_null else 0}]")

    # enum 검증
    bad_type = Counter(t["trackTypeRaw"] for _, t in tracks if t["trackTypeRaw"] not in TRACKTYPE_ENUM)
    bad_per  = Counter(t["recruitmentPeriodRaw"] for _, t in tracks if t["recruitmentPeriodRaw"] not in PERIOD_ENUM)
    typedist = Counter(t["trackTypeRaw"] for _, t in tracks)
    print(f"trackTypeRaw 분포: {dict(typedist)}")
    if bad_type: print(f"   ❌ enum외 trackTypeRaw: {dict(bad_type)}")
    if bad_per:  print(f"   ❌ enum외 period: {dict(bad_per)}")

    # 이상치
    no_src = cnt(lambda t: not t.get("sourcePages"))
    if no_src: print(f"   ⚠ sourcePages 빈 track: {no_src}")
    # reflection components 합 검증 (stageMaxScore 없거나 100일 때 합 100 기대; 정보용)
    weird = 0
    for _, t in tracks:
        for s in (t.get("reflectionStages") or []):
            comps = s.get("components") or {}
            tot = sum(comps.values())
            mx = s.get("stageMaxScore")
            if comps and (mx is None or mx == 100) and abs(tot-100) > 0.5:
                weird += 1
    if weird: print(f"   ⓘ components 합≠100 단계(배수/원점수 표기 가능): {weird}")

    return dict(name=name, depts=len(depts), tracks=T, row_ok=row_ok, row_fail=row_fail,
                row_na=row_na, complete=comp, q_null=q_null,
                fill=dict(quota=q_n, reflect=r_n, csat=c_n, exempt=ce_n, src=sp_n),
                enum_bad=bool(bad_type or bad_per))

if __name__ == "__main__":
    summary = []
    for name, path in FILES.items():
        if not path.exists():
            print(f"\n❌ {name}: {path} 없음"); continue
        summary.append(verify(name, path))
    print(f"\n\n{'#'*72}\n# 종합\n{'#'*72}")
    tot_d = sum(s["depts"] for s in summary); tot_t = sum(s["tracks"] for s in summary)
    print(f"{'대학':<8}{'학과':>5}{'전형':>6}{'행합OK':>7}{'행합실패':>8}{'N/A':>5}{'완전':>6}{'enum':>6}")
    for s in summary:
        print(f"{s['name']:<8}{s['depts']:>5}{s['tracks']:>6}{s['row_ok']:>7}{s['row_fail']:>8}{s['row_na']:>5}{s['complete']:>6}{'OK' if not s['enum_bad'] else 'BAD':>6}")
    print(f"{'합계':<8}{tot_d:>5}{tot_t:>6}")
    anyfail = any(s["row_fail"] for s in summary) or any(s["enum_bad"] for s in summary)
    print(f"\n{'⚠ 행합 실패 또는 enum 위반 존재 — 점검 필요' if anyfail else '✅ 행합 실패 0, enum 위반 0'}")
