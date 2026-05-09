import { Skeleton } from "@/components/ui/skeleton";

export default function AnalysisLoading(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6">
      <Skeleton className="mb-2 h-8 w-1/3" />
      <Skeleton className="mb-6 h-4 w-2/3" />
      <Skeleton className="mb-3 h-10 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
