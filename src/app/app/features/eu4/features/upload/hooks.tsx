import { useMemo, useState } from "react";
import { useSaveFilename } from "../../store";
import { pdxApi } from "@/services/appApi";

interface UploadFormValues {
  aar?: string;
}

export type FileUploadMutation = ReturnType<typeof useFileUpload>;
export const useFileUpload = () => {
  const [progress, setProgress] = useState<undefined | number>(undefined);
  const addEndpoint = pdxApi.saves.useAdd();
  const filename = useSaveFilename();

  return useMemo(() => {
    const { ...rest } = addEndpoint;
    return {
      ...rest,
      progress,
      upload: (values: UploadFormValues) =>
        addEndpoint.mutate(
          {
            dispatch: (x) => setProgress(x.progress),
            values: {
              ...values,
              filename,
            },
          },
          {
            onSettled: () => setProgress(undefined),
          },
        ),
    };
  }, [addEndpoint, filename, progress]);
};
