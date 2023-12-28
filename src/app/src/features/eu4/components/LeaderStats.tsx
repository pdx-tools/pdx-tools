import { LeaderKind } from "../../../../../wasm-eu4/pkg/wasm_eu4";

export const LeaderStats = ({
  kind,
  fire,
  shock,
  maneuver,
  siege,
}: {
  kind: LeaderKind;
  fire?: number;
  shock?: number;
  maneuver?: number;
  siege?: number;
}) => {
  if (kind == "General" || kind == "Conquistador") {
    return (
      <div className="no-break tracking-widest">
        ({fire}/{shock}/{maneuver}/{siege})
      </div>
    );
  } else {
    return (
      <div className="no-break tracking-widest">
        ({fire}/{shock}/{maneuver})
      </div>
    );
  }
};
