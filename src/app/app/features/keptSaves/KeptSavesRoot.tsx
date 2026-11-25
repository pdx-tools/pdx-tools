import { lazy, Suspense, useEffect } from "react";
import { useKept } from "./keptStore";
import { watchStatus } from "./status";
import { useKeptUi } from "./ui";
import { startKeptSaves } from "./watchService";

const KeptDialogs = lazy(() => import("./KeptDialogs"));

/** The most important problem of any watch, for a tab that is not in view. */
function useTitlePrefix(): string | null {
  return useKept(
    (state) => watchStatus("eu4", state).titlePrefix ?? watchStatus("eu5", state).titlePrefix,
  );
}

/** Keep the prefix on the titles that pages set. */
function useTitleWithPrefix(prefix: string | null) {
  useEffect(() => {
    if (prefix === null) return;
    const apply = () => {
      if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      if (document.title.startsWith(prefix)) document.title = document.title.slice(prefix.length);
    };
  }, [prefix]);
}

/** Watch the games on every page. */
export function KeptSavesRoot() {
  useEffect(startKeptSaves, []);
  useTitleWithPrefix(useTitlePrefix());
  const needsDialogs = useKeptUi(
    ({ upload, remove, uploads }) =>
      upload !== null || remove !== null || Object.keys(uploads).length > 0,
  );
  return needsDialogs ? (
    <Suspense fallback={null}>
      <KeptDialogs />
    </Suspense>
  ) : null;
}
