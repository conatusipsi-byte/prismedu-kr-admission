#!/usr/bin/env node
/**
 * Supabase Auth 이메일 한국어 템플릿 + 발신 주소 일괄 적용 스크립트.
 *
 *   npx tsx scripts/apply-supabase-auth-emails.ts
 *
 * 환경변수:
 *   SUPABASE_ACCESS_TOKEN  Personal access token (sbp_...)
 *
 * 본 스크립트는 Management API 의
 *   PATCH /v1/projects/{ref}/config/auth
 * 를 호출하여:
 *   1) smtp_admin_email = noreply@conatusipsi.com (인증된 자체 도메인)
 *   2) 6종 메일 (confirmation/recovery/magic_link/invite/email_change/reauthentication)
 *      subjects + content 를 한국어로 갱신
 *
 * 멱등 — 같은 값으로 여러 번 호출해도 안전.
 */

import fs from "node:fs";
import path from "node:path";

const PROJECT_REF = "bqmccfeglxzzrmgdirxe";
const API_BASE = "https://api.supabase.com/v1";

function readToken(): string {
  const env = process.env.SUPABASE_ACCESS_TOKEN;
  if (env) return env;
  const dotenv = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(dotenv)) {
    const m = fs.readFileSync(dotenv, "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error("SUPABASE_ACCESS_TOKEN 미설정 (.env.local 또는 환경변수)");
}

/**
 * 공통 HTML 셸 — 브랜드 톤 + brand-emerald 액센트.
 * Supabase 가 {{ .ConfirmationURL }}, {{ .Token }}, {{ .NewEmail }}, {{ .OldEmail }},
 * {{ .Email }}, {{ .Provider }} 등을 치환.
 */
function shell(args: {
  title: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="ko">
  <body style="margin:0;padding:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0d1116;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 2px rgba(0,0,0,0.04);border:1px solid #e6e9ef;">
        <div style="margin-bottom:24px;">
          <div style="display:inline-block;font-size:14px;font-weight:700;letter-spacing:-0.01em;color:#00C9A7;">Conatus</div>
        </div>
        <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;letter-spacing:-0.015em;color:#0d1116;">${args.title}</h1>
        <div style="font-size:14px;line-height:1.65;color:#3b4252;">
          ${args.body}
        </div>
      </div>
      <p style="margin:20px 4px 0;font-size:12px;line-height:1.6;color:#7a8694;">
        본 메일은 Conatus에서 발송되었습니다. 문제가 있으시면
        <a href="mailto:hjan040507@gmail.com" style="color:#00C9A7;text-decoration:none;">hjan040507@gmail.com</a>
        으로 문의해 주세요.
      </p>
    </div>
  </body>
</html>`;
}

function buttonLink(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin:8px 0 16px;background:#00C9A7;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:10px 20px;border-radius:10px;">${label}</a>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   6종 본문
   ═══════════════════════════════════════════════════════════════════════ */

const CONFIRMATION = shell({
  title: "이메일 인증을 완료해 주세요",
  body: `
    <p>Conatus 가입 신청을 받았습니다. 아래 버튼을 눌러 이메일 인증을 마치면 가입이 완료됩니다.</p>
    ${buttonLink("{{ .ConfirmationURL }}", "이메일 인증하기")}
    <p style="color:#7a8694;font-size:13px;">버튼이 동작하지 않으면 아래 링크를 복사해 브라우저에 붙여넣어 주세요.</p>
    <p style="font-size:12px;color:#7a8694;word-break:break-all;">{{ .ConfirmationURL }}</p>
    <p style="color:#7a8694;font-size:13px;">본 메일이 본인 가입과 무관하다면 안전하게 무시하셔도 됩니다.</p>
  `,
});

const RECOVERY = shell({
  title: "비밀번호 재설정 안내",
  body: `
    <p>비밀번호 재설정 요청을 받았습니다. 아래 버튼을 눌러 새 비밀번호를 설정해 주세요.</p>
    ${buttonLink("{{ .ConfirmationURL }}", "비밀번호 재설정")}
    <p style="color:#7a8694;font-size:13px;">버튼이 동작하지 않으면 아래 링크를 복사해 브라우저에 붙여넣어 주세요.</p>
    <p style="font-size:12px;color:#7a8694;word-break:break-all;">{{ .ConfirmationURL }}</p>
    <p style="color:#7a8694;font-size:13px;">본인이 요청하지 않았다면 본 메일을 무시하셔도 비밀번호는 그대로 유지됩니다.</p>
  `,
});

const MAGIC_LINK = shell({
  title: "Conatus 로그인 링크",
  body: `
    <p>아래 버튼을 누르면 Conatus에 로그인됩니다. 본 링크는 1회용이며 잠시 후 만료됩니다.</p>
    ${buttonLink("{{ .ConfirmationURL }}", "로그인하기")}
    <p style="color:#7a8694;font-size:13px;">버튼이 동작하지 않으면 아래 링크를 복사해 브라우저에 붙여넣어 주세요.</p>
    <p style="font-size:12px;color:#7a8694;word-break:break-all;">{{ .ConfirmationURL }}</p>
  `,
});

const INVITE = shell({
  title: "Conatus 초대장",
  body: `
    <p>Conatus 계정 생성에 초대되셨습니다. 아래 버튼을 누르면 계정 생성 절차로 이동합니다.</p>
    ${buttonLink("{{ .ConfirmationURL }}", "초대 수락하기")}
    <p style="color:#7a8694;font-size:13px;">버튼이 동작하지 않으면 아래 링크를 복사해 브라우저에 붙여넣어 주세요.</p>
    <p style="font-size:12px;color:#7a8694;word-break:break-all;">{{ .ConfirmationURL }}</p>
  `,
});

const EMAIL_CHANGE = shell({
  title: "새 이메일 주소 확인",
  body: `
    <p><strong>{{ .NewEmail }}</strong> 을(를) 새 이메일 주소로 등록하려고 합니다. 아래 버튼을 눌러 확인해 주세요.</p>
    ${buttonLink("{{ .ConfirmationURL }}", "새 이메일 확인하기")}
    <p style="color:#7a8694;font-size:13px;">버튼이 동작하지 않으면 아래 링크를 복사해 브라우저에 붙여넣어 주세요.</p>
    <p style="font-size:12px;color:#7a8694;word-break:break-all;">{{ .ConfirmationURL }}</p>
    <p style="color:#7a8694;font-size:13px;">본인이 요청하지 않았다면 본 메일을 무시하셔도 됩니다.</p>
  `,
});

const REAUTHENTICATION = shell({
  title: "재인증 확인 코드",
  body: `
    <p>본인 확인을 위한 코드입니다. 아래 코드를 입력해 주세요. 잠시 후 만료됩니다.</p>
    <div style="font-family:'SF Mono','JetBrains Mono','Courier New',monospace;font-size:28px;letter-spacing:0.18em;font-weight:700;color:#0d1116;background:#f0f4f1;border-radius:12px;padding:18px 24px;text-align:center;margin:16px 0;">
      {{ .Token }}
    </div>
    <p style="color:#7a8694;font-size:13px;">본인이 요청하지 않았다면 즉시 비밀번호를 변경해 주세요.</p>
  `,
});

/* ═══════════════════════════════════════════════════════════════════════
   PATCH payload
   ═══════════════════════════════════════════════════════════════════════ */

const payload = {
  // 발신 주소 갱신 — 인증된 자체 도메인
  smtp_admin_email: "noreply@conatusipsi.com",
  smtp_sender_name: "Conatus",

  // 6종 subject
  mailer_subjects_confirmation:    "Conatus 이메일 인증을 완료해 주세요",
  mailer_subjects_recovery:        "Conatus 비밀번호 재설정 안내",
  mailer_subjects_magic_link:      "Conatus 로그인 링크",
  mailer_subjects_invite:          "Conatus 초대장",
  mailer_subjects_email_change:    "Conatus 이메일 변경 확인",
  mailer_subjects_reauthentication: "Conatus 재인증 요청",

  // 6종 본문 HTML
  mailer_templates_confirmation_content:     CONFIRMATION,
  mailer_templates_recovery_content:         RECOVERY,
  mailer_templates_magic_link_content:       MAGIC_LINK,
  mailer_templates_invite_content:           INVITE,
  mailer_templates_email_change_content:     EMAIL_CHANGE,
  mailer_templates_reauthentication_content: REAUTHENTICATION,
};

async function main(): Promise<void> {
  const token = readToken();
  const res = await fetch(`${API_BASE}/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH 실패 HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  console.log(`✅ Supabase Auth config 갱신 완료 (HTTP ${res.status})`);
  // 일부 필드만 echo
  const echo = (await res.json()) as Record<string, unknown>;
  for (const k of [
    "smtp_admin_email",
    "smtp_sender_name",
    "mailer_subjects_confirmation",
    "mailer_subjects_recovery",
    "mailer_subjects_magic_link",
  ]) {
    console.log(`  ${k}: ${echo[k]}`);
  }
}

main().catch((e: unknown) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
