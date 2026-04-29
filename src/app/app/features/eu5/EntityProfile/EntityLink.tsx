import type React from "react";
import { cx } from "class-variance-authority";
import type { EntityRef } from "@/wasm/wasm_eu5";
import { useEu5EntityActivate } from "../useEntityActivate";

type EntityLinkProps = {
  entity: EntityRef;
  className?: string;
  children?: React.ReactNode;
};

export function EntityLink({ entity, className, children }: EntityLinkProps) {
  const activate = useEu5EntityActivate();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    activate(entity, event);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cx(
        "inline-flex min-w-0 items-center gap-1.5 text-left text-sky-300 hover:text-sky-200 hover:underline",
        className,
      )}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-sm"
        style={{ backgroundColor: entity.colorHex }}
      />
      {entity.tag && <span className="font-mono text-xs text-slate-500">{entity.tag}</span>}
      {children ?? <span className="truncate">{entity.name}</span>}
    </button>
  );
}
