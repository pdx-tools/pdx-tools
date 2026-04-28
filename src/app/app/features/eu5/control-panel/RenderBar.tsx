import { ViewToggles } from "./ViewToggles";
import { Legend } from "./Legend";
import { useEu5MapModeGradient } from "../store";

export function RenderBar() {
  const hasLegend = useEu5MapModeGradient() != null;

  return (
    <section className="shrink-0 border-b border-eu5-line">
      {hasLegend && <Legend />}
      <div className="flex items-center px-3.5 py-2">
        <ViewToggles />
      </div>
    </section>
  );
}
