/**
 * 한국어 메시지 카탈로그 — 앱 기본 언어.
 *
 * 네임스페이스 구조: 페이지/영역별로 그룹화.
 * 키 이름은 'snake_case.dotted' — 추출·번역 툴링과 친화적.
 *
 * 추가 가이드:
 *  1) 하드코딩 문자열을 이 파일로 먼저 옮기고,
 *  2) 해당 위치에서 `t("ns.key")` 호출로 교체,
 *  3) en.ts에 동일 키 추가(번역 미완성이면 ko 원문 복제 + TODO 주석).
 */
// 형태를 공유하되 각 값은 literal로 고정하지 않도록 satisfies 사용.
// (as const를 쓰면 en에서 같은 문자열을 요구해 컴파일 불가)
type MessageTree = { [k: string]: string | MessageTree };

const messages = {
  common: {
    cancel: "취소",
    confirm: "확인",
    save: "저장",
    delete: "삭제",
    retry: "다시 시도",
    back: "뒤로",
    next: "다음",
    loading: "로딩 중...",
    offline: "오프라인이에요",
    offline_hint: "네트워크 연결이 끊겨서 이 페이지를 불러올 수 없어요.",
    home: "홈으로",
  },
  nav: {
    dashboard: "홈",
    analysis: "분석",
    chat: "상담",
    essays: "에세이",
    planner: "플래너",
    profile: "프로필",
  },
  landing: {
    title: "PRISM — 미국 대학 입시 매니저",
    tagline: "내 스펙으로 갈 수 있는 대학, 3초면 알 수 있어요",
    cta_start: "시작하기",
    feature_prediction: "합격 예측",
    feature_essay: "AI 에세이 첨삭",
    feature_planner: "입시 플래너",
  },
  errors: {
    generic_title: "앗, 문제가 발생했어요",
    generic_body: "예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    network_title: "네트워크 오류",
    auth_required: "로그인이 필요해요",
  },
} satisfies MessageTree;

export default messages;
export type Messages = typeof messages;
