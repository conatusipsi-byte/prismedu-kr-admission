import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading(): React.ReactElement {
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-content flex-col gap-4 px-gutter-sm md:px-gutter lg:px-gutter-lg py-6">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-full w-full flex-1" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
