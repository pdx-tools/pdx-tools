import React, { useMemo } from "react";
import { pdxApi } from "@/services/appApi";
import { useToastOnError } from "@/hooks/useToastOnError";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { SaveCard } from "@/features/account/SaveCard";

export const NewestSavesTable = () => {
  const { data, isFetching, hasNextPage, fetchNextPage, error } =
    pdxApi.saves.useNewest();

  useToastOnError(error, "Failed to fetch latest saves");
  const saves = useMemo(() => data?.pages.flatMap((x) => x.saves), [data]);

  const { ref } = useIntersectionObserver<HTMLDivElement>({
    enabled: !isFetching && !error,
    onIntersect: hasNextPage ? fetchNextPage : undefined,
    rootMargin: "200px",
    threshold: 0,
  });

  return (
    <div className="flex flex-col space-y-8">
      {saves.map((x) => (
        <SaveCard
          key={x.id}
          save={{
            ...x,
            filename: "",
            name: "",
            playthrough_id: "",
          }}
          isPrivileged={false}
        />
      ))}
      <div ref={ref} />
      {isFetching ? (
        <div className="m-8 flex justify-center">
          <LoadingIcon className="h-8 w-8" />
        </div>
      ) : null}
    </div>
  );
};
