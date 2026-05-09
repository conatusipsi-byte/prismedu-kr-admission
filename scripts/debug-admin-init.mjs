// Admin SDK 초기화 디버그 — .env.local 로드 후 실제 값 확인
import { config } from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

config({ path: ".env.local" });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
const privateKey = privateKeyRaw?.replace(/\\n/g, "\n");

console.log("project_id:", projectId);
console.log("client_email:", clientEmail);
console.log("private_key length (raw):", privateKeyRaw?.length);
console.log("private_key length (after escape):", privateKey?.length);
console.log("private_key starts with:", privateKey?.slice(0, 32));
console.log("private_key has actual newlines:", privateKey?.includes("\n"));
console.log("private_key has literal \\n:", privateKey?.includes("\\n"));

try {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  console.log("✅ Admin SDK initialized");

  // Test: list 1 user (just to verify auth works)
  const list = await getAuth().listUsers(1);
  console.log("✅ listUsers OK — user count:", list.users.length);
  if (list.users[0]) {
    console.log("   first user uid:", list.users[0].uid);
    console.log("   first user email:", list.users[0].email);
  }
} catch (e) {
  console.error("❌ Admin SDK error:", e.message);
  console.error("   code:", e.code);
}
