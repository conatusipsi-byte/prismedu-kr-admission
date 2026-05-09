/**
 * /admin/users mock 데이터 — Firestore 비어있을 때 dev fallback
 */

export interface AdminUserItem {
  uid: string;
  email: string;
  name: string;
  plan: "free" | "pro" | "elite";
  provider: string;
  /** Firebase Auth disabled 플래그 — 로그인 차단 */
  disabled: boolean;
  /** admins/{uid}.active=true 인 사용자 (master) */
  isMaster: boolean;
  /** ms since epoch */
  createdAtMs: number;
  /** 마지막 활동 (없으면 createdAt) */
  lastActiveMs?: number;
  photoURL?: string;
}

export interface AdminUsersSummary {
  total: number;
  byPlan: { free: number; pro: number; elite: number };
  disabled: number;
  master: number;
}

const NOW = Date.now();
const DAY = 24 * 3600_000;

export const MOCK_USERS: AdminUserItem[] = [
  {
    uid: "uid_admin_001",
    email: "admin@conatusipsi.com",
    name: "운영자",
    plan: "elite",
    provider: "google.com",
    disabled: false,
    isMaster: true,
    createdAtMs: NOW - 30 * DAY,
    lastActiveMs: NOW - 2 * 3600_000,
  },
  {
    uid: "uid_user_001",
    email: "student1@example.com",
    name: "김학생",
    plan: "pro",
    provider: "kakao",
    disabled: false,
    isMaster: false,
    createdAtMs: NOW - 14 * DAY,
    lastActiveMs: NOW - 1 * DAY,
  },
  {
    uid: "uid_user_002",
    email: "student2@example.com",
    name: "이학생",
    plan: "free",
    provider: "google.com",
    disabled: false,
    isMaster: false,
    createdAtMs: NOW - 5 * DAY,
    lastActiveMs: NOW - 6 * 3600_000,
  },
  {
    uid: "uid_user_003",
    email: "abuser@example.com",
    name: "차단된 사용자",
    plan: "free",
    provider: "password",
    disabled: true,
    isMaster: false,
    createdAtMs: NOW - 3 * DAY,
  },
  {
    uid: "uid_user_004",
    email: "parent@example.com",
    name: "박학부모",
    plan: "elite",
    provider: "kakao",
    disabled: false,
    isMaster: false,
    createdAtMs: NOW - 20 * DAY,
    lastActiveMs: NOW - 30 * 60_000,
  },
];

export function listMockUsers(filter: {
  q?: string;
  plan?: "free" | "pro" | "elite" | "all";
  status?: "active" | "disabled" | "all";
  masterOnly?: boolean;
}): AdminUserItem[] {
  let out = MOCK_USERS.slice();
  if (filter.q) {
    const q = filter.q.toLowerCase();
    out = out.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q),
    );
  }
  if (filter.plan && filter.plan !== "all") {
    out = out.filter((u) => u.plan === filter.plan);
  }
  if (filter.status === "active") out = out.filter((u) => !u.disabled);
  else if (filter.status === "disabled") out = out.filter((u) => u.disabled);
  if (filter.masterOnly) out = out.filter((u) => u.isMaster);
  return out;
}

export function summarizeUsers(items: AdminUserItem[]): AdminUsersSummary {
  const summary: AdminUsersSummary = {
    total: items.length,
    byPlan: { free: 0, pro: 0, elite: 0 },
    disabled: 0,
    master: 0,
  };
  for (const u of items) {
    summary.byPlan[u.plan] += 1;
    if (u.disabled) summary.disabled += 1;
    if (u.isMaster) summary.master += 1;
  }
  return summary;
}
