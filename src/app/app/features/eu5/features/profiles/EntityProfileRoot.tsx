import type { ActiveProfileIdentity } from "@/wasm/wasm_eu5";
import { CountryProfile } from "./country/CountryProfile";
import { MarketProfile } from "./market/MarketProfile";
import { LocationProfile } from "./location/LocationProfile";
import type { ProfileSection } from "./PanelNavContext";

interface Props {
  identity: ActiveProfileIdentity;
  section?: ProfileSection;
}

export function EntityProfileRoot({ identity, section }: Props) {
  if (identity.kind === "country") {
    return <CountryProfile countryIdx={identity.country.key} section={section} />;
  }
  if (identity.kind === "market") {
    return <MarketProfile marketId={identity.market.key} section={section} />;
  }
  return <LocationProfile locationIdx={identity.location.key} section={section} />;
}
