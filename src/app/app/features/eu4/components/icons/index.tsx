import { Tooltip } from "@/components/Tooltip";
import data from "./icons.json";
import imageUrl from "./icons.webp";
import React from "react";
import { Sprite, spriteDimension } from "../Sprite";

const dimensions = spriteDimension({
  data,
  spriteCell: { width: 32, height: 32 },
});

export const iconSpriteTitle = {
  absolutism: "Absolutism",
  admiral: "Admiral",
  army_tradition: "Army Tradition",
  artillery: "Artillery",
  attrition_losses: "Attrition losses",
  autonomy: "Average Autonomy",
  autonomy_development: "Autonomy Adjusted Development",
  capital: "Capital",
  cavalry: "Cavalry",
  colonist: "Colonist",
  conquistador: "Conquistador",
  corruption: "Corruption",
  culture: "Culture",
  debt: "Debt",
  decision: "Decision",
  development: "Development",
  devotion: "Devotion",
  diplomat: "Diplomat",
  ducats: "Net Cash",
  explorer: "Explorer",
  galley: "Galleys",
  general: "General",
  gold: "Treasury",
  heavy_ship: "Heavy Ships",
  heir: "Heir",
  horde_unity: "Horde Unity",
  idea_groups: "Ideas",
  infantry: "Infantry",
  infantry_skull: "Attrition",
  inflation: "Inflation",
  innovativeness: "Innovativeness",
  legitimacy: "Legitimacy",
  light_ship: "Light Ships",
  manpower: "Manpower",
  max_manpower: "Max Manpower",
  mercantilism: "Mercantilism",
  mercenary: "Mercenary Regiments",
  merchant: "Merchant",
  meritocracy: "Meritocracy",
  missionary: "Missionary",
  modifier: "Modifier",
  navy_tradition: "Navy Tradition",
  overextension: "Overextension",
  peace: "Peace",
  policy: "Policy",
  power_projection: "Power Projection",
  powers_administrative: "Admin Mana",
  powers_administrative_focused: "Admin Mana (focused)",
  powers_administrative_tech: "Admin Tech",
  powers_diplomatic: "Diplomatic Mana",
  powers_diplomatic_focused: "Diplomatic Mana (focused)",
  powers_diplomatic_tech: "Diplomatic Tech",
  powers_military: "Military Mana",
  powers_military_focused: "Military Mana (focused)",
  powers_military_tech: "Military Tech",
  prestige: "Prestige",
  professionalism: "Professionalism",
  profit: "Monthly Recurring Profit",
  provinces: "Provinces",
  queen: "Queen",
  reinforcements: "Reinforcements",
  religion: "Religion",
  religious_unity: "Religious Unity",
  republican_tradition: "Republican Tradition",
  ruler: "Ruler",
  splendor: "Splendor",
  stability: "Stability",
  transport: "Transports",
  war: "War",
  war_exhaustion: "War Exhaustion",
} satisfies Record<keyof typeof data, string>;

function iconSpriteDimension(x: keyof typeof data) {
  switch (x) {
    case "diplomat":
    case "missionary":
    case "colonist":
    case "merchant":
      return 31;
    case "capital":
    case "culture":
    case "religion":
    case "modifier":
    case "decision":
    case "general":
    case "admiral":
    case "conquistador":
    case "explorer":
    case "heir":
    case "queen":
    case "war":
    case "peace":
    case "policy":
      return 32;
    case "ducats":
    case "profit":
      return 28;
    default:
      return 27;
  }
}

export function GameIconSprite({
  src,
  alt = iconSpriteTitle[src],
  className,
}: {
  src: keyof typeof data;
  alt?: string;
  className?: string;
}) {
  const dim = iconSpriteDimension(src);
  const sprite = { width: dim, height: dim };
  return (
    <Sprite
      src={imageUrl}
      alt={alt}
      index={data[src]}
      sprite={sprite}
      dimensions={dimensions}
      className={className}
    />
  );
}

type GameIconProps = {
  src: keyof typeof data;
  alt?: string;
};

const GameIcon = ({ src, alt = iconSpriteTitle[src] }: GameIconProps) => {
  return (
    <Tooltip>
      <Tooltip.Trigger className="w-max">
        <GameIconSprite src={src} alt={alt} />
      </Tooltip.Trigger>
      <Tooltip.Content>{alt}</Tooltip.Content>
    </Tooltip>
  );
};

export const PrestigeIcon = () => <GameIcon src="prestige" />;
export const StabilityIcon = () => <GameIcon src="stability" />;
export const CorruptionIcon = () => <GameIcon src={"corruption"} />;
export const ProfessionalismIcon = () => <GameIcon src={"professionalism"} />;
export const GoldIcon = () => <GameIcon src={"gold"} />;
export const OverextensionIcon = () => <GameIcon src={"overextension"} />;
export const DebtIcon = () => <GameIcon src={"debt"} />;
export const InnovativenessIcon = () => <GameIcon src={"innovativeness"} />;
export const InflationIcon = () => <GameIcon src={"inflation"} />;
export const InfantryIcon = ({ alt }: { alt?: string }) => (
  <GameIcon src={"infantry"} alt={alt} />
);
export const InfantrySkullIcon = ({ alt }: { alt?: string }) => (
  <GameIcon src={"infantry_skull"} alt={alt} />
);
export const CavalryIcon = () => <GameIcon src={"cavalry"} />;
export const ArtilleryIcon = () => <GameIcon src={"artillery"} />;
export const ManpowerIcon = ({ alt }: { alt?: string }) => (
  <GameIcon src={"manpower"} alt={alt} />
);
export const ArmyTraditionIcon = () => <GameIcon src={"army_tradition"} />;
export const NavyTraditionIcon = () => <GameIcon src={"navy_tradition"} />;
export const PowerProjectionIcon = () => <GameIcon src={"power_projection"} />;
export const ReligiousUnityIcon = () => <GameIcon src={"religious_unity"} />;
export const HeavyShipIcon = ({ alt }: { alt?: string }) => (
  <GameIcon src={"heavy_ship"} alt={alt} />
);
export const LightShipIcon = () => <GameIcon src={"light_ship"} />;
export const GalleyIcon = () => <GameIcon src={"galley"} />;
export const TransportIcon = () => <GameIcon src={"transport"} />;
export const RulerIcon = () => <GameIcon src={"ruler"} />;
export const AdminManaIcon = () => <GameIcon src={"powers_administrative"} />;
export const AdminManaFocusedIcon = () => (
  <GameIcon src={"powers_administrative_focused"} />
);
export const DiplomaticManaIcon = () => <GameIcon src={"powers_diplomatic"} />;
export const DiplomaticManaFocusedIcon = () => (
  <GameIcon src={"powers_diplomatic_focused"} />
);
export const MilitaryManaIcon = () => <GameIcon src={"powers_military"} />;
export const MilitaryManaFocusedIcon = () => (
  <GameIcon src={"powers_military_focused"} />
);
export const AdminTechIcon = () => (
  <GameIcon src={"powers_administrative_tech"} />
);
export const DiplomaticTechIcon = () => (
  <GameIcon src={"powers_diplomatic_tech"} />
);
export const MilitaryTechIcon = () => <GameIcon src={"powers_military_tech"} />;
export const IdeaGroupsIcon = () => <GameIcon src={"idea_groups"} />;
export const ReinforcementsIcon = () => <GameIcon src={"reinforcements"} />;
export const MaxManpowerIcon = () => <GameIcon src={"max_manpower"} />;
export const MercenaryIcon = () => <GameIcon src={"mercenary"} />;
export const ProvincesIcon = () => <GameIcon src={"provinces"} />;
export const DevelopmentIcon = () => <GameIcon src={"development"} />;
export const AverageAutonomyIcon = () => <GameIcon src={"autonomy"} />;
export const AutonomyDevelopmentIcon = () => (
  <GameIcon src={"autonomy_development"} />
);
export const HordeUnityIcon = () => <GameIcon src={"horde_unity"} />;
export const DevotionIcon = () => <GameIcon src={"devotion"} alt="Devotion" />;
export const LegitimacyIcon = () => <GameIcon src={"legitimacy"} />;
export const MeritocracyIcon = () => <GameIcon src={"meritocracy"} />;
export const RepublicanTraditionIcon = () => (
  <GameIcon src={"republican_tradition"} />
);
export const AbsolutismIcon = () => <GameIcon src={"absolutism"} />;
export const MercantilismIcon = () => <GameIcon src={"mercantilism"} />;
export const SplendorIcon = () => <GameIcon src={"splendor"} />;
export const MerchantIcon = () => <GameIcon src={"merchant"} />;
export const DiplomatIcon = () => <GameIcon src={"diplomat"} />;
export const MissionaryIcon = () => <GameIcon src={"missionary"} />;
export const ColonistIcon = () => <GameIcon src={"colonist"} />;
export const CapitalIcon = () => <GameIcon src={"capital"} />;
export const CultureIcon = () => <GameIcon src={"culture"} />;
export const ReligionIcon = () => <GameIcon src={"religion"} />;
export const ModifierIcon = () => <GameIcon src={"modifier"} />;
export const DecisionIcon = () => <GameIcon src={"decision"} />;
export const GeneralIcon = () => <GameIcon src={"general"} />;
export const AdmiralIcon = () => <GameIcon src={"admiral"} />;
export const ConquistadorIcon = () => <GameIcon src={"conquistador"} />;
export const ExplorerIcon = () => <GameIcon src={"explorer"} />;
export const HeirIcon = () => <GameIcon src={"heir"} />;
export const QueenIcon = () => <GameIcon src={"queen"} />;
export const WarIcon = () => <GameIcon src={"war"} />;
export const PeaceIcon = () => <GameIcon src={"peace"} />;
export const AttritionLossesIcon = () => <GameIcon src={"attrition_losses"} />;
export const PolicyIcon = () => <GameIcon src={"policy"} />;
export const WarExhaustionIcon = () => <GameIcon src="war_exhaustion" />;
export const DucatsIcon = () => <GameIcon src="ducats" />;
export const ProfitIcon = () => <GameIcon src="profit" />;
