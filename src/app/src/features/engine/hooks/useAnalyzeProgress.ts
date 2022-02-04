import { useCallback, useRef } from "react";
import { useDispatch } from "react-redux";
import { formatFloat } from "@/lib/format";
import { AnalyzeEvent } from "../worker/worker-types";
import {
  incrementSaveAnalyzePercent,
  setSaveAnalyzePercent,
} from "../engineSlice";
import { log } from "@/lib/log";

export function useAnalyzeProgress() {
  const dispatch = useDispatch();
  const timeoutId = useRef<ReturnType<typeof setTimeout>>();

  return useCallback(
    (evt: AnalyzeEvent) => {
      if (evt.kind === "incremental progress") {
        dispatch(incrementSaveAnalyzePercent(evt.percent));
      } else {
        dispatch(setSaveAnalyzePercent(evt.percent));
      }

      const elapsedTime = formatFloat(evt.elapsedMs, 2);
      const progressTail = `${evt.percent}% | ${elapsedTime}ms`;

      switch (evt.kind) {
        case "bytes read": {
          const kb = formatFloat(evt.amount / 1000, 2);
          log(`read ${kb} KB | ${progressTail}`);
          break;
        }
        case "detected": {
          log(`detected data to be ${evt.type} | ${progressTail}`);
          break;
        }
        case "progress": {
          if (evt.elapsedMs !== 0) {
            log(`${evt.msg} | ${progressTail}`);
          }
          break;
        }
        case "incremental progress": {
          log(`${evt.msg} | ${elapsedTime}ms`);
          break;
        }
        case "start poll": {
          let current = evt.percent;
          const end = evt.endPercent;
          function pollPercent() {
            current += 3;
            if (current > end) {
              return;
            }

            dispatch(setSaveAnalyzePercent(current));
            timeoutId.current = setTimeout(() => pollPercent(), 33);
          }

          pollPercent();
          break;
        }
        case "end poll": {
          if (timeoutId.current) {
            clearTimeout(timeoutId.current);
          }
          break;
        }
      }
    },
    [dispatch]
  );
}
