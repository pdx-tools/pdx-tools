import { ViewToggles } from "./ViewToggles";
import { Legend } from "./Legend";
import { footLabel, footRow } from "./footRow";

export function RenderBar() {
  return (
    <section className="shrink-0">
      <Legend />
      <div className={footRow}>
        <span className={footLabel}>View</span>
        <ViewToggles />
      </div>
    </section>
  );
}
