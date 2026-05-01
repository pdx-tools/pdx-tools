import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { CountryProfile } from "./CountryProfile";
import { MarketProfile } from "./MarketProfile";
import { LocationProfile } from "./LocationProfile";

interface Props {
  identity: ActiveProfileIdentity;
}

export function EntityProfileRoot({ identity }: Props) {
  if (identity.kind === "country") {
    return <CountryProfile anchorLocationIdx={identity.anchor_location_idx} />;
  }
  if (identity.kind === "market") {
    return <MarketProfile anchorLocationIdx={identity.anchor_location_idx} />;
  }
  return <LocationProfile locationIdx={identity.location_idx} />;
}
