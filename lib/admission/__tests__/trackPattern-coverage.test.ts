/**
 * trackPattern 어휘 커버리지 회귀 테스트
 *
 * 결정 (operations.md §6.4 ETL 분류기 어휘 점검):
 *   매년 7~9월 ETL 시즌 시작 전, 그 해 모집요강에서 추출한 ○○계열 표현이
 *   분류기의 TRACK_PATTERN_VOCAB 으로 모두 커버되는지 검증한다.
 *   미커버 표현이 있으면 분류기가 conditional 분기를 놓쳐 자동판정 오분류
 *   인시던트(operations.md §8.2)가 발생할 수 있다 → 머지 게이트.
 *
 * 운영 워크플로:
 *   1. fixtures/sample-min-reqs.ts 를 그 해 모집요강 패턴으로 갱신
 *   2. 본 테스트 실행
 *   3. 미커버 계열명이 출력되면 lib/admission/min-req-classifier.ts 의
 *      TRACK_PATTERN_VOCAB 에 추가 + 분류기 회귀 테스트 케이스 추가
 *   4. 본 테스트 통과 확인 후 PR 머지
 */

import { describe, it, expect } from "vitest";
import {
  TRACK_PATTERN_VOCAB,
  classifyMinReq,
} from "../min-req-classifier";
import { SAMPLE_MIN_REQS } from "./fixtures/sample-min-reqs";
import type { CsatArea, CsatMinimum } from "@/types/admission";

/**
 * fixture 텍스트에서 ○○계열 표현을 모두 추출.
 *
 * 정규식 설계:
 *   - [가-힣]{2,6}: 한글 2~6자 (계열명은 보통 2~5자, 안전 마진 6)
 *   - 계열
 *   - lookahead 미사용 — "인문계열로", "인문계열의", "인문계열에" 같이 한국어
 *     조사·어미가 따라오는 케이스도 매칭. 합성어 "계열별/계열적" 은 별도
 *     conditionalKeywords 가 우선 처리.
 */
const TRACK_NAME_EXTRACT = /([가-힣]{2,6})계열/g;

interface UncoveredHit {
  fixtureId: number;
  text: string;
  trackName: string;
}

function extractTrackNames(text: string): string[] {
  // 매번 새 RegExp 인스턴스로 lastIndex 누적 회피 (matchAll은 안전하지만 보수적으로)
  const re = new RegExp(TRACK_NAME_EXTRACT.source, TRACK_NAME_EXTRACT.flags);
  return [...text.matchAll(re)].map((m) => m[1]);
}

function isCovered(trackName: string): boolean {
  return (TRACK_PATTERN_VOCAB as readonly string[]).includes(trackName);
}

/* ═══════════════════════════════════════════════════════════════════════
   1. 어휘 커버리지 — 핵심 게이트
   ═══════════════════════════════════════════════════════════════════════ */

describe("trackPattern 어휘 커버리지", () => {
  it("fixture가 100건 이상이다", () => {
    expect(SAMPLE_MIN_REQS.length).toBeGreaterThanOrEqual(100);
  });

  it("모든 fixture에서 등장한 ○○계열 표현이 TRACK_PATTERN_VOCAB 에 포함된다", () => {
    const uncovered: UncoveredHit[] = [];

    for (const sample of SAMPLE_MIN_REQS) {
      const tracks = extractTrackNames(sample.text);
      for (const trackName of tracks) {
        if (!isCovered(trackName)) {
          uncovered.push({ fixtureId: sample.id, text: sample.text, trackName });
        }
      }
    }

    if (uncovered.length > 0) {
      const summary = uncovered
        .map((u) => `  - fixture #${u.fixtureId}: "${u.trackName}계열" — "${u.text}"`)
        .join("\n");
      const uniqueNames = Array.from(new Set(uncovered.map((u) => u.trackName)));

      throw new Error(
        `\n🚨 trackPattern 어휘 미커버 ${uncovered.length}건 발견 (${uniqueNames.length}개 고유 계열명):\n` +
        `${summary}\n\n` +
        `대응:\n` +
        `  1. lib/admission/min-req-classifier.ts 의 TRACK_PATTERN_VOCAB 에 다음 추가:\n` +
        `     ${uniqueNames.map((n) => `"${n}"`).join(", ")}\n` +
        `  2. min-req-classifier.test.ts 에 conditional 분류 회귀 케이스 추가\n` +
        `  3. operations.md §6.4 점검 결과 GitHub issue 갱신\n`,
      );
    }
  });

  it("TRACK_PATTERN_VOCAB 의 모든 어휘가 fixture에 최소 1건 등장한다 (사어 방지)", () => {
    const seen = new Set<string>();
    for (const sample of SAMPLE_MIN_REQS) {
      for (const t of extractTrackNames(sample.text)) seen.add(t);
    }
    const unused = TRACK_PATTERN_VOCAB.filter((v) => !seen.has(v));
    expect(unused, `fixture에 한 번도 등장 안 하는 어휘: ${unused.join(", ")}`).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. 분류 정합성 — 다중 계열 fixture는 conditional 로 분류
   ═══════════════════════════════════════════════════════════════════════ */

describe("trackPattern 어휘 → 분류기 통합", () => {
  it("expectedTracks가 2개 이상인 fixture는 분류기가 conditional 로 분류", () => {
    const multiTrackSamples = SAMPLE_MIN_REQS.filter((s) => s.expectedTracks.length >= 2);
    expect(multiTrackSamples.length).toBeGreaterThanOrEqual(5);

    for (const sample of multiTrackSamples) {
      const min: Omit<CsatMinimum, "complexity" | "autoEvaluable"> = {
        candidateAreas: ["korean", "math", "english", "investigation"] as CsatArea[],
        requiredCount: 3,
        sumGradeMax: 6,
        originalText: sample.text,
      };
      const result = classifyMinReq(min);
      expect(
        result,
        `fixture #${sample.id} "${sample.text}" 는 conditional 이어야 하는데 ${result} 반환`,
      ).toBe("conditional");
    }
  });

  it("expectedTracks가 정확히 1개인 fixture는 conditional 로 빠지지 않는다 (단일 계열은 학과 분류 표시일 뿐)", () => {
    // 단, 텍스트에 다른 키워드("한해"·"한정" 등)가 있으면 conditional 로 빠질 수 있음 — 예외 허용.
    const singleTrackSamples = SAMPLE_MIN_REQS.filter((s) => s.expectedTracks.length === 1);

    for (const sample of singleTrackSamples) {
      const min: Omit<CsatMinimum, "complexity" | "autoEvaluable"> = {
        candidateAreas: ["korean", "math", "english", "investigation"] as CsatArea[],
        requiredCount: 3,
        sumGradeMax: 6,
        originalText: sample.text,
      };
      const result = classifyMinReq(min);

      // 단일 계열이면서 conditional 키워드("한해"·"한정"·"별도"·"전공별"·"차등"·"계열별")가 없으면
      // conditional 로 빠지지 않아야 함.
      const hasConditionalKeyword = /(한해|한정|전공별|차등|계열별)/.test(sample.text);
      if (!hasConditionalKeyword) {
        expect(
          result,
          `fixture #${sample.id} "${sample.text}" 는 단일 계열 + conditional 키워드 없음 → conditional 아니어야 함`,
        ).not.toBe("conditional");
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. expectedTracks 메타데이터 정합성
   ═══════════════════════════════════════════════════════════════════════ */

describe("fixture 메타데이터 정합성", () => {
  it("각 fixture의 expectedTracks가 실제 텍스트에서 추출되는 ○○계열 명과 일치한다", () => {
    const mismatches: Array<{ id: number; expected: string[]; actual: string[]; text: string; bytes: string }> = [];

    for (const sample of SAMPLE_MIN_REQS) {
      const actual = Array.from(new Set(extractTrackNames(sample.text)));
      const expected = Array.from(new Set(sample.expectedTracks));

      // 순서 무관 비교
      const e = [...expected].sort();
      const a = [...actual].sort();
      if (JSON.stringify(e) !== JSON.stringify(a)) {
        const bytes = Array.from(sample.text).map((c) => c.charCodeAt(0).toString(16)).join(" ");
        mismatches.push({ id: sample.id, expected: e, actual: a, text: sample.text, bytes });
      }
    }

    if (mismatches.length > 0) {
      const summary = mismatches
        .slice(0, 3)
        .map((m) =>
          `  fixture #${m.id}: expected=[${m.expected.join(",")}] actual=[${m.actual.join(",")}]\n` +
          `    text: ${JSON.stringify(m.text)}\n` +
          `    chars: ${m.bytes}`)
        .join("\n");
      throw new Error(`fixture expectedTracks 불일치 ${mismatches.length}건:\n${summary}`);
    }
  });
});
