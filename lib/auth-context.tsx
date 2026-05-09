"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import {
  onAuthStateChanged, signInWithPopup, signOut, signInWithCustomToken,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail,
  User,
} from "firebase/auth";
import { auth, googleProvider, appleProvider, db } from "./firebase";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import type { PlanType, BillingCycle } from "./plans";
// matchSchools는 server-only. snapshot 생성 시 dreamProb·catCounts는
// 사용자가 분석 페이지에서 본 결과를 별도 채널로 전달받거나 생략한다.
// (이 파일은 client-side context이므로 server-only 모듈을 import할 수 없음)
// Specs 타입은 type-only import — 번들에 영향 없음
import type { Specs } from "./matching";
import { STORAGE_KEYS } from "./storage-keys";
import { fetchWithAuth } from "./api-client";
import { logError } from "./log";

const SPECS_LS_KEY = "prism_specs";

export interface UserProfile {
  name: string;
  grade: string;
  dreamSchool: string;
  major: string;
  photoURL?: string;
  onboarded: boolean;
  plan?: PlanType;
  // 서버 Admin SDK가 갱신 — Firestore 규칙이 클라이언트 write 차단
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
  /** 입시 D-Day 이메일 알림 수신 여부. UserProfileUpdateSchema와 정합. */
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

/* Master account: 서버 전용 판정. 클라이언트는 `/api/auth/session`이 내려주는 `isMaster`만 신뢰. */

const SNAPSHOT_KEY = "prism_snapshots";

function loadSnapshots(): ProfileSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(SNAPSHOT_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

/** 스펙 변경 시 스냅샷 저장. 변경이 있으면 trimmed 배열 반환, 없으면 null. */
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

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<ProfileSnapshot[]>(loadSnapshots);
  // 서버 단일 판정. onAuthStateChanged 후 /api/auth/session 응답으로 갱신.
  const [isMaster, setIsMaster] = useState(false);
  const isMasterRef = useRef(false);
  isMasterRef.current = isMaster;

  // profile을 ref로도 추적해 useCallback 안정화 — saveProfile이 profile 바뀔 때마다
  // 새 참조로 재생성되면 consumer effect가 strict deps를 쓸 수 없어(무한 루프) eslint-disable을
  // 강요받음. ref 패턴으로 saveProfile을 user deps만으로 안정화.
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;

  // profile onSnapshot unsub을 ref로 노출 — logout()이 signOut 이전에 직접 해제해
  // in-flight snapshot 콜백이 방금 비운 localStorage를 재오염하지 못하게 한다.
  const profileUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cleanup = () => {
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
    };

    const masterFallback = (u: User): UserProfile => ({
      name: u.displayName || "Master", grade: "", dreamSchool: "", major: "", onboarded: false, plan: "elite",
    });

    const unsub = onAuthStateChanged(auth, (u) => {
      cleanup(); // 이전 사용자의 profile 구독 해제
      setUser(u);

      if (!u) {
        setProfile(null);
        setIsMaster(false);
        setLoading(false);
        return;
      }

      // 서버 단일 판정 — 이메일 목록은 서버 env에만 존재. 실패하면 false로 간주(안전 방향).
      fetchWithAuth<{ isMaster: boolean }>("/api/auth/session")
        .then((d) => setIsMaster(!!d.isMaster))
        .catch(() => setIsMaster(false));

      // 실시간 profile 구독 — 다른 탭/기기의 변경이 즉시 반영됨
      profileUnsubRef.current = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            // Master account → force elite with unlimited usage (서버 판정 결과 기반)
            if (isMasterRef.current) {
              data.plan = "elite";
            }
            setProfile(data);
            // Sync Firestore specs → localStorage cache (cross-device hydration)
            if (data.specs && typeof window !== "undefined") {
              try { localStorage.setItem(SPECS_LS_KEY, JSON.stringify(data.specs)); } catch {}
            }
            // Sync Firestore snapshots → localStorage + state (cross-device)
            if (data.snapshots && Array.isArray(data.snapshots) && typeof window !== "undefined") {
              try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data.snapshots)); } catch {}
              setSnapshots(data.snapshots);
            }
          } else if (isMasterRef.current) {
            setProfile(masterFallback(u));
          }
          setLoading(false);
        },
        (err) => {
          logError("[auth] profile snapshot error:", err);
          // Firestore unavailable — still grant master access
          if (isMasterRef.current) {
            setProfile(masterFallback(u));
          }
          setLoading(false);
        }
      );
    });

    return () => {
      cleanup();
      unsub();
    };
  }, []);

  // isMaster가 뒤늦게 true가 된 경우에도 현재 profile.plan을 elite로 덮어쓰기.
  // onSnapshot은 문서 변경 시에만 재실행되므로 이 effect가 없으면 첫 로드
  // 타이밍에 따라 Free가 고정됨.
  useEffect(() => {
    if (!isMaster) return;
    setProfile(prev => (prev && prev.plan !== "elite" ? { ...prev, plan: "elite" } : prev));
  }, [isMaster]);

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    // Initialize profile in Firestore (plan은 클라이언트가 쓰지 못하도록 firestore.rules가 차단 →
    // 누락 시 서버 사이드에서 'free'로 기본값 처리됨)
    await setDoc(doc(db, "users", credential.user.uid), {
      name,
      grade: "",
      dreamSchool: "",
      major: "",
      onboarded: false,
    }, { merge: true });
  };

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const loginWithKakao = async () => {
    // Kakao login via REST API → Firebase custom token.
    // 팝업으로 Kakao OAuth 열고, callback 라우트가 postMessage로 customToken 전달 → signInWithCustomToken.
    const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    if (!KAKAO_CLIENT_ID) {
      throw new Error("카카오 로그인이 아직 설정되지 않았습니다.");
    }

    // CSRF 방어: 랜덤 state를 sessionStorage에 저장 → callback popup이 되돌려준 state와 대조.
    // 공격자가 피해자 브라우저에 다른 Kakao code를 심어도 state 불일치로 차단됨.
    const state =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2);
    try {
      sessionStorage.setItem("prism_kakao_state", state);
    } catch {}

    const redirectUri = `${window.location.origin}/api/auth/kakao/callback`;
    const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;

    const popup = window.open(kakaoAuthUrl, "kakao-login", "width=480,height=700");
    if (!popup) {
      throw new Error("팝업이 차단되었어요. 팝업 차단을 해제하고 다시 시도해주세요.");
    }

    // 같은 origin의 콜백 페이지만 신뢰 — 다른 origin의 위장 메시지 차단
    const expectedOrigin = window.location.origin;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let popupWatchId: ReturnType<typeof setInterval> | null = null;

      // Single cleanup path — 성공/실패/타임아웃/취소 모든 경로에서 호출.
      // settled 가드로 멱등성 보장 → 여러 번 호출돼도 안전.
      const cleanup = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", handleMessage);
        if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
        if (popupWatchId !== null) { clearInterval(popupWatchId); popupWatchId = null; }
        if (popup && !popup.closed) {
          try { popup.close(); } catch { /* cross-origin 접근 등 */ }
        }
        try { sessionStorage.removeItem("prism_kakao_state"); } catch {}
      };

      const handleMessage = async (event: MessageEvent) => {
        if (settled) return;
        if (event.origin !== expectedOrigin) return;
        if (event.data?.type !== "kakao-login-success" && event.data?.type !== "kakao-login-error") return;

        // CSRF state 검증 — 세션에 저장된 값과 대조. 다르면 공격자가 심은 code일 수 있음.
        let expectedState = "";
        try { expectedState = sessionStorage.getItem("prism_kakao_state") || ""; } catch {}
        if (!expectedState || event.data.state !== expectedState) {
          cleanup();
          reject(new Error("카카오 로그인 보안 검증에 실패했어요. 다시 시도해주세요."));
          return;
        }

        if (event.data.type === "kakao-login-success" && event.data.customToken) {
          const token = event.data.customToken;
          cleanup();
          try {
            await signInWithCustomToken(auth, token);
            resolve();
          } catch (e) {
            reject(e);
          }
        } else if (event.data.type === "kakao-login-error") {
          cleanup();
          reject(new Error(event.data.error || "카카오 로그인 실패"));
        }
      };
      window.addEventListener("message", handleMessage);

      // 사용자가 팝업을 수동으로 닫았을 때 감지 — 500ms 폴링.
      // 이 가드 없으면 사용자 취소 시 2분 타임아웃까지 대기.
      popupWatchId = setInterval(() => {
        if (popup.closed && !settled) {
          cleanup();
          reject(new Error("카카오 로그인이 취소되었어요."));
        }
      }, 500);

      // 2분 후에도 응답이 없으면 타임아웃.
      timeoutId = setTimeout(() => {
        if (settled) return;
        cleanup();
        reject(new Error("카카오 로그인 시간 초과"));
      }, 120000);
    });
  };

  const loginWithApple = async () => {
    await signInWithPopup(auth, appleProvider);
  };

  const logout = async () => {
    // 순서가 중요: (1) Firestore snapshot 구독 선해제 → in-flight 콜백이
    // 아래에서 비운 localStorage를 재오염시키는 race 차단.
    // (2) 인메모리 상태 즉시 리셋.
    // (3) localStorage의 유저 데이터 키 clear.
    // (4) 그 다음에야 signOut(auth) — onAuthStateChanged 콜백이 다시 들어와도
    //     이미 unsub된 상태라 안전.
    // (5) 리다이렉트.
    if (profileUnsubRef.current) {
      profileUnsubRef.current();
      profileUnsubRef.current = null;
    }
    setProfile(null);
    setSnapshots([]);
    // Clear all user-data caches — UI preferences (theme, accent 등)는 유지
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
        "prism_saved_specs", // legacy key
        "prism_spec_analysis_inline", // SpecAnalysisPanel cache
      ];
      for (const key of userDataKeys) {
        localStorage.removeItem(key);
      }
    } catch {}
    // sessionStorage prism_* / 분석 캐시 일괄 제거 — 다른 계정 로그인 후 prev user
    // spec_analysis·school detail·reveal seen 흔적이 남지 않게 한다.
    // UI 프리퍼런스(테마 등)는 localStorage에만 있으므로 sessionStorage는 전부 비워도 안전.
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
    // /api/match 캐시도 함께 제거 — 다른 계정 로그인 시 잔류 결과 노출 방지.
    try {
      const { clearMatchCache } = await import("@/lib/match-cache");
      clearMatchCache();
    } catch {}
    // 서버 세션 쿠키(__session) 만료 — 미호출 시 middleware가 쿠키 유효 기간 동안
    // /admin/* 진입을 통과시켜 client signOut과 server gate가 어긋남.
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    } catch {}
    try {
      await signOut(auth);
    } catch (e) {
      logError("[auth] signOut failed:", e);
      // signOut 실패해도 redirect는 수행 — localStorage가 이미 비워졌으므로
      // 세션이 남아 있어도 재접근 시 데이터 노출 위험은 제거됨.
    }
    window.location.href = "/";
  };

  const saveProfile = useCallback(async (data: Partial<UserProfile>) => {
    const prev = profileRef.current; // 최신 profile을 ref로 읽기 → deps에서 제외 가능
    const merged = { ...prev, ...data, onboarded: true } as UserProfile;
    // Master account always stays premium — in-memory only, never written to Firestore
    if (isMasterRef.current) {
      merged.plan = "elite";
    }

    if (user) {
      // 보호 필드(plan/planBilling/planActivatedAt/lastPayment/usage)는 Firestore 규칙이 거부하므로
      // strip 후 쓴다. 이 필드들은 서버 Admin SDK(결제 confirm, 카카오 callback, enforceQuota)만 갱신.
      // usage는 일일/월별 쿼터 카운터 — 클라가 reset해서 무한 호출 못 하도록 lock.
      const {
        plan: _p, planBilling: _pb, planActivatedAt: _pa, lastPayment: _lp, usage: _u,
        ...writableData
      } = merged as UserProfile & { usage?: unknown };
      void _p; void _pb; void _pa; void _lp; void _u;
      try {
        await setDoc(doc(db, "users", user.uid), writableData, { merge: true });
      } catch {
        // Firestore unavailable — in-memory state는 여전히 유지됨
      }
    }

    const newSnaps = saveSnapshot(merged, prev);
    if (newSnaps) {
      setSnapshots(newSnaps);
      // Snapshots를 Firestore에도 동기화 (cross-device 복원)
      if (user) {
        setDoc(doc(db, "users", user.uid), { snapshots: newSnaps }, { merge: true }).catch(() => {});
      }
    }
    setProfile(merged); // in-memory에는 plan 포함 (마스터·서버 응답 등)
  }, [user]);

  // 연타 시 stale `profile` closure가 같은 current 배열을 읽어 서로 덮어쓰는 race 방지.
  // profileRef로 최신값을 읽고, in-flight 큐로 직렬화.
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
