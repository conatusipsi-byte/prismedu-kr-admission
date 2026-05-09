/**
 * admission_results 쿼리 + cosine similarity.
 *
 * 동작:
 *   1) Firestore에서 `verified == true && outcome == "accepted"` 조건으로 합격 사례 로드
 *   2) 각 사례의 프로필 벡터를 현재 유저 벡터와 cosine similarity 계산
 *   3) similarity >= 0.5만 남기고 내림차순 정렬
 *
 * 보안:
 *   Firestore rules가 verified==true 문서만 read를 허용하므로 Admin SDK 경로에서만
 *   쿼리되도록 API 라우트에서 getAdminDb()로 호출.
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { buildProfileVector, type ProfileInput } from "./vectors";

export interface AdmissionMatch {
  id: string;
  similarity: number; // 0~1
  university: string;
  outcome: "accepted" | "rejected" | "waitlisted";
  year: number;
  gpaUnweighted: number;
  gpaWeighted: number;
  satTotal: number;
  toefl: number;
  apCount: number;
  apAverage: number;
  major: string;
  schoolType: string;
  gradYear: number;
  applicationType: string;
  ecTier: number;
  hookCategory: string;
  // Elite 전용 상세 필드 (API 라우트에서 Free/Pro에는 redact)
  activitiesSummary?: string;
  essayThemes?: string[];
  hooks?: string[];
  anonymousNote?: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface FindSimilarOptions {
  university?: string; // 특정 학교 합격자만
  limit?: number;
  minSimilarity?: number; // 기본 0.5
  outcome?: "accepted" | "rejected" | "waitlisted"; // 기본 "accepted"
}

/**
 * 사용자 프로필에 유사한 합격자 목록 조회.
 * 반환: similarity 내림차순. 빈 배열 가능.
 */
export async function findSimilarAdmissions(
  profile: ProfileInput,
  options: FindSimilarOptions = {},
): Promise<AdmissionMatch[]> {
  const { university, limit = 20, minSimilarity = 0.5, outcome = "accepted" } = options;

  const db = getAdminDb();
  let query = db
    .collection("admission_results")
    .where("verified", "==", true)
    .where("outcome", "==", outcome);

  if (university) {
    query = query.where("university", "==", university);
  }

  const snap = await query.get();
  if (snap.empty) return [];

  const userVec = buildProfileVector(profile);

  const matches: AdmissionMatch[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const candidateVec = buildProfileVector({
      gpaUnweighted: data.gpaUnweighted,
      gpaWeighted: data.gpaWeighted,
      satTotal: data.satTotal,
      toefl: data.toefl,
      apCount: data.apCount,
      apAverage: data.apAverage,
      major: data.major,
    });
    const sim = cosineSimilarity(userVec, candidateVec);
    if (sim < minSimilarity) continue;

    matches.push({
      id: doc.id,
      similarity: sim,
      university: data.university ?? "",
      outcome: data.outcome ?? "accepted",
      year: data.year ?? 0,
      gpaUnweighted: data.gpaUnweighted ?? 0,
      gpaWeighted: data.gpaWeighted ?? 0,
      satTotal: data.satTotal ?? 0,
      toefl: data.toefl ?? 0,
      apCount: data.apCount ?? 0,
      apAverage: data.apAverage ?? 0,
      major: data.major ?? "",
      schoolType: data.schoolType ?? "",
      gradYear: data.gradYear ?? 0,
      applicationType: data.applicationType ?? "",
      ecTier: data.ecTier ?? 0,
      hookCategory: data.hookCategory ?? "",
      activitiesSummary: data.activitiesSummary,
      essayThemes: data.essayThemes,
      hooks: data.hooks,
      anonymousNote: data.anonymousNote,
    });
  }

  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, limit);
}

/**
 * verified 합격 seed 총 개수. 카드 최소 노출 기준(5건) 판정용.
 */
export async function countVerifiedAdmissions(): Promise<number> {
  const db = getAdminDb();
  const snap = await db
    .collection("admission_results")
    .where("verified", "==", true)
    .where("outcome", "==", "accepted")
    .count()
    .get();
  return snap.data().count;
}
