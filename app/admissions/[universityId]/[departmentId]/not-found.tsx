import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DepartmentNotFound() {
  return (
    <div className="mx-auto max-w-content py-16 text-center">
      <p className="mb-2 text-3xl font-bold">404</p>
      <h1 className="mb-2 text-xl font-semibold">존재하지 않는 학과입니다</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        요청하신 학과를 찾을 수 없어요. 학과 검색에서 다시 찾아보세요.
      </p>
      <div className="flex justify-center gap-2">
        <Button asChild>
          <Link href="/admissions">학과 검색으로</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">홈으로</Link>
        </Button>
      </div>
    </div>
  );
}
