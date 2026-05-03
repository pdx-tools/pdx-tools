export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="h-16 animate-pulse rounded-lg bg-white/5" />
      <div className="h-8 animate-pulse rounded bg-white/5" />
      <div className="h-32 animate-pulse rounded bg-white/5" />
    </div>
  );
}
