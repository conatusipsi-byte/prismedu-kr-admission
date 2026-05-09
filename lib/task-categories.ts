/**
 * 플래너 task 카테고리 단일 소스. /planner 페이지와 /api/planner/generate에서 공유.
 * 기존 6개(시험/행정/에세이/추천서/지원/기타)에 AI 플래너 도입 시점에
 * "과외활동"·"학부모 미팅" 2개 추가. 기존 유저 데이터는 그대로 유효.
 */

export type TaskCategory =
  | "시험"
  | "행정"
  | "에세이"
  | "추천서"
  | "지원"
  | "기타"
  | "과외활동"
  | "학부모 미팅";

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  "시험",
  "행정",
  "에세이",
  "추천서",
  "지원",
  "과외활동",
  "학부모 미팅",
  "기타",
] as const;

/**
 * 50-level bg는 globals.css에 dark override 있음. text는 light/dark 둘 다 명시.
 * icon은 lucide-react 컴포넌트 이름(문자열 참조는 x → 아이콘은 소비처에서 매핑).
 */
export const CATEGORY_COLORS: Record<TaskCategory, string> = {
  "시험":      "bg-blue-50 text-blue-600 dark:text-blue-300",
  "행정":      "bg-emerald-50 text-emerald-600 dark:text-emerald-300",
  "에세이":    "bg-amber-50 text-amber-600 dark:text-amber-300",
  "추천서":    "bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-300",
  "지원":      "bg-red-50 text-red-600 dark:text-red-300",
  "과외활동":  "bg-fuchsia-50 dark:bg-fuchsia-950/20 text-fuchsia-600 dark:text-fuchsia-300",
  "학부모 미팅": "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-300",
  "기타":      "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
};

export function isTaskCategory(v: unknown): v is TaskCategory {
  return typeof v === "string" && (TASK_CATEGORIES as readonly string[]).includes(v);
}
