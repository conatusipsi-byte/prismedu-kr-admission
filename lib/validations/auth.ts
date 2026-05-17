/**
 * Auth 폼 zod 스키마 — audit UP-06 1단계.
 *
 * 본 파일은 신규 폼(추후 추가될 회원 프로필 편집·문의 등)이 곧바로 사용할 수 있는
 * 표준 스키마. 기존 LoginView 전면 마이그레이션은 회귀 리스크가 커 별도 PR 로 미룸
 * (당장은 HTML5 required + placeholder + name 으로 처리, audit P0-03/07 / P1-03/04/07 해결).
 *
 * 사용 예 (신규 폼):
 *   import { useForm } from "react-hook-form";
 *   import { zodResolver } from "@hookform/resolvers/zod";
 *   import { signupSchema, type SignupInput } from "@/lib/validations/auth";
 *
 *   const form = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });
 */

import { z } from "zod";

/* ─────────────────────────── 공통 토큰 ─────────────────────────── */

export const FORM_ERROR_MESSAGES = {
  emailRequired:     "이메일을 입력해주세요.",
  emailInvalid:      "이메일 형식이 올바르지 않아요.",
  passwordRequired:  "비밀번호를 입력해주세요.",
  passwordWeak:      "비밀번호는 영문·숫자 포함 8자 이상이어야 해요.",
  passwordTooShort:  "비밀번호는 6자 이상이어야 해요.",
  nameRequired:      "이름을 입력해주세요.",
  nameTooLong:       "이름은 50자 이하로 입력해주세요.",
  termsRequired:     "이용약관과 개인정보 처리방침 동의가 필요해요.",
} as const;

/* ─────────────────────────── 스키마 ─────────────────────────── */

/** 로그인 — 이메일 + 비번 (비번 강도 검증 X — 기존 계정은 어떤 형태든 허용). */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, FORM_ERROR_MESSAGES.emailRequired)
    .email(FORM_ERROR_MESSAGES.emailInvalid),
  password: z
    .string()
    .min(6, FORM_ERROR_MESSAGES.passwordTooShort),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** 회원가입 — 이메일 + 비번(영문+숫자 8자 이상) + 이름 + 약관 동의. */
export const signupSchema = z.object({
  email: z
    .string()
    .min(1, FORM_ERROR_MESSAGES.emailRequired)
    .email(FORM_ERROR_MESSAGES.emailInvalid),
  password: z
    .string()
    .min(8, FORM_ERROR_MESSAGES.passwordWeak)
    .regex(/[A-Za-z]/, FORM_ERROR_MESSAGES.passwordWeak)
    .regex(/[0-9]/, FORM_ERROR_MESSAGES.passwordWeak),
  name: z
    .string()
    .min(1, FORM_ERROR_MESSAGES.nameRequired)
    .max(50, FORM_ERROR_MESSAGES.nameTooLong)
    .transform((s) => s.trim()),
  agreeTos: z.literal(true, {
    errorMap: () => ({ message: FORM_ERROR_MESSAGES.termsRequired }),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** 비밀번호 재설정 — 이메일만. */
export const resetPasswordSchema = z.object({
  email: z
    .string()
    .min(1, FORM_ERROR_MESSAGES.emailRequired)
    .email(FORM_ERROR_MESSAGES.emailInvalid),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
