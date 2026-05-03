import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { CountryProfile } from "./country/CountryProfile";
import { MarketProfile } from "./market/MarketProfile";
import { LocationProfile } from "./location/LocationProfile";

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
