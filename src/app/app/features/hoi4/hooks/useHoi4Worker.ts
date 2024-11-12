import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { Hoi4Worker } from "../worker/bridge";
import { getHoi4Worker } from "../worker";
import { captureException } from "@/lib/captureException";

export const useHoi4Worker = <T>(cb: (arg0: Hoi4Worker) => Promise<T>) => {
  const [isLoading, setLoading] = useState(false);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    async function getData() {
      try {
        if (mounted) {
          setLoading(true);
          const worker = getHoi4Worker();
          const result = await cb(worker);
          if (mounted) {
            setError(undefined);
            setData(result);
          }
        }
      } catch (error) {
        captureException(error);
        setError(getErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    getData();

    return () => {
      mounted = false;
    };
  }, [cb]);

  return { isLoading, data, error };
};
