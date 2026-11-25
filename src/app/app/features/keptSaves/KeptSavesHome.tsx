import { lazy, Suspense } from "react";
import { useKept } from "./keptStore";

const Section = lazy(() => import("./KeptSavesHomeSection"));

/** The way back to kept saves after a restart, for a player who has some. */
export function KeptSavesHome() {
  const hasSome = useKept(
    ({ saves, watches }) => !!saves && (saves.length > 0 || Object.keys(watches).length > 0),
  );
  return hasSome ? (
    <Suspense fallback={null}>
      <Section />
    </Suspense>
  ) : null;
}
