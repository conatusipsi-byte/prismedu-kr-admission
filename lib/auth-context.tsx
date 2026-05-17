"use client";

/**
 * Auth context — Supabase Auth 기반 (Firebase 마이그레이션 후).
 *
 * 인터페이스 유지 (6개 consumer 호환):
 *   useAuth() → { user, profile, loading, isMaster, login*, logout, saveProfile, ... }
 *
 * Supabase 변경점:
 *   - Firebase User → Supabase User (id, email 위주 사용)
 *   - Firestore users/{uid} → profiles 테이블 (id = user.id)
 *   - onSnapshot 실시간 구독 → onAuthStateChange + 명시적 refetch
 *   - Kakao Custom Token → Supabase OAuth signInWithOAuth
 *   - Apple/Google → Supabase OAuth signInWithOAuth
 */

import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { PlanType, BillingCycle } from "./plans";
import type { KrSpecsInput as Specs } from "./schemas/api/match";
import { STORAGE_KEYS } from "./storage-keys";
import { fetchWithAuth } from "./api-client";
import { logError } from "./log";

const SPECS_LS_KEY = "prism_specs";
const SNAPSHOT_KEY = "prism_snapshots";

export interface UserProfile {
  name: string;
  grade: string;
  dreamSchool: string;
  major: string;
  photoURL?: string;
  onboarded: boolean;
  plan?: PlanType;
  planBilling?: BillingCycle;
  planActivatedAt?: string;
  lastPayment?: {
    orderId: string;
    totalAmount: number;
    method?: string;
    approvedAt?: string;
  };
  aiChatCount?: number;
  aiChatDate?: string;
  gpa?: string;
  sat?: string;
  toefl?: string;
  outlineUsed?: number;
  essayReviewUsed?: number;
  whatIfUsed?: number;
  favoriteSchools?: string[];
  specLastUpdated?: string;
  specs?: Specs;
  snapshots?: ProfileSnapshot[];
  notificationOptIn?: boolean;
}

export interface ProfileSnapshot {
  date: string;
  gpa?: string;
  sat?: string;
  toefl?: string;
  major?: string;
  dreamSchool?: string;
  dreamSchoolProb?: number;
  reach?: number;
  target?: number;
  safety?: number;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isMaster: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loginWithKakao: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => void;
  saveProfile: (data: Partial<UserProfile>) => Promise<void>;
  snapshots: ProfileSnapshot[];
  toggleFavorite: (schoolName: string) => Promise<void>;
  isFavorite: (schoolName: string) => boolean;
}

function loadSnapshots(): ProfileSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(SNAPSHOT_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveSnapshot(profile: UserProfile, prev: UserProfile | null): ProfileSnapshot[] | null {
  const specChanged =
    profile.gpa !== prev?.gpa ||
    profile.sat !== prev?.sat ||
    profile.toefl !== prev?.toefl ||
    profile.major !== prev?.major;
  if (!specChanged || (!profile.gpa && !profile.sat)) return null;

  const today = new Date().toISOString().split("T")[0];
  const snaps = loadSnapshots();
  const filtered = snaps.filter(s => s.date !== today);
  filtered.push({
    date: today,
    gpa: profile.gpa,
    sat: profile.sat,
    toefl: profile.toefl,
    major: profile.major,
    dreamSchool: profile.dreamSchool,
  });
  const trimmed = filtered.slice(-20);
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(trimmed)); } catch {}
  return trimmed;
}

/**
 * profiles row → UserProfile 형식 매핑 (snake_case → camelCase + null 처리).
 */
interface ProfileRow {
  id: string;
  email: string | null;
  name: string;
  photo_url: string | null;
  grade: string;
  dream_school: string;
  major: string;
  gpa: string | null;
  sat: string | null;
  toefl: string | null;
  favorite_schools: string[] | null;
  snapshots: ProfileSnapshot[] | null;
  ai_chat_count: number;
  ai_chat_date: string | null;
  outline_used: number;
  essay_review_used: number;
  what_if_used: number;
  onboarded: boolean;
  notification_opt_in: boolean;
  spec_last_updated: string | null;
}

function mapRowToProfile(row: ProfileRow): UserProfile {
  return {
    name: row.name,
    grade: row.grade,
    dreamSchool: row.dream_school,
    major: row.major,
    photoURL: row.photo_url ?? undefined,
    onboarded: row.onboarded,
    gpa: row.gpa ?? undefined,
    sat: row.sat ?? undefined,
    toefl: row.toefl ?? undefined,
    aiChatCount: row.ai_chat_count,
    aiChatDate: row.ai_chat_date ?? undefined,
    outlineUsed: row.outline_used,
    essayReviewUsed: row.essay_review_used,
    whatIfUsed: row.what_if_used,
    favoriteSchools: row.favorite_schools ?? [],
    snapshots: row.snapshots ?? [],
    notificationOptIn: row.notification_opt_in,
    specLastUpdated: row.spec_last_updated ?? undefined,
  };
}

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<ProfileSnapshot[]>(loadSnapshots);
  const [isMaster, setIsMaster] = useState(false);
  const isMasterRef = useRef(false);
  isMasterRef.current = isMaster;
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;

  const refetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle<ProfileRow>();
    if (error) {
      logError("[auth] profile fetch error:", error.message);
      return null;
    }
    if (!data) return null;
    const p = mapRowToProfile(data);
    // Master account → force elite plan in-memory (서버 판정 결과 기반)
    if (isMasterRef.current) p.plan = "elite";
    setProfile(p);
    if (data.snapshots && Array.isArray(data.snapshots) && typeof window !== "undefined") {
      try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data.snapshots)); } catch {}
      setSnapshots(data.snapshots);
    }
    return p;
  }, []);

  useEffect(() => {
    // 초기 세션 로드
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchWithAuth<{ isMaster: boolean }>("/api/auth/session")
          .then((d) => setIsMaster(!!d.isMaster))
          .catch(() => setIsMaster(false));
        refetchProfile(u.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Auth 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) {
        setProfile(null);
        setIsMaster(false);
        setLoading(false);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        fetchWithAuth<{ isMaster: boolean }>("/api/auth/session")
          .then((d) => setIsMaster(!!d.isMaster))
          .catch(() => setIsMaster(false));
        refetchProfile(u.id).finally(() => setLoading(false));
      }
    });

    return () => subscription.unsubscribe();
  }, [refetchProfile]);

  // isMaster 가 뒤늦게 true 면 plan 을 in-memory 로 elite 덮기
  useEffect(() => {
    if (!isMaster) return;
    setProfile(prev => (prev && prev.plan !== "elite" ? { ...prev, plan: "elite" } : prev));
  }, [isMaster]);

  /* ═══════════════════════════════════════════════════════════════════
     로그인 메서드
     ═══════════════════════════════════════════════════════════════════ */

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  };

  const loginWithApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  };

  const loginWithKakao = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    // profiles 자동 생성 트리거가 동작. 이후 onAuthStateChange 가 SIGNED_IN 이벤트 발사.
  };

  const loginWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) throw error;
  };

  /* ═══════════════════════════════════════════════════════════════════
     로그아웃 — localStorage / sessionStorage / 서버 세션 모두 정리
     ═══════════════════════════════════════════════════════════════════ */

  const logout = async () => {
    setProfile(null);
    setSnapshots([]);
    try {
      const userDataKeys = [
        STORAGE_KEYS.SPECS,
        STORAGE_KEYS.SNAPSHOTS,
        STORAGE_KEYS.ESSAYS,
        STORAGE_KEYS.TASKS,
        STORAGE_KEYS.CHAT_HISTORY,
        STORAGE_KEYS.ESSAY_REVIEW_DRAFT,
        STORAGE_KEYS.SPEC_ANALYSIS_CACHE,
        STORAGE_KEYS.ANALYSIS_SORT,
        STORAGE_KEYS.DASHBOARD_TOUR_SEEN,
        STORAGE_KEYS.WHAT_IF_FOCUS,
        "prism_saved_specs",
        "prism_spec_analysis_inline",
      ];
      for (const key of userDataKeys) localStorage.removeItem(key);
    } catch {}
    try {
      const ssKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k) continue;
        if (k.startsWith("prism_") || k.startsWith("logo_cache_") || k.startsWith("campus_cache_")) {
          ssKeys.push(k);
        }
      }
      for (const k of ssKeys) sessionStorage.removeItem(k);
    } catch {}
    try {
      const { error } = await supabase.auth.signOut();
      if (error) logError("[auth] signOut failed:", error.message);
    } catch (e) {
      logError("[auth] signOut throw:", e);
    }
    window.location.href = "/";
  };

  /* ═══════════════════════════════════════════════════════════════════
     프로필 저장 — profiles UPDATE (RLS 가 자기 row 만 허용)
     ═══════════════════════════════════════════════════════════════════ */

  const saveProfile = useCallback(async (data: Partial<UserProfile>) => {
    const prev = profileRef.current;
    const merged = { ...prev, ...data, onboarded: true } as UserProfile;
    if (isMasterRef.current) merged.plan = "elite";

    if (user) {
      // 보호 필드 (plan/usage 등) 는 서버 service_role 만 갱신. 클라 update 에서 누락.
      const update = {
        name: merged.name,
        grade: merged.grade,
        dream_school: merged.dreamSchool,
        major: merged.major,
        gpa: merged.gpa ?? null,
        sat: merged.sat ?? null,
        toefl: merged.toefl ?? null,
        favorite_schools: merged.favoriteSchools ?? [],
        onboarded: merged.onboarded,
        notification_opt_in: merged.notificationOptIn ?? false,
        spec_last_updated: merged.specLastUpdated ?? null,
      };
      try {
        const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
        if (error) logError("[auth] profile update:", error.message);
      } catch (e) {
        logError("[auth] profile update threw:", e);
      }
    }

    const newSnaps = saveSnapshot(merged, prev);
    if (newSnaps) {
      setSnapshots(newSnaps);
      if (user) {
        supabase
          .from("profiles")
          .update({ snapshots: newSnaps })
          .eq("id", user.id)
          .then(({ error }) => { if (error) logError("[auth] snapshot sync:", error.message); });
      }
    }
    setProfile(merged);
  }, [user]);

  /* ═══════════════════════════════════════════════════════════════════
     즐겨찾기 토글
     ═══════════════════════════════════════════════════════════════════ */

  const favPendingRef = useRef<Promise<void>>(Promise.resolve());
  const toggleFavorite = async (schoolName: string) => {
    const prev = favPendingRef.current;
    const next = prev.then(async () => {
      const current = profileRef.current?.favoriteSchools || [];
      const updated = current.includes(schoolName)
        ? current.filter(s => s !== schoolName)
        : [...current, schoolName];
      await saveProfile({ favoriteSchools: updated });
    });
    favPendingRef.current = next;
    return next;
  };

  const isFavorite = (schoolName: string) => {
    return (profile?.favoriteSchools || []).includes(schoolName);
  };

  // SPECS_LS_KEY는 future-proof reference — specs 이 별도 user_specs 테이블로 옮겨가면 사용됨.
  void SPECS_LS_KEY;

  return (
    <AuthContext.Provider value={{
      user, profile, loading, isMaster,
      loginWithGoogle, loginWithEmail, signUpWithEmail, resetPassword, loginWithKakao, loginWithApple,
      logout, saveProfile, snapshots, toggleFavorite, isFavorite,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
