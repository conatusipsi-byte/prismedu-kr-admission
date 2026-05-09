/**
 * /admin/etl-upload — PDF 업로드 페이지 (Day 10 신규)
 *
 * master 권한은 admin/layout.tsx가 검증.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EtlUploadForm } from "@/components/admin/EtlUploadForm";

export const metadata: Metadata = {
  title: "ETL 업로드 — admin",
  robots: { index: false, follow: false },
};

export default function EtlUploadPage(): React.ReactElement {
  return (
    <div
      data-page="admin-etl-upload"
      className="mx-auto flex max-w-content flex-col gap-6 px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">모집요강 PDF 업로드</h1>
          <p className="text-xs text-muted-foreground">
            업로드 즉시 파싱이 진행되며, 결과는 검수 대기 목록에 추가됩니다.
            승격 전까지 사이트(/admissions)에는 노출되지 않습니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/etl-status">검수 페이지 →</Link>
        </Button>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <EtlUploadForm />
      </section>

      <section className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-2xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
        <p className="font-semibold">⚠️ 외부 도구 의존성 안내</p>
        <p className="mt-1 leading-relaxed">
          본 ETL은 <code className="font-mono">pdftotext</code> (poppler-utils)와{" "}
          <code className="font-mono">tesseract</code>(OCR fallback)에 의존합니다.
          두 바이너리가 설치된 환경(운영자 로컬 또는 별도 ETL 서버)에서 실행해주세요.
          미설치 환경에서는 503 응답과 함께 안내가 표시됩니다.
        </p>
      </section>
    </div>
  );
}
