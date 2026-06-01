/**
 * 회귀 가드 (P2 3-3 / BUG-019): search_admissions_v2 는 KCUE 메타 placeholder 학과
 * (기타(소속학과없음)·기타모집단위 등, 운영 DB 에 active 만 ~457개)를 검색에서 제외해야 한다.
 * 제외절 `d.name NOT ILIKE '기타%'` 가 SQL 주석으로만 있고 테스트가 없어, 향후 RPC
 * 재정의(CREATE OR REPLACE) 시 누락될 위험이 있었음. 이 테스트는 RPC 를 정의/치환하는
 * 모든 마이그레이션에 제외절이 살아있는지 검사한다 — 누락된 재정의가 추가되면 실패.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIG_DIR = path.resolve(process.cwd(), "supabase/migrations");

function migrationsDefiningSearchV2(): string[] {
  return fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /function\s+(?:public\.)?search_admissions_v2/i.test(fs.readFileSync(path.join(MIG_DIR, f), "utf8")));
}

describe("search_admissions_v2 기타* 제외 (BUG-019)", () => {
  it("RPC 를 정의/치환하는 마이그레이션이 최소 1개 존재", () => {
    expect(migrationsDefiningSearchV2().length).toBeGreaterThan(0);
  });

  it("정의/치환 마이그레이션마다 '기타%' 제외절(NOT ILIKE '기타%')이 있다", () => {
    for (const f of migrationsDefiningSearchV2()) {
      const sql = fs.readFileSync(path.join(MIG_DIR, f), "utf8");
      expect(sql, `${f} 에 기타* placeholder 제외절 누락 — BUG-019 회귀`).toMatch(
        /NOT\s+ILIKE\s+'기타%'/i,
      );
    }
  });
});
