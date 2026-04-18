import { ViewToggles } from "./ViewToggles";
import { Legend } from "./Legend";
import { useEu5MapMode } from "../store";
import { GRADIENT_MODES } from "./modeConfig";

export function RenderBar() {
  const mapMode = useEu5MapMode();
  const hasLegend = GRADIENT_MODES.has(mapMode);

  return (
    <section className="shrink-0 border-b border-eu5-line">
      {hasLegend && <Legend />}
      <div className="flex items-center px-3.5 py-2">
        <ViewToggles />
      </div>
    </section>
  );
}
