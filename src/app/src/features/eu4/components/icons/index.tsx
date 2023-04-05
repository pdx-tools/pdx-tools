import { Tooltip } from "antd";
import Image from "next/image";

type GameIconProps = {
  src: string;
  alt: string;
  height: number;
  width: number;
};

const GameIcon = ({ src, alt, height, width }: GameIconProps) => {
  return (
    <Tooltip title={alt}>
      <Image src={src} alt={alt} height={height} width={width} />
    </Tooltip>
  );
};

export const PrestigeIcon = () => (
  <GameIcon
    src={require("./icon_prestige.png")}
    alt="Prestige"
    height={27}
    width={27}
  />
);

export const StabilityIcon = () => (
  <GameIcon
    src={require("./icon_stability.png")}
    alt="Stability"
    height={27}
    width={27}
  />
);

export const CorruptionIcon = () => (
  <GameIcon
    src={require("./icon_corruption.png")}
    alt="Corruption"
    height={27}
    width={27}
  />
);

export const ProfessionalismIcon = () => (
  <GameIcon
    src={require("./icon_professionalism.png")}
    alt="Professionalism"
    height={27}
    width={27}
  />
);

export const GoldIcon = () => (
  <GameIcon
    src={require("./icon_gold.png")}
    alt="Treasury"
    height={27}
    width={27}
  />
);

export const OverextensionIcon = () => (
  <GameIcon
    src={require("./icon_overextension.png")}
    alt="Overextension"
    height={27}
    width={27}
  />
);

export const DebtIcon = () => (
  <GameIcon
    src={require("./icon_debt.png")}
    alt="Debt"
    height={27}
    width={27}
  />
);

export const InnovativenessIcon = () => (
  <GameIcon
    src={require("./icon_innovativeness.png")}
    alt="Innovativeness"
    height={27}
    width={27}
  />
);

export const InflationIcon = () => (
  <GameIcon
    src={require("./icon_inflation.png")}
    alt="Inflation"
    height={27}
    width={27}
  />
);

export const InfantryIcon = () => (
  <GameIcon
    src={require("./icon_infantry.png")}
    alt="Infantry"
    height={27}
    width={27}
  />
);

export const CavalryIcon = () => (
  <GameIcon
    src={require("./icon_cavalry.png")}
    alt="Cavalry"
    height={27}
    width={27}
  />
);

export const ArtilleryIcon = () => (
  <GameIcon
    src={require("./icon_artillery.png")}
    alt="Artillery"
    height={27}
    width={27}
  />
);

export const ManpowerIcon = () => (
  <GameIcon
    src={require("./icon_manpower.png")}
    alt="Manpower"
    height={27}
    width={27}
  />
);

export const ArmyTraditionIcon = () => (
  <GameIcon
    src={require("./icon_army_tradition.png")}
    alt="Army Tradition"
    height={27}
    width={27}
  />
);

export const NavyTraditionIcon = () => (
  <GameIcon
    src={require("./icon_navy_tradition.png")}
    alt="Navy Tradition"
    height={27}
    width={27}
  />
);

export const PowerProjectionIcon = () => (
  <GameIcon
    src={require("./icon_power_projection.png")}
    alt="Power Projection"
    height={27}
    width={27}
  />
);

export const ReligiousUnityIcon = () => (
  <GameIcon
    src={require("./icon_religious_unity.png")}
    alt="Religious Unity"
    height={27}
    width={27}
  />
);

export const HeavyShipIcon = () => (
  <GameIcon
    src={require("./icon_heavy_ship.png")}
    alt="Heavy Ships"
    height={27}
    width={27}
  />
);

export const LightShipIcon = () => (
  <GameIcon
    src={require("./icon_light_ship.png")}
    alt="Light Ships"
    height={27}
    width={27}
  />
);

export const GalleyIcon = () => (
  <GameIcon
    src={require("./icon_galley.png")}
    alt="Galleys"
    height={27}
    width={27}
  />
);

export const TransportIcon = () => (
  <GameIcon
    src={require("./icon_transport.png")}
    alt="Transports"
    height={27}
    width={27}
  />
);

export const RulerIcon = () => (
  <GameIcon
    src={require("./icon_ruler.png")}
    alt="Ruler"
    height={27}
    width={27}
  />
);

export const AdminManaIcon = () => (
  <GameIcon
    src={require("./icon_powers_administrative.png")}
    alt="Admin Mana"
    height={27}
    width={27}
  />
);

export const DiplomaticManaIcon = () => (
  <GameIcon
    src={require("./icon_powers_diplomatic.png")}
    alt="Dipolmatic Mana"
    height={27}
    width={27}
  />
);

export const MilitaryManaIcon = () => (
  <GameIcon
    src={require("./icon_powers_military.png")}
    alt="Military Mana"
    height={27}
    width={27}
  />
);

export const AdminTechIcon = () => (
  <GameIcon
    src={require("./icon_powers_administrative_tech.png")}
    alt="Admin Tech"
    height={27}
    width={27}
  />
);

export const DiplomaticTechIcon = () => (
  <GameIcon
    src={require("./icon_powers_diplomatic_tech.png")}
    alt="Dipolmatic Tech"
    height={27}
    width={27}
  />
);

export const MilitaryTechIcon = () => (
  <GameIcon
    src={require("./icon_powers_military_tech.png")}
    alt="Military Tech"
    height={27}
    width={27}
  />
);

export const IdeaGroupsIcon = () => (
  <GameIcon
    src={require("./icon_idea_groups.png")}
    alt="Ideas"
    height={27}
    width={27}
  />
);

export const ReinforcementsIcon = () => (
  <GameIcon
    src={require("./icon_reinforcements.png")}
    alt="Reinforcements"
    height={27}
    width={27}
  />
);

export const MaxManpowerIcon = () => (
  <GameIcon
    src={require("./icon_max_manpower.png")}
    alt="Max Manpower"
    height={27}
    width={27}
  />
);

export const MercenaryIcon = () => (
  <GameIcon
    src={require("./icon_mercenary.png")}
    alt="Mercenary Regiments"
    height={27}
    width={27}
  />
);

export const ProvincesIcon = () => (
  <GameIcon
    src={require("./icon_provinces.png")}
    alt="Provinces"
    height={27}
    width={27}
  />
);

export const DevelopmentIcon = () => (
  <GameIcon
    src={require("./icon_development.png")}
    alt="Development"
    height={27}
    width={27}
  />
);

export const AverageAutonomyIcon = () => (
  <GameIcon
    src={require("./icon_autonomy.png")}
    alt="Average Autonomy"
    height={27}
    width={27}
  />
);

export const AutonomyDevelopmentIcon = () => (
  <GameIcon
    src={require("./icon_autonomy_development.png")}
    alt="Autonomy Adjusted Development"
    height={27}
    width={27}
  />
);
