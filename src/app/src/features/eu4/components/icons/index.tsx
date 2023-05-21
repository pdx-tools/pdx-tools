import { Tooltip } from "antd";
import Image from "next/image";

type GameIconProps = {
  src: string;
  alt: string;
  height?: number;
  width?: number;
};

const GameIcon = ({ src, alt, height = 27, width = 27 }: GameIconProps) => {
  return (
    <Tooltip title={alt}>
      <Image src={src} alt={alt} height={height} width={width} />
    </Tooltip>
  );
};

export const PrestigeIcon = () => (
  <GameIcon src={require("./icon_prestige.png")} alt="Prestige" />
);

export const StabilityIcon = () => (
  <GameIcon src={require("./icon_stability.png")} alt="Stability" />
);

export const CorruptionIcon = () => (
  <GameIcon src={require("./icon_corruption.png")} alt="Corruption" />
);

export const ProfessionalismIcon = () => (
  <GameIcon src={require("./icon_professionalism.png")} alt="Professionalism" />
);

export const GoldIcon = () => (
  <GameIcon src={require("./icon_gold.png")} alt="Treasury" />
);

export const OverextensionIcon = () => (
  <GameIcon src={require("./icon_overextension.png")} alt="Overextension" />
);

export const DebtIcon = () => (
  <GameIcon src={require("./icon_debt.png")} alt="Debt" />
);

export const InnovativenessIcon = () => (
  <GameIcon src={require("./icon_innovativeness.png")} alt="Innovativeness" />
);

export const InflationIcon = () => (
  <GameIcon src={require("./icon_inflation.png")} alt="Inflation" />
);

export const InfantryIcon = () => (
  <GameIcon src={require("./icon_infantry.png")} alt="Infantry" />
);

export const CavalryIcon = () => (
  <GameIcon src={require("./icon_cavalry.png")} alt="Cavalry" />
);

export const ArtilleryIcon = () => (
  <GameIcon src={require("./icon_artillery.png")} alt="Artillery" />
);

export const ManpowerIcon = () => (
  <GameIcon src={require("./icon_manpower.png")} alt="Manpower" />
);

export const ArmyTraditionIcon = () => (
  <GameIcon src={require("./icon_army_tradition.png")} alt="Army Tradition" />
);

export const NavyTraditionIcon = () => (
  <GameIcon src={require("./icon_navy_tradition.png")} alt="Navy Tradition" />
);

export const PowerProjectionIcon = () => (
  <GameIcon
    src={require("./icon_power_projection.png")}
    alt="Power Projection"
  />
);

export const ReligiousUnityIcon = () => (
  <GameIcon src={require("./icon_religious_unity.png")} alt="Religious Unity" />
);

export const HeavyShipIcon = () => (
  <GameIcon src={require("./icon_heavy_ship.png")} alt="Heavy Ships" />
);

export const LightShipIcon = () => (
  <GameIcon src={require("./icon_light_ship.png")} alt="Light Ships" />
);

export const GalleyIcon = () => (
  <GameIcon src={require("./icon_galley.png")} alt="Galleys" />
);

export const TransportIcon = () => (
  <GameIcon src={require("./icon_transport.png")} alt="Transports" />
);

export const RulerIcon = () => (
  <GameIcon src={require("./icon_ruler.png")} alt="Ruler" />
);

export const AdminManaIcon = () => (
  <GameIcon
    src={require("./icon_powers_administrative.png")}
    alt="Admin Mana"
  />
);

export const DiplomaticManaIcon = () => (
  <GameIcon
    src={require("./icon_powers_diplomatic.png")}
    alt="Dipolmatic Mana"
  />
);

export const MilitaryManaIcon = () => (
  <GameIcon src={require("./icon_powers_military.png")} alt="Military Mana" />
);

export const AdminTechIcon = () => (
  <GameIcon
    src={require("./icon_powers_administrative_tech.png")}
    alt="Admin Tech"
  />
);

export const DiplomaticTechIcon = () => (
  <GameIcon
    src={require("./icon_powers_diplomatic_tech.png")}
    alt="Dipolmatic Tech"
  />
);

export const MilitaryTechIcon = () => (
  <GameIcon
    src={require("./icon_powers_military_tech.png")}
    alt="Military Tech"
  />
);

export const IdeaGroupsIcon = () => (
  <GameIcon src={require("./icon_idea_groups.png")} alt="Ideas" />
);

export const ReinforcementsIcon = () => (
  <GameIcon src={require("./icon_reinforcements.png")} alt="Reinforcements" />
);

export const MaxManpowerIcon = () => (
  <GameIcon src={require("./icon_max_manpower.png")} alt="Max Manpower" />
);

export const MercenaryIcon = () => (
  <GameIcon src={require("./icon_mercenary.png")} alt="Mercenary Regiments" />
);

export const ProvincesIcon = () => (
  <GameIcon src={require("./icon_provinces.png")} alt="Provinces" />
);

export const DevelopmentIcon = () => (
  <GameIcon src={require("./icon_development.png")} alt="Development" />
);

export const AverageAutonomyIcon = () => (
  <GameIcon src={require("./icon_autonomy.png")} alt="Average Autonomy" />
);

export const AutonomyDevelopmentIcon = () => (
  <GameIcon
    src={require("./icon_autonomy_development.png")}
    alt="Autonomy Adjusted Development"
  />
);

export const HordeUnityIcon = () => (
  <GameIcon src={require("./icon_horde_unity.png")} alt="Horde Unity" />
);

export const DevotionIcon = () => (
  <GameIcon src={require("./icon_devotion.png")} alt="Devotion" />
);

export const LegitimacyIcon = () => (
  <GameIcon src={require("./icon_legitimacy.png")} alt="Legitimacy" />
);

export const MeritocracyIcon = () => (
  <GameIcon src={require("./icon_meritocracy.png")} alt="Meritocracy" />
);

export const RepublicanTraditionIcon = () => (
  <GameIcon
    src={require("./icon_republican_tradition.png")}
    alt="Republican Tradition"
  />
);

export const AbsolutismIcon = () => (
  <GameIcon src={require("./icon_absolutism.png")} alt="Absolutism" />
);

export const MercantilismIcon = () => (
  <GameIcon src={require("./icon_mercantilism.png")} alt="Mercantilism" />
);

export const SplendorIcon = () => (
  <GameIcon src={require("./icon_splendor.png")} alt="Splendor" />
);

export const MerchantIcon = () => (
  <GameIcon
    src={require("./icon_merchant.png")}
    height={31}
    width={31}
    alt="Merchant"
  />
);

export const DiplomatIcon = () => (
  <GameIcon
    src={require("./icon_diplomat.png")}
    height={31}
    width={31}
    alt="Diplomat"
  />
);

export const MissionaryIcon = () => (
  <GameIcon
    src={require("./icon_missionary.png")}
    height={31}
    width={31}
    alt="Missionary"
  />
);

export const ColonistIcon = () => (
  <GameIcon
    src={require("./icon_colonist.png")}
    height={31}
    width={31}
    alt="Colonist"
  />
);
