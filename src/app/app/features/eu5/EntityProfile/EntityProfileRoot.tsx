import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { useEu5SelectionState } from "../store";
import { CountryProfile } from "./CountryProfile";
import { MarketProfile } from "./MarketProfile";
import { LocationProfile } from "./LocationProfile";

interface Props {
  identity?: ActiveProfileIdentity | null;
}

export function EntityProfileRoot({ identity }: Props = {}) {
  const selection = useEu5SelectionState();
  const activeIdentity = identity ?? selection?.activeProfile ?? null;
  const showFocusBack =
    identity == null &&
    activeIdentity?.kind === "location" &&
    selection?.focusedLocation === activeIdentity.location_idx;

  if (activeIdentity == null) return null;

  if (activeIdentity.kind === "country") {
    return <CountryProfile anchorLocationIdx={activeIdentity.anchor_location_idx} />;
  }
  if (activeIdentity.kind === "market") {
    return <MarketProfile anchorLocationIdx={activeIdentity.anchor_location_idx} />;
  }
  return (
    <LocationProfile
      locationIdx={activeIdentity.location_idx}
      showBreadcrumb={showFocusBack}
      scopeName={selection?.scopeDisplayName}
    />
  );
}
