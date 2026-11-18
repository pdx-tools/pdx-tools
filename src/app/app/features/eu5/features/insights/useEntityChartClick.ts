import { useEffectEvent } from "react";
import { inspectShownSnapshot } from "../../history/previewSession";
import { useInsightPreview } from "../../history/insightPreview";
import type * as echarts from "echarts/core";
import { entityProfileEntry, usePanelNav } from "../profiles/PanelNavContext";
import { useEu5Engine } from "../../store";
import { useJumpToEntity } from "../../useJumpToEntity";
import { useEu5MapHoverSource } from "../../useEu5MapHoverTarget";

type EntityChartTarget = {
  id: number;
  anchorLocationIdx: number;
  label: string;
};

type GetTarget = (params: echarts.ECElementEvent) => EntityChartTarget | null | undefined;

/**
 * A click on a country selects it, as the map does: Shift, Ctrl or Cmd adds
 * it, and Alt removes it. A click on a market opens its profile.
 */
export function useEu5EntityChartClick(
  opts:
    | { kind: "country"; getTarget: GetTarget }
    | { kind: "market"; backLabel: string; getTarget: GetTarget },
) {
  const preview = useInsightPreview();
  const nav = usePanelNav();
  const engine = useEu5Engine();
  const jumpToEntity = useJumpToEntity();
  const hoverSource = useEu5MapHoverSource();

  const handleClick = useEffectEvent((params: echarts.ECElementEvent) => {
    const target = opts.getTarget(params);
    if (target == null) return;
    const ev = params.event?.event as MouseEvent | undefined;
    const kind = opts.kind === "country" ? "countries" : "markets";
    const add = opts.kind === "country" && (ev?.shiftKey || ev?.ctrlKey || ev?.metaKey);
    if (preview) {
      if (preview.canInspect()) {
        inspectShownSnapshot(preview.id, {
          kind,
          id: target.id,
          op: ev?.altKey ? "remove" : add ? "add" : "replace",
        });
      }
      return;
    }

    if (ev?.altKey) {
      void engine.commands.changeSelection("remove", kind, [target.id]);
      return;
    }

    if (opts.kind === "country") {
      if (add) {
        void engine.commands.changeSelection("add", kind, [target.id]);
      } else {
        void engine.commands.changeSelection("replace", kind, [target.id]);
        jumpToEntity(target.anchorLocationIdx);
      }
      return;
    }

    nav.pushMany([entityProfileEntry(opts.kind, target.id, target.label)], opts.backLabel);
    jumpToEntity(target.anchorLocationIdx);
  });

  const handleMouseover = useEffectEvent((params: echarts.ECElementEvent) => {
    if (preview) return;
    const target = opts.getTarget(params);
    if (target == null) {
      hoverSource.clear();
      return;
    }

    hoverSource.highlightTarget(
      opts.kind === "country"
        ? { kind: "country", countryIdx: target.id }
        : { kind: "market", marketId: target.id },
    );
  });

  const handleMouseout = useEffectEvent(() => {
    hoverSource.clear();
  });

  return (chart: echarts.ECharts) => {
    chart.on("click", handleClick);
    chart.on("mouseover", handleMouseover);
    chart.on("mouseout", handleMouseout);
  };
}
