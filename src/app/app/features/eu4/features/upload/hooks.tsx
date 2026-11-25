import { useMemo, useState } from "react";
import { useEu4ParsedSource, useEu4SaveInput, useSaveFilename } from "../../store";
import { pairUpload } from "@/features/keptSaves/watchService";
import { beginUpload } from "@/features/keptSaves/ui";
import { pdxApi } from "@/services/appApi";

interface UploadFormValues {
  aar?: string;
}

export type FileUploadMutation = ReturnType<typeof useFileUpload>;
export const useFileUpload = () => {
  const [progress, setProgress] = useState<undefined | number>(undefined);
  const addEndpoint = pdxApi.saves.useAdd();
  const filename = useSaveFilename();
  const source = useEu4ParsedSource();
  const input = useEu4SaveInput();

  return useMemo(() => {
    const { ...rest } = addEndpoint;
    return {
      ...rest,
      progress,
      upload: (values: UploadFormValues) => {
        const end = beginUpload();
        if (end === null) return;
        const pair = input.kind === "server" ? null : pairUpload("eu4", input);
        // The promise also settles when the view closes.
        addEndpoint
          .mutateAsync({
            source,
            dispatch: (x) => setProgress(x.progress),
            values: {
              ...values,
              filename,
            },
          })
          .then(({ save_id }) => pair?.(save_id, source.hash))
          // The mutation holds the error.
          .catch(() => {})
          .finally(() => {
            end();
            setProgress(undefined);
          });
      },
    };
  }, [addEndpoint, filename, source, input, progress]);
};
