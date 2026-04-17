import type React from "react";
import { cx } from "class-variance-authority";
import type { EntityRef } from "@/wasm/wasm_eu5";
import { useEu5Engine } from "../store";

type EntityLinkProps = {
  entity: EntityRef;
  className?: string;
  children?: React.ReactNode;
};

export function EntityLink({ entity, className, children }: EntityLinkProps) {
  const engine = useEu5Engine();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const idx = entity.anchorLocationIdx;
    const isCountry = entity.kind === "country";
    if (event.shiftKey) {
      void (isCountry ? engine.trigger.addCountry(idx) : engine.trigger.addMarket(idx));
    } else if (event.altKey) {
      void (isCountry ? engine.trigger.removeCountry(idx) : engine.trigger.removeMarket(idx));
    } else {
      void (isCountry ? engine.trigger.selectCountry(idx) : engine.trigger.selectMarket(idx));
    }
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
