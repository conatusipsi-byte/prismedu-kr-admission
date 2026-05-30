/**
 * korea-text.json 의 result 를 실제 PdfAnalysisResultSchema(zod) 로 검증.
 *   npx tsx scripts/etl/text-extract-test/validate-schema.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PdfAnalysisResultSchema } from "../pdf-vision/types";

const p = path.resolve("scripts/etl/text-extract-test/korea-text.json");
const data = JSON.parse(fs.readFileSync(p, "utf8"));
const parsed = PdfAnalysisResultSchema.safeParse(data.result);

if (parsed.success) {
  const r = parsed.data;
  const tracks = r.departments.flatMap((d) => d.tracks);
  console.log("✅ Zod 스키마 검증 통과 (PdfAnalysisResultSchema)");
  console.log(`   universityName=${r.universityName} year=${r.year} season=${r.recruitmentSeason}`);
  console.log(`   departments=${r.departments.length} tracks=${tracks.length} warnings=${r.warnings.length}`);
  // trackTypeRaw / recruitmentPeriodRaw enum 분포
  const byType: Record<string, number> = {};
  for (const t of tracks) byType[t.trackTypeRaw] = (byType[t.trackTypeRaw] ?? 0) + 1;
  console.log("   trackTypeRaw 분포:", JSON.stringify(byType, null, 0));
} else {
  console.log("❌ Zod 스키마 검증 실패");
  console.log(JSON.stringify(parsed.error.issues.slice(0, 20), null, 2));
  process.exit(1);
}
