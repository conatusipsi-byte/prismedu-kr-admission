/**
 * /refund — 환불 정책 (공개 SEO)
 *
 * ⚠️ 출시 전 초안. 토스페이먼츠 PG 심사 통과 조건 — 실제 환불 절차·기간이
 * PG 약관과 일치하는지 법무·경영진 확인 필수.
 *
 * 정책 핵심:
 *   - 7일 이내 미사용 → 전액 환불
 *   - 사용 이력 있을 시 → 잔여 기간 일할 계산 (단건권은 사용 즉시 환불 불가)
 *   - 표본 부족 학과 비공개는 환불 사유 X (정직성 원칙)
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "환불 정책 — conatusipsi",
  description: "단건권·시즌권 환불 기준과 절차",
  alternates: { canonical: "/refund" },
  robots: { index: true, follow: true },
};

export default function RefundPage(): React.ReactElement {
  return (
    <article className="mx-auto max-w-content-narrow px-gutter-sm md:px-gutter py-10 lg:py-14 space-y-8">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">환불 정책</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          최종 갱신일: 2026년 5월 9일 · 시행일: 2026년 6월 30일 (출시 예정)
        </p>
        <p className="mt-3 text-xs rounded-md border border-amber-200 bg-amber-50/60 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
          ⚠️ 본 정책은 출시 전 초안입니다. 토스페이먼츠 PG 심사 후 일부 조항이
          조정될 수 있습니다.
        </p>
      </header>

      <Section title="1. 일반 환불 기준">
        <p>전자상거래법 및 콘텐츠 산업 진흥법에 따른 청약 철회 기간 내 환불을 보장합니다.</p>
        <List>
          <li><strong>결제 후 7일 이내, 미사용 상태</strong>: 전액 환불</li>
          <li><strong>결제 후 7일 이내, 일부 사용</strong>: 잔여 기간에 대해 일할 계산 후 환불 (단, 단건권은 사용 시 환불 불가)</li>
          <li><strong>결제 후 7일 초과</strong>: 미사용 상품에 한해 회사 재량으로 환불 검토</li>
        </List>
      </Section>

      <Section title="2. 상품별 환불 기준">
        <Table>
          <thead className="text-foreground bg-muted/50">
            <tr>
              <Th>상품</Th>
              <Th>미사용 환불</Th>
              <Th>일부 사용 환불</Th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-t">
              <Td>분석 리포트 1회</Td>
              <Td>7일 이내 전액</Td>
              <Td className="text-destructive">불가 (사용 즉시 소진)</Td>
            </tr>
            <tr className="border-t">
              <Td>AI 카운슬러 1회권</Td>
              <Td>7일 이내 전액</Td>
              <Td className="text-destructive">불가 (사용 즉시 소진)</Td>
            </tr>
            <tr className="border-t">
              <Td>시즌권 (180일)</Td>
              <Td>7일 이내 전액</Td>
              <Td>잔여 일 × 일할 계산</Td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <Section title="3. 환불 신청 방법">
        <List>
          <li>로그인 후{" "}<Link href="/orders" className="underline">결제 내역</Link>에서 해당 주문의 환불 요청 버튼 클릭</li>
          <li>또는 고객센터(아래 연락처)로 주문번호와 함께 이메일 문의</li>
          <li>영업일 기준 <strong>3일 이내</strong> 검토 결과를 회신합니다</li>
          <li>승인된 환불은 결제 수단에 따라 <strong>3~7영업일</strong> 내 입금됩니다 (카드사·은행 정책)</li>
        </List>
      </Section>

      <Section title="4. 환불 불가 사유">
        <List>
          <li>단건권을 1회 사용한 경우 (분석 결과 산출 또는 카운슬러 응답 1건 수신)</li>
          <li>약관 §4 (정직성 원칙)에 따라 표본 부족 학과의 합격 확률이 표시되지 않은 경우</li>
          <li>결제일로부터 7일 초과 + 사용 이력이 있는 단건 상품</li>
          <li>본 약관 또는 관련 법령 위반으로 계정이 정지·해지된 경우</li>
        </List>
      </Section>

      <Section title="5. 결제 오류·중복 결제">
        <p>
          시스템 오류 또는 중복 결제 발생 시 사용 이력과 무관하게 전액 환불됩니다.
          가능한 빨리{" "}<Link href="/orders" className="underline">결제 내역</Link>에서 신고하거나
          고객센터로 연락주시기 바랍니다.
        </p>
      </Section>

      <Section title="6. 고객센터">
        <List>
          <li>이메일: support@conatusipsi.com (출시 전 임시)</li>
          <li>운영 시간: 평일 10:00 ~ 18:00 (공휴일 제외)</li>
          <li>응답 시간: 영업일 기준 3일 이내</li>
        </List>
      </Section>

      <footer className="border-t pt-6 text-xs text-muted-foreground space-y-1">
        <p>
          관련:{" "}
          <Link href="/terms" className="underline">이용약관</Link> ·{" "}
          <Link href="/privacy" className="underline">개인정보처리방침</Link>
        </p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
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

function Table({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th className="text-left font-semibold p-3">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <td className={`p-3 ${className ?? ""}`}>{children}</td>;
}
