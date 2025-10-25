import { useCallback, useState } from "react";
import { getEu4Worker } from "@/features/eu4/worker";
import type { Eu4Worker } from "@/features/eu4/worker";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { useOnNewSave } from "./useOnNewSave";
import { captureException } from "@/lib/captureException";

export const useEu4Worker = <T>(cb: (arg0: Eu4Worker) => Promise<T>) => {
  const [isLoading, setLoading] = useState(false);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useOnNewSave(
    useCallback(() => {
      let mounted = true;
      async function getData() {
        try {
          if (mounted) {
            setLoading(true);
            const worker = getEu4Worker();
            const result = await cb(worker);
            if (mounted) {
              setError(undefined);
              setData(result);
            }
          }
        } finally {
          if (mounted) {
            setLoading(false);
          }
        }
      }

      getData().catch((error) => {
        captureException(error);
        if (mounted) {
          setError(getErrorMessage(error));
        }
      });

      return () => {
        mounted = false;
      };
    }, [cb]),
  );

  return { isLoading, data, error };
};
