/**
 * /terms — 이용약관 (공개 SEO)
 *
 * ⚠️ 출시 전 초안. 법무 검토(전자상거래법·약관규제법) 후 운영자 정보 확정 필요.
 * 토스페이먼츠 PG 심사 통과 조건.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관 — conatusipsi",
  description: "conatusipsi 서비스 이용약관",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage(): React.ReactElement {
  return (
    <article className="mx-auto max-w-content-narrow px-gutter-sm md:px-gutter py-10 lg:py-14 space-y-8">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">이용약관</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          최종 갱신일: 2026년 5월 9일 · 시행일: 2026년 6월 30일 (출시 예정)
        </p>
        <p className="mt-3 text-xs rounded-md border border-amber-200 bg-amber-50/60 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
          ⚠️ 본 약관은 출시 전 초안입니다. 정식 시행 전 법무 검토 후 갱신됩니다.
        </p>
      </header>

      <Section title="제1조 (목적)">
        <p>
          본 약관은 conatusipsi(이하 &ldquo;회사&rdquo;)가 제공하는 한국 대학 입시
          AI 추천 서비스(이하 &ldquo;서비스&rdquo;)의 이용에 관한 회사와 이용자(이하
          &ldquo;회원&rdquo;)의 권리·의무·책임 사항을 규정합니다.
        </p>
      </Section>

      <Section title="제2조 (정의)">
        <List>
          <li><strong>서비스</strong>: 합격 가능성 분석, AI 입시 카운슬러, 모집요강 조회 등 conatusipsi가 제공하는 모든 기능</li>
          <li><strong>회원</strong>: 본 약관에 동의하고 회사가 제공하는 서비스를 이용하는 자</li>
          <li><strong>유료 권한</strong>: 단건권(분석 리포트 1회, 카운슬러 1회) 또는 시즌권 결제로 부여되는 사용 권한</li>
          <li><strong>분석 결과</strong>: 회원이 입력한 성적·비교과 데이터를 기반으로 AI가 산출한 학과별 합격 가능성</li>
        </List>
      </Section>

      <Section title="제3조 (서비스의 제공 및 변경)">
        <p>
          회사는 회원에게 합격률 분석, 학과 검색, AI 카운슬러, 입시 일정 안내 등을
          제공합니다. 다음의 경우 서비스 내용이 변경될 수 있습니다.
        </p>
        <List>
          <li>모집요강 갱신 (매년 7~9월)</li>
          <li>법령 변경에 따른 의무 사항</li>
          <li>서비스 개선 및 신규 기능 추가</li>
        </List>
      </Section>

      <Section title="제4조 (분석 결과의 책임 한계 — 정직성 원칙)">
        <p>
          회사는 다음 원칙을 철저히 준수합니다.
        </p>
        <List>
          <li>표본이 부족한 학과는 합격 확률을 표시하지 않습니다 — 임의의 추정치를 만들어내지 않습니다.</li>
          <li>AI 카운슬러는 데이터가 없는 사항에 대해 &ldquo;모른다&rdquo;고 답변합니다.</li>
          <li>제공되는 모든 분석 결과·추천은 <strong>참고용</strong>이며 합격을 보장하지 않습니다.</li>
          <li>최종 지원·합격 여부는 모집요강·경쟁률·출제 난이도 등 다양한 외부 변수에 영향받으며, 회원 본인의 판단과 책임에 따릅니다.</li>
        </List>
        <p>
          회사는 분석 결과에 의존한 입시 결정으로 발생한 결과에 대해 책임을 지지
          않습니다 (회사의 고의 또는 중과실로 인한 결과는 제외).
        </p>
      </Section>

      <Section title="제5조 (유료 서비스 — 결제·환불)">
        <List>
          <li>유료 권한은 토스페이먼츠를 통해 결제됩니다.</li>
          <li>결제 즉시 권한이 활성화되며, 영수증은 등록된 이메일로 자동 발송됩니다.</li>
          <li>환불은{" "}<Link href="/refund" className="underline">환불 정책</Link>에 따릅니다.</li>
          <li>표본 부족으로 일부 학과의 분석을 받지 못하더라도 환불 사유에 해당하지 않습니다 — 정직한 데이터 노출 자체가 서비스의 핵심 가치입니다.</li>
        </List>
      </Section>

      <Section title="제6조 (회원의 의무)">
        <List>
          <li>본인의 성적·생기부 정보를 정확하게 입력합니다 (허위 입력 시 분석 정확도 저하).</li>
          <li>타인의 계정을 도용하거나 ID·비밀번호를 공유하지 않습니다.</li>
          <li>서비스를 통해 얻은 데이터(분석 결과, 모집요강)를 무단으로 크롤링·재배포하지 않습니다.</li>
          <li>AI 카운슬러를 욕설·차별·자해 유도 등 부적절한 목적으로 사용하지 않습니다.</li>
        </List>
      </Section>

      <Section title="제7조 (계정 정지·해지)">
        <p>다음의 경우 회사는 회원 계정을 정지하거나 해지할 수 있습니다.</p>
        <List>
          <li>회원이 본 약관 또는 관련 법령을 위반한 경우</li>
          <li>타인의 권리(저작권·개인정보)를 침해한 경우</li>
          <li>서비스의 안정적 운영을 방해한 경우(과도한 자동화 요청 등)</li>
        </List>
      </Section>

      <Section title="제8조 (회사의 의무)">
        <List>
          <li>회원의 개인정보를 본 약관 및{" "}<Link href="/privacy" className="underline">개인정보처리방침</Link>에 따라 보호합니다.</li>
          <li>서비스 장애 발생 시 신속히 복구합니다 (불가항력 제외).</li>
          <li>유료 권한의 결제 오류·환불 요청은 영업일 기준 3일 이내 응대합니다.</li>
        </List>
      </Section>

      <Section title="제9조 (분쟁 해결)">
        <p>
          본 약관에 명시되지 않은 사항은 관련 법령 및 일반 상관례에 따릅니다.
          서비스 이용으로 발생한 분쟁은 서울중앙지방법원을 1심 관할로 합니다.
        </p>
      </Section>

      <footer className="border-t pt-6 text-xs text-muted-foreground space-y-1">
        <p>
          관련:{" "}
          <Link href="/privacy" className="underline">개인정보처리방침</Link> ·{" "}
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
