import React from "react";
import { cx } from "class-variance-authority";

export const SidebarNav = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  function SidebarNav({ className, ...props }, ref) {
    return <nav ref={ref} className={cx("flex flex-col overflow-hidden", className)} {...props} />;
  },
) as React.ForwardRefExoticComponent<
  React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>
> & {
  Section: typeof SidebarNavSection;
  Item: typeof SidebarNavItem;
};

interface SidebarNavSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

const SidebarNavSection = React.forwardRef<HTMLDivElement, SidebarNavSectionProps>(
  function SidebarNavSection({ className, label, children, ...props }, ref) {
    return (
      <div ref={ref} className={cx("flex flex-col overflow-hidden", className)} {...props}>
        {label && (
          <div className="flex h-9 shrink-0 items-center px-3.5">
            <h3 className="font-mono text-[9.5px] font-medium tracking-[0.28em] text-game-ink-500 uppercase">
              {label}
            </h3>
          </div>
        )}
        <div className="flex flex-col">{children}</div>
      </div>
    );
  },
);
SidebarNav.Section = SidebarNavSection;

interface SidebarNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  meta?: number;
}

const SidebarNavItem = React.forwardRef<HTMLButtonElement, SidebarNavItemProps>(
  function SidebarNavItem({ className, active, meta, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cx(
          "relative flex h-7 w-full items-center px-3.5 pr-3.5 text-left",
          "font-game-ui text-[12.5px] transition-colors duration-100",
          active
            ? "bg-linear-to-r from-game-accent-500/15 to-transparent text-game-accent-100"
            : "text-game-ink-300 hover:bg-game-panel-hover hover:text-game-ink-100",
          className,
        )}
        {...props}
      >
        <span
          className={cx(
            "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full",
            active ? "bg-game-accent-500" : "bg-transparent",
          )}
        />
        <span className={cx("flex-1 truncate", active && "font-medium")}>{children}</span>
        {meta !== undefined && (
          <span className="ml-2 shrink-0 font-game-num text-[10px] text-game-ink-500">{meta}</span>
        )}
      </button>
    );
  },
);
SidebarNav.Item = SidebarNavItem;
