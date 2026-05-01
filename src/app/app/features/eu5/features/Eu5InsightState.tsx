import type { ReactNode } from "react";

type Eu5InsightStateKind = "loading" | "empty" | "no-data" | "unsupported" | "error";

const COPY: Record<Eu5InsightStateKind, { eyebrow: string; title: string }> = {
  loading: { eyebrow: "Loading", title: "Computing..." },
  empty: { eyebrow: "Empty", title: "No entities for this selection." },
  "no-data": { eyebrow: "No data", title: "Metric not recorded for this period." },
  unsupported: {
    eyebrow: "Unsupported selection",
    title: "This panel does not support the current selection.",
  },
  error: { eyebrow: "Recoverable error", title: "Couldn't load this panel." },
};

type Eu5InsightStateProps = {
  kind: Eu5InsightStateKind;
  title?: string;
  body?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function Eu5InsightState({
  kind,
  title,
  body,
  children,
  className = "",
}: Eu5InsightStateProps) {
  const copy = COPY[kind];

  return (
    <div
      className={[
        "flex min-h-[180px] flex-col justify-center gap-3 rounded-[var(--radius-panel)]",
        "border border-game-line-strong bg-game-panel p-6",
        className,
      ].join(" ")}
    >
      <div className="font-game-num text-[10.5px] tracking-[.14em] text-game-ink-700 uppercase">
        {copy.eyebrow}
      </div>
      <div className="text-sm font-semibold text-game-ink-100">{title ?? copy.title}</div>
      {body ? <div className="max-w-[36ch] text-[12.5px] text-game-ink-500">{body}</div> : null}
      {kind === "loading" ? <Eu5InsightSkeletonRows /> : null}
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Eu5InsightLoadingState({ className }: { className?: string }) {
  return <Eu5InsightState kind="loading" className={className} />;
}

export function Eu5InsightErrorState({ error, className }: { error?: Error; className?: string }) {
  return (
    <Eu5InsightState
      kind="error"
      body={error?.message ? error.message : "The game worker returned an unexpected error."}
      className={className}
    />
  );
}

export function Eu5InsightEmptyState({
  title,
  body = "Reduce the filter set or widen the geographic selection.",
  className,
}: {
  title?: string;
  body?: ReactNode;
  className?: string;
}) {
  return <Eu5InsightState kind="empty" title={title} body={body} className={className} />;
}

function Eu5InsightSkeletonRows() {
  return (
    <div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="grid gap-3 border-b border-game-line py-2"
          style={{ gridTemplateColumns: "36px 1fr 80px 80px" }}
        >
          <div className="h-2.5 rounded-[1px] bg-game-panel-active" />
          <div className="h-2.5 rounded-[1px] bg-game-panel-active" />
          <div className="h-2.5 rounded-[1px] bg-game-panel-active" />
          <div className="h-2.5 rounded-[1px] bg-game-panel-active" />
        </div>
      ))}
    </div>
  );
}
