import { useEffect } from "react";
import { useLocation } from "react-router";
import { useEngineActions } from "../engineStore";

/**
 * Only the home page shows the save of the engine input. When the page
 * goes to another route, end the analysis of that save.
 *
 * The effect gives the same result when it runs again, so it is correct
 * when StrictMode mounts it two times. A save that is set before a
 * navigation to the home page stays.
 */
export function useHomeSaveScope() {
  const { pathname } = useLocation();
  const { resetSaveAnalysis } = useEngineActions();
  useEffect(() => {
    if (pathname !== "/") resetSaveAnalysis();
  }, [pathname, resetSaveAnalysis]);
}
