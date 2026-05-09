// vitest 환경에서 server-only 패키지를 대체하는 빈 모듈.
// 실제 server-only는 클라이언트 빌드 시 import를 막지만, 테스트는 Node 환경이라 문제 없음.
export {};
