/**
 * /privacy — 개인정보처리방침 (공개 SEO)
 *
 * ⚠️ 본 문서는 초안입니다. 출시 전 법무 검토(개인정보보호법·정보통신망법 준수) 필수.
 * 결제 PG 심사(토스페이먼츠) 통과 조건이기도 함 — 운영자 정보·연락처 확정 후 갱신.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 — conatusipsi",
  description: "conatusipsi의 개인정보 수집·이용·보관·파기 방침",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <article className="mx-auto max-w-content-narrow px-gutter-sm md:px-gutter py-10 lg:py-14 space-y-8">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
          개인정보처리방침
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          최종 갱신일: 2026년 5월 9일 · 시행일: 2026년 6월 30일 (출시 예정)
        </p>
        <p className="mt-3 text-xs rounded-md border border-amber-200 bg-amber-50/60 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
          ⚠️ 본 문서는 출시 전 초안입니다. 정식 시행 전 법무 검토 후 운영자 정보·연락처가
          확정됩니다.
        </p>
      </header>

      <Section title="1. 수집하는 개인정보 항목">
        <List>
          <li><strong>회원가입 시</strong>: 이메일, 비밀번호 또는 카카오/구글 OAuth 식별자, 이름</li>
          <li><strong>온보딩·프로필</strong>: 학년·계열, 내신 등급(학년·학기별), 수능/모의 점수, 비교과 활동 정량(시간·횟수), 희망 학과·전형 의향</li>
          <li><strong>결제 시</strong>: 토스페이먼츠가 처리하는 결제 정보(카드번호 등은 conatusipsi 서버 미저장), 영수증 발송용 이메일, 결제 이력</li>
          <li><strong>서비스 이용 기록</strong>: 분석 요청 로그, AI 카운슬러 대화 내용, 접속 IP·기기 정보·로그 시각</li>
        </List>
      </Section>

      <Section title="2. 개인정보의 수집·이용 목적">
        <List>
          <li>합격 가능성 분석 및 학과 추천 서비스 제공</li>
          <li>AI 입시 카운슬러의 개인 맞춤 응답 생성</li>
          <li>결제·환불 처리 및 이용 권한 관리</li>
          <li>고객 문의 응대, 서비스 개선을 위한 통계 분석(개인 식별 불가능한 형태로 가공)</li>
          <li>법령 준수(전자상거래법상 거래 기록 보관 등)</li>
        </List>
      </Section>

      <Section title="3. 개인정보의 보관 및 이용 기간">
        <p>
          이용자의 개인정보는 원칙적으로 회원 탈퇴 시 즉시 파기합니다. 단, 다음의
          경우 관련 법령에 따라 일정 기간 보관합니다.
        </p>
        <List>
          <li>전자상거래 등에서의 소비자 보호에 관한 법률에 따른 거래 기록: 5년</li>
          <li>표시·광고에 관한 기록: 6개월</li>
          <li>로그인 기록·접속 기록(통신비밀보호법): 3개월</li>
        </List>
      </Section>

      <Section title="4. 제3자 제공 및 처리 위탁">
        <p>conatusipsi는 다음의 제3자에게 처리 업무를 위탁합니다.</p>
        <List>
          <li><strong>Google Firebase</strong>: 인증·데이터베이스·파일 저장 (서울 region)</li>
          <li><strong>토스페이먼츠</strong>: 결제 처리 및 영수증 발급</li>
          <li><strong>Anthropic Claude API</strong>: AI 카운슬러 응답 생성 (대화 내용 일부 전송, Anthropic의 데이터 보관 정책에 따름)</li>
          <li><strong>Vercel</strong>: 웹사이트 호스팅 (대화 내용 미전송, 접속 로그만 처리)</li>
        </List>
        <p>
          위 위탁사 외 제3자에게 개인정보를 판매하거나 광고 목적으로 제공하지 않습니다.
        </p>
      </Section>

      <Section title="5. 이용자의 권리 및 행사 방법">
        <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
        <List>
          <li>개인정보 열람·정정·삭제 요구 (프로필 페이지에서 직접 수정 가능)</li>
          <li>개인정보 처리 정지 요구</li>
          <li>회원 탈퇴 — 탈퇴 즉시 모든 개인정보 영구 삭제 (위 §3의 법령 보관 항목 제외)</li>
        </List>
      </Section>

      <Section title="6. 개인정보 보호를 위한 기술적·관리적 대책">
        <List>
          <li>전송 구간 암호화: 모든 통신 SSL/TLS 적용</li>
          <li>저장 데이터: Firebase 보안 규칙(firestore.rules)에 따라 본인 외 접근 차단</li>
          <li>비밀번호: Firebase Auth가 단방향 해시(scrypt)로 저장 — 평문 미보관</li>
          <li>접근 권한: 운영팀 중 최소 인원만 관리자 콘솔 권한 보유</li>
        </List>
      </Section>

      <Section title="7. 개인정보 보호책임자">
        <p>
          개인정보 처리에 관한 문의·민원은 다음으로 연락주시기 바랍니다.
        </p>
        <List>
          <li>이메일: privacy@conatusipsi.com (출시 전 임시)</li>
          <li>운영 회사·대표자: 출시 전 확정 예정</li>
        </List>
      </Section>

      <footer className="border-t pt-6 text-xs text-muted-foreground space-y-1">
        <p>
          본 방침의 변경 사항은 시행 7일 전 본 페이지에 공지합니다. 중대한 변경의
          경우 등록된 이메일로도 안내합니다.
        </p>
        <p>
          관련:{" "}
          <Link href="/terms" className="underline">이용약관</Link> ·{" "}
          <Link href="/refund" className="underline">환불 정책</Link>
        </p>
      </footer>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed break-keep-all space-y-2">
        {children}
      </div>
    </section>
  );
}

function List({ children }: { children: React.ReactNode }): React.ReactElement {
  return <ul className="list-disc list-outside pl-5 space-y-1">{children}</ul>;
}
