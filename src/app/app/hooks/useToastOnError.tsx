import { useEffect } from "react";
import { toast } from "@/lib/toast";

export function useToastOnError(error: Error | null, title: string) {
  useEffect(() => {
    if (error) {
      toast.error(title, {
        description: error.message,
        duration: Infinity,
        closeButton: true,
      });
    }
  }, [error, title]);
}
