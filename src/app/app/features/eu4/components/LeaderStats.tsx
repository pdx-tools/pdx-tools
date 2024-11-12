import { LeaderKind } from "../../../../../wasm-eu4/pkg/wasm_eu4";

export const LeaderStats = ({
  kind,
  fire,
  shock,
  maneuver,
  siege,
  showParentheses = true,
}: {
  kind: LeaderKind;
  fire?: number;
  shock?: number;
  maneuver?: number;
  siege?: number;
  showParentheses?: boolean;
}) => {
  if (kind == "General" || kind == "Conquistador") {
    return (
      <div className="no-break tracking-widest">
        {showParentheses && `(`}
        {fire}/{shock}/{maneuver}/{siege}
        {showParentheses && `)`}
      </div>
    );
  } else {
    return (
      <div className="no-break tracking-widest">
        {showParentheses && `(`}
        {fire}/{shock}/{maneuver}
        {showParentheses && `)`}
      </div>
    );
  }
};
