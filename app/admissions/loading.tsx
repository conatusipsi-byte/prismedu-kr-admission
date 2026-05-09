import { Skeleton } from "@/components/ui/skeleton";

export default function AdmissionsLoading(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6">
      <Skeleton className="mb-6 h-12 w-1/3" />
      <Skeleton className="mb-6 h-10 w-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    </div>
  );
}
