import { useEffect } from "react";
import { cx } from "class-variance-authority";
import classes from "./FullscreenPage.module.css";

/**
 * The shell a full-screen game UI needs: a fixed, viewport-sized box for its
 * `absolute inset-0` layers and a body that does not scroll. A game mounted
 * without it lets its overlays grow the document and shows a scrollbar. The
 * slide-in is for the landing page, where the game replaces the page.
 */
export const FullscreenPage = ({
  children,
  slideIn = true,
}: React.PropsWithChildren<{ slideIn?: boolean }>) => {
  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, []);

  return (
    <div
      className={cx(
        "fixed inset-0 z-200 bg-white dark:bg-slate-900",
        slideIn && classes["slide-in"],
      )}
    >
      {children}
    </div>
  );
};
