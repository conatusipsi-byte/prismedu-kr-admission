// 본인 admin 권한 부여 — admins/{uid} 문서 생성
// firestore.rules 기준: exists + active=true 면 isMaster() 통과
import { config } from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

config({ path: ".env.local" });

const TARGET_EMAIL = process.argv[2];
if (!TARGET_EMAIL) {
  console.error("usage: node scripts/grant-admin.mjs <email>");
  process.exit(1);
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const user = await getAuth().getUserByEmail(TARGET_EMAIL).catch(() => null);
if (!user) {
  console.error(`❌ user not found: ${TARGET_EMAIL}. 먼저 한 번 로그인 필요.`);
  process.exit(1);
}

await db.collection("admins").doc(user.uid).set({
  active: true,
  email: user.email,
  grantedAt: new Date(),
  role: "owner",
});

console.log(`✅ admin 권한 부여 완료`);
console.log(`   uid: ${user.uid}`);
console.log(`   email: ${user.email}`);
console.log(`   role: owner`);
