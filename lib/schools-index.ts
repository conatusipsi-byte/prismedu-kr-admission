/**
 * 클라이언트용 학교 인덱스 — 가벼운 메타데이터만 포함.
 *
 * 검색·picker·로고 표시 등 UI 용도. 합격 예측·상세 정보는
 * /api/match 또는 /api/schools/{name} 통해 서버에서 가져옴.
 *
 * **초기 번들 경량화**: JSON(~200KB)을 dynamic import로 분리해
 * 첫 JS 페이로드에 포함되지 않도록 한다. 실제 검색 UI가 마운트될 때만 로드.
 *
 * 빌드: node scripts/build-schools-index.mjs
 */
"use client";

import { useEffect, useState } from "react";
export { schoolMatchesQuery } from "./school-search";

export interface SchoolIndex {
  n: string;
  d: string;       // logo domain
  c: string;       // brand color
  rk: number;      // US News rank
  loc?: string;
  tg?: string[];
  ea?: string;     // Early action deadline
  rd?: string;     // Regular decision deadline
  sat?: number[];
  gpa?: number;
  r?: number;      // acceptance rate
  tuition?: number;
  setting?: string;
  size?: number;
}

// Single-flight cache: 여러 consumer가 동시에 마운트돼도 한 번만 import.
let cache: SchoolIndex[] | null = null;
let inflight: Promise<SchoolIndex[]> | null = null;

export async function loadSchoolsIndex(): Promise<SchoolIndex[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = import("@/data/schools-index.json").then((m) => {
    cache = (m.default ?? m) as unknown as SchoolIndex[];
    return cache;
  });
  return inflight;
}

/**
 * React 훅 — mount 시 async load, load 완료 후 배열 반환.
 * 미로드 상태는 빈 배열. (consumer가 "아직 검색 결과 없음" UX로 자연스럽게 처리)
 */
export function useSchoolsIndex(): SchoolIndex[] {
  const [list, setList] = useState<SchoolIndex[]>(cache ?? []);
  useEffect(() => {
    if (cache) {
      if (list !== cache) setList(cache);
      return;
    }
    let cancelled = false;
    loadSchoolsIndex().then((data) => {
      if (!cancelled) setList(data);
    });
    return () => { cancelled = true; };
    // list는 ref-check 용도라 deps에 포함 X (초기 한번만 로드)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return list;
}
