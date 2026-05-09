import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 분석 결과 not-found —
 *   1. matchId 형식 부적절
 *   2. 미인증 (세션 쿠키 없음 또는 만료)
 *   3. 다른 사용자의 matchId 접근 (열거 차단을 위해 403 대신 not-found)
 *
 * 분기 사유는 의도적으로 모호하게 — "있다/없다" 정보를 노출하지 않음.
 */
export default function AnalysisResultNotFound(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">분석 결과를 찾을 수 없어요</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        결과가 없거나, 로그인 세션이 만료되었을 수 있어요. 새 분석을 시작하세요.
      </p>
      <div className="flex justify-center gap-2">
        <Button asChild>
          <Link href="/analysis">새 분석 시작</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">홈으로</Link>
        </Button>
      </div>
    </div>
  );
}
