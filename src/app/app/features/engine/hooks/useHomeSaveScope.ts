import { useEffect } from "react";
import { useLocation } from "react-router";
import { useEngineActions } from "../engineStore";

/** Release the home page analysis when another route takes ownership of the page. */
export function useHomeSaveScope() {
  const { pathname } = useLocation();
  const { resetSaveAnalysis } = useEngineActions();
  useEffect(() => {
    if (pathname !== "/") resetSaveAnalysis();
  }, [pathname, resetSaveAnalysis]);
}
