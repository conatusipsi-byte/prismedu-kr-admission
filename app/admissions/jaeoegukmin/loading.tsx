import { Skeleton } from "@/components/ui/skeleton";

export default function JaeoegukminLoading() {
  return (
    <div>
      <div className="border-b bg-purple-50/40 py-8">
        <div className="mx-auto max-w-content px-gutter-sm md:px-gutter">
          <Skeleton className="mb-3 h-6 w-32" />
          <Skeleton className="mb-2 h-8 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <div className="mx-auto max-w-content px-gutter-sm md:px-gutter py-8">
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
