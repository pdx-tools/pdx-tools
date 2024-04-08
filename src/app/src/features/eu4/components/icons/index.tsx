import { Tooltip } from "@/components/Tooltip";
import data from "./icons.json";
import imageUrl from "./icons.webp";
import React from "react";
import { spriteDimension } from "../Sprite";

type GameIconProps = {
  src: keyof typeof data;
  alt: string;
  height?: number;
  width?: number;
};

const dimensions = spriteDimension({ data });

const GameIcon = ({ src, alt, height = 27, width = 27 }: GameIconProps) => {
  const { row, col } = dimensions.coordinates(data[src]);
  const startx = col * 32;
  const starty = row * 32;
  return (
    <Tooltip>
      <Tooltip.Trigger className="w-max">
        <div
          role={"img"}
          aria-label={alt}
          style={{
            minWidth: width,
            minHeight: height,
            maxWidth: width,
            maxHeight: height,
            backgroundImage: `url(${imageUrl})`,
            backgroundPosition: `-${startx}px -${starty}px`,
          }}
        />
        <Tooltip.Content>{alt}</Tooltip.Content>
      </Tooltip.Trigger>
    </Tooltip>
  );
};

export const PrestigeIcon = () => <GameIcon src={"prestige"} alt="Prestige" />;

export const StabilityIcon = () => (
  <GameIcon src={"stability"} alt="Stability" />
);

export const CorruptionIcon = () => (
  <GameIcon src={"corruption"} alt="Corruption" />
);

export const ProfessionalismIcon = () => (
  <GameIcon src={"professionalism"} alt="Professionalism" />
);

export const GoldIcon = () => <GameIcon src={"gold"} alt="Treasury" />;

export const OverextensionIcon = () => (
  <GameIcon src={"overextension"} alt="Overextension" />
);

export const DebtIcon = () => <GameIcon src={"debt"} alt="Debt" />;

export const InnovativenessIcon = () => (
  <GameIcon src={"innovativeness"} alt="Innovativeness" />
);

export const InflationIcon = () => (
  <GameIcon src={"inflation"} alt="Inflation" />
);

export const InfantryIcon = ({ alt = "Infantry" }: { alt?: string }) => (
  <GameIcon src={"infantry"} alt={alt} />
);

export const CavalryIcon = () => <GameIcon src={"cavalry"} alt="Cavalry" />;

export const ArtilleryIcon = () => (
  <GameIcon src={"artillery"} alt="Artillery" />
);

export const ManpowerIcon = () => <GameIcon src={"manpower"} alt="Manpower" />;

export const ArmyTraditionIcon = () => (
  <GameIcon src={"army_tradition"} alt="Army Tradition" />
);

export const NavyTraditionIcon = () => (
  <GameIcon src={"navy_tradition"} alt="Navy Tradition" />
);

export const PowerProjectionIcon = () => (
  <GameIcon src={"power_projection"} alt="Power Projection" />
);

export const ReligiousUnityIcon = () => (
  <GameIcon src={"religious_unity"} alt="Religious Unity" />
);

export const HeavyShipIcon = ({ alt = "Heavy Ships" }: { alt?: string }) => (
  <GameIcon src={"heavy_ship"} alt={alt} />
);

export const LightShipIcon = () => (
  <GameIcon src={"light_ship"} alt="Light Ships" />
);

export const GalleyIcon = () => <GameIcon src={"galley"} alt="Galleys" />;

export const TransportIcon = () => (
  <GameIcon src={"transport"} alt="Transports" />
);

export const RulerIcon = () => <GameIcon src={"ruler"} alt="Ruler" />;

export const AdminManaIcon = () => (
  <GameIcon src={"powers_administrative"} alt="Admin Mana" />
);

export const AdminManaFocusedIcon = () => (
  <GameIcon src={"powers_administrative_focused"} alt="Admin Mana (focused)" />
);

export const DiplomaticManaIcon = () => (
  <GameIcon src={"powers_diplomatic"} alt="Dipolmatic Mana" />
);

export const DiplomaticManaFocusedIcon = () => (
  <GameIcon src={"powers_diplomatic_focused"} alt="Dipolmatic Mana (focused)" />
);

export const MilitaryManaIcon = () => (
  <GameIcon src={"powers_military"} alt="Military Mana" />
);

export const MilitaryManaFocusedIcon = () => (
  <GameIcon src={"powers_military_focused"} alt="Military Mana (focused)" />
);

export const AdminTechIcon = () => (
  <GameIcon src={"powers_administrative_tech"} alt="Admin Tech" />
);

export const DiplomaticTechIcon = () => (
  <GameIcon src={"powers_diplomatic_tech"} alt="Dipolmatic Tech" />
);

export const MilitaryTechIcon = () => (
  <GameIcon src={"powers_military_tech"} alt="Military Tech" />
);

export const IdeaGroupsIcon = () => (
  <GameIcon src={"idea_groups"} alt="Ideas" />
);

export const ReinforcementsIcon = () => (
  <GameIcon src={"reinforcements"} alt="Reinforcements" />
);

export const MaxManpowerIcon = () => (
  <GameIcon src={"max_manpower"} alt="Max Manpower" />
);

export const MercenaryIcon = () => (
  <GameIcon src={"mercenary"} alt="Mercenary Regiments" />
);

export const ProvincesIcon = () => (
  <GameIcon src={"provinces"} alt="Provinces" />
);

export const DevelopmentIcon = () => (
  <GameIcon src={"development"} alt="Development" />
);

export const AverageAutonomyIcon = () => (
  <GameIcon src={"autonomy"} alt="Average Autonomy" />
);

export const AutonomyDevelopmentIcon = () => (
  <GameIcon src={"autonomy_development"} alt="Autonomy Adjusted Development" />
);

export const HordeUnityIcon = () => (
  <GameIcon src={"horde_unity"} alt="Horde Unity" />
);

export const DevotionIcon = () => <GameIcon src={"devotion"} alt="Devotion" />;

export const LegitimacyIcon = () => (
  <GameIcon src={"legitimacy"} alt="Legitimacy" />
);

export const MeritocracyIcon = () => (
  <GameIcon src={"meritocracy"} alt="Meritocracy" />
);

export const RepublicanTraditionIcon = () => (
  <GameIcon src={"republican_tradition"} alt="Republican Tradition" />
);

export const AbsolutismIcon = () => (
  <GameIcon src={"absolutism"} alt="Absolutism" />
);

export const MercantilismIcon = () => (
  <GameIcon src={"mercantilism"} alt="Mercantilism" />
);

export const SplendorIcon = () => <GameIcon src={"splendor"} alt="Splendor" />;

export const MerchantIcon = () => (
  <GameIcon src={"merchant"} height={31} width={31} alt="Merchant" />
);

export const DiplomatIcon = () => (
  <GameIcon src={"diplomat"} height={31} width={31} alt="Diplomat" />
);

export const MissionaryIcon = () => (
  <GameIcon src={"missionary"} height={31} width={31} alt="Missionary" />
);

export const ColonistIcon = () => (
  <GameIcon src={"colonist"} height={31} width={31} alt="Colonist" />
);

export const CapitalIcon = () => (
  <GameIcon src={"capital"} alt="Capital" width={32} height={32} />
);

export const CultureIcon = () => (
  <GameIcon src={"culture"} alt="Culture" width={32} height={32} />
);

export const ReligionIcon = () => (
  <GameIcon src={"religion"} alt="Religion" width={32} height={32} />
);

export const ModifierIcon = () => (
  <GameIcon src={"modifier"} alt="Modifier" width={32} height={32} />
);

export const DecisionIcon = () => (
  <GameIcon src={"decision"} alt="Decision" width={32} height={32} />
);

export const GeneralIcon = () => (
  <GameIcon src={"general"} alt="General" width={32} height={32} />
);

export const AdmiralIcon = () => (
  <GameIcon src={"admiral"} alt="Admiral" width={32} height={32} />
);

export const ConquistadorIcon = () => (
  <GameIcon src={"conquistador"} alt="Conquistador" width={32} height={32} />
);

export const ExplorerIcon = () => (
  <GameIcon src={"explorer"} alt="Explorer" width={32} height={32} />
);

export const HeirIcon = () => (
  <GameIcon src={"heir"} alt="Heir" width={32} height={32} />
);

export const QueenIcon = () => (
  <GameIcon src={"queen"} alt="Queen" width={32} height={32} />
);

export const WarIcon = () => (
  <GameIcon src={"war"} alt="War" width={32} height={32} />
);

export const PeaceIcon = () => (
  <GameIcon src={"peace"} alt="Peace" width={32} height={32} />
);

export const AttritionLossesIcon = () => (
  <GameIcon
    src={"attrition_losses"}
    alt="Attrition losses"
    width={27}
    height={27}
  />
);

export const PolicyIcon = () => (
  <GameIcon src={"policy"} alt="Policy" width={32} height={32} />
);
