import "@testing-library/jest-dom";

// 합격률 기능 플래그 — 단위 테스트는 실제 표본/매칭 로직을 검증해야 하므로 ON 으로 둔다.
// (프로덕션은 NEXT_PUBLIC_ADMISSION_PROBABILITY_ENABLED 미설정 → OFF = 시연용 난수 차단)
process.env.NEXT_PUBLIC_ADMISSION_PROBABILITY_ENABLED = "true";
