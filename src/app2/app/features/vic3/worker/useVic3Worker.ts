import { useCallback, useEffect, useState } from "react";
import { Vic3Worker } from "./bridge";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { getVic3Worker } from ".";
import { useVic3Meta } from "../store";
import { captureException } from "@/lib/captureException";

export const useVic3Worker = <T>(cb: (arg0: Vic3Worker) => Promise<T>) => {
  const [isLoading, setLoading] = useState(false);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const meta = useVic3Meta();

  const onNewSave = useCallback(() => {
    let mounted = true;
    async function getData() {
      try {
        if (mounted) {
          setLoading(true);
          const worker = getVic3Worker();
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

  useEffect(() => {
    onNewSave();
  }, [meta, onNewSave]);

  return { isLoading, data, error };
};
