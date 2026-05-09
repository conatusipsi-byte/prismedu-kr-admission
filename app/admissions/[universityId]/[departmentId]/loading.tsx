import { Skeleton } from "@/components/ui/skeleton";

export default function DepartmentDetailLoading() {
  return (
    <div className="mx-auto max-w-content-full px-gutter-sm md:px-gutter lg:px-gutter-lg pb-12">
      <div className="flex flex-col gap-3 border-b py-6">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
