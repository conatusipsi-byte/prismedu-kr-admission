import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

function getAdmin() {
  return { auth: getAdminAuth(), db: getAdminDb() };
}

export async function GET(req: NextRequest) {
  // 콜백을 호스팅하는 원본 (= opener 윈도우의 origin과 동일해야 정상)
  // postMessage 시 이 origin으로만 전달 — 다른 origin의 악성 페이지가 opener를 가장한 경우 토큰 유출 차단
  const targetOrigin = req.nextUrl.origin;

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  // state: 클라이언트가 sessionStorage에 보관한 CSRF 토큰과 대조됨 (popup postMessage에서 검증).
  // 서버는 state 유무만 강제하고 실제 대조는 opener 쪽에서.
  const state = req.nextUrl.searchParams.get("state") || "";

  if (error || !code) {
    return errorResponse(error || "코드 없음", targetOrigin, state);
  }

  if (!state) {
    return errorResponse("CSRF 방지 토큰 누락", targetOrigin, "");
  }

  const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
  const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET; // optional
  const REDIRECT_URI = `${req.nextUrl.origin}/api/auth/kakao/callback`;

  if (!KAKAO_CLIENT_ID) {
    return errorResponse("카카오 API 키가 설정되지 않았습니다", targetOrigin, state);
  }

  try {
    // Step 1: Exchange code for Kakao access token
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: KAKAO_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code,
        ...(KAKAO_CLIENT_SECRET && { client_secret: KAKAO_CLIENT_SECRET }),
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return errorResponse("카카오 토큰 발급 실패", targetOrigin, state);
    }

    // Step 2: Get Kakao user profile
    const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const kakaoUser = await profileRes.json();

    if (!kakaoUser.id) {
      return errorResponse("카카오 사용자 정보 조회 실패", targetOrigin, state);
    }

    const kakaoId = `kakao:${kakaoUser.id}`;
    const email = kakaoUser.kakao_account?.email || `${kakaoUser.id}@kakao.local`;
    const name = kakaoUser.kakao_account?.profile?.nickname || "카카오 사용자";
    const photoURL = kakaoUser.kakao_account?.profile?.profile_image_url;

    // Step 3: Create or get Firebase user
    const { auth, db } = getAdmin();
    let firebaseUid: string;

    try {
      const existing = await auth.getUser(kakaoId);
      firebaseUid = existing.uid;
    } catch {
      // User doesn't exist - create
      const newUser = await auth.createUser({
        uid: kakaoId,
        email,
        displayName: name,
        ...(photoURL ? { photoURL } : {}),
      });
      firebaseUid = newUser.uid;

      // Initialize profile in Firestore.
      // photoURL은 값이 있을 때만 기록 — UserProfile.photoURL?: string 규약(undefined=없음).
      // 과거엔 null을 기록해 클라이언트 타입과 불일치했고, `profile.photoURL || user.photoURL` 식의
      // fallback 체인이 null을 string으로 취급해 빈 <img>를 렌더하는 경계 케이스가 있었다.
      await db.collection("users").doc(firebaseUid).set({
        name,
        grade: "",
        dreamSchool: "",
        major: "",
        ...(photoURL ? { photoURL } : {}),
        onboarded: false,
        plan: "free",
        provider: "kakao",
      }, { merge: true });
    }

    // Step 4: Create Firebase custom token
    const customToken = await auth.createCustomToken(firebaseUid);

    // Step 5: Return HTML that signs in via popup messaging.
    // postMessage 두 번째 인자에 명시적 origin 전달 → 다른 origin의 페이지가 opener를 가장해도 토큰 못 받음
    // state는 그대로 opener에 돌려보내 opener가 자기 sessionStorage 값과 대조 (CSRF).
    return new NextResponse(
      `<!DOCTYPE html><html><body>
        <script>
          (function() {
            var TARGET_ORIGIN = ${JSON.stringify(targetOrigin)};
            try {
              window.opener && window.opener.postMessage({
                type: "kakao-login-success",
                customToken: ${JSON.stringify(customToken)},
                state: ${JSON.stringify(state)}
              }, TARGET_ORIGIN);
            } catch (e) {
              window.opener && window.opener.postMessage({
                type: "kakao-login-error",
                error: String(e && e.message || e),
                state: ${JSON.stringify(state)}
              }, TARGET_ORIGIN);
            }
            window.close();
          })();
        </script>
        <p>로그인 처리 중...</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (e: unknown) {
    console.error("Kakao auth error:", e);
    const msg = e instanceof Error ? e.message : "카카오 로그인 실패";
    return errorResponse(msg, targetOrigin, state);
  }
}

function errorResponse(msg: string, targetOrigin: string, state: string) {
  // 모든 동적 값(msg, targetOrigin, state)은 JSON.stringify로 escape → XSS 방어.
  // 화면 표시용 <p>는 dangerouslySet이 아닌 textContent로 setText 처리.
  return new NextResponse(
    `<!DOCTYPE html><html><body><p id="msg"></p><script>
      (function() {
        var msg = ${JSON.stringify(msg)};
        var targetOrigin = ${JSON.stringify(targetOrigin)};
        var state = ${JSON.stringify(state)};
        document.getElementById("msg").textContent = msg;
        try {
          window.opener && window.opener.postMessage({ type: "kakao-login-error", error: msg, state: state }, targetOrigin);
        } catch (_) { /* ignore */ }
        window.close();
      })();
    </script></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
