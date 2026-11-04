import { Skeleton } from "../../components";
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3.5">
      <Skeleton className="h-16" />
      <Skeleton className="h-8" />
      <Skeleton className="h-32" />
    </div>
  );
}
