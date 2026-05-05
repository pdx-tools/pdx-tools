import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { CountryProfile } from "./country/CountryProfile";
import { MarketProfile } from "./market/MarketProfile";
import { LocationProfile } from "./location/LocationProfile";

interface Props {
  identity: ActiveProfileIdentity;
}

export function EntityProfileRoot({ identity }: Props) {
  if (identity.kind === "country") {
    return <CountryProfile countryIdx={identity.country_idx} />;
  }
  if (identity.kind === "market") {
    return <MarketProfile marketId={identity.market_id} />;
  }
  return <LocationProfile locationIdx={identity.location_idx} />;
}
