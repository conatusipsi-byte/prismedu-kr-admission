/**
 * 에세이 단어 수 계산.
 *
 * Common App / Coalition 규칙에 맞춰:
 * - 공백류(스페이스, 탭, 개행)와 em-dash(—) / en-dash(–)를 단어 경계로 취급.
 *   ("hello—world"는 2단어, 단순 split(/\s+/)로는 1단어로 잘못 세짐)
 * - 하이픈(-)으로 묶인 단어("state-of-the-art")는 1단어로 셈 (Common App 규칙).
 * - 어포스트로피("don't", "it's")는 단어 일부로 유지.
 * - 빈 문자열·공백만 있는 입력은 0.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/[\s\u2014\u2013]+/).filter(Boolean).length;
}
