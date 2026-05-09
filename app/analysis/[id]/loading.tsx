import { Skeleton } from "@/components/ui/skeleton";

export default function AnalysisResultLoading(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6">
      <Skeleton className="mb-2 h-8 w-1/3" />
      <Skeleton className="mb-6 h-4 w-2/3" />
      {/* 3 섹션 카드 그리드 */}
      {Array.from({ length: 3 }).map((_, sec) => (
        <section key={sec} className="mb-6 flex flex-col gap-3">
          <Skeleton className="h-5 w-1/4" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
