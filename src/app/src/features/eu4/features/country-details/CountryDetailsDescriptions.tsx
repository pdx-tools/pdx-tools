import React from "react";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails } from "@/features/eu4/types/models";
import { InheritanceValueBreakdown } from "./InheritanceValueBreakdown";
import { useIsJuniorPartner } from "./detailHooks";
import {
  ArmyTraditionIcon,
  ArtilleryIcon,
  CavalryIcon,
  CorruptionIcon,
  DebtIcon,
  GalleyIcon,
  GoldIcon,
  HeavyShipIcon,
  InfantryIcon,
  InflationIcon,
  InnovativenessIcon,
  LightShipIcon,
  ManpowerIcon,
  RulerIcon,
  NavyTraditionIcon,
  OverextensionIcon,
  PowerProjectionIcon,
  PrestigeIcon,
  ProfessionalismIcon,
  ReligiousUnityIcon,
  StabilityIcon,
  TransportIcon,
  AdminManaIcon,
  DiplomaticManaIcon,
  MilitaryManaIcon,
  IdeaGroupsIcon,
  ReinforcementsIcon,
  MaxManpowerIcon,
  AdminTechIcon,
  DiplomaticTechIcon,
  MilitaryTechIcon,
  MercenaryIcon,
  DevelopmentIcon,
  AutonomyDevelopmentIcon,
  AverageAutonomyIcon,
  ProvincesIcon,
  LegitimacyIcon,
  RepublicanTraditionIcon,
  DevotionIcon,
  HordeUnityIcon,
  MeritocracyIcon,
  AbsolutismIcon,
  MercantilismIcon,
  SplendorIcon,
  MerchantIcon,
  ColonistIcon,
  DiplomatIcon,
  MissionaryIcon,
  AdminManaFocusedIcon,
  MilitaryManaFocusedIcon,
  DiplomaticManaFocusedIcon,
} from "../../components/icons";
import { PersonalityAvatar } from "../../components/avatars";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { HelpTooltip } from "@/components/HelpTooltip";
import { LeaderStats } from "../../components/LeaderStats";
import { Card } from "@/components/Card";

interface CountryDetailsProps {
  details: CountryDetails;
}

const IdeasTable = ({ ideas }: Pick<CountryDetails, "ideas">) => {
  const elem = ideas.map(([name, count]) => {
    name = name.substring(0, name.length - "_ideas".length);
    let ideaMarkers = [];
    let i = 0;
    for (; i < count; i++) {
      ideaMarkers.push(<CheckCircleIcon className="h-4 w-4" key={i} />);
    }
    for (; i < 7; i++) {
      ideaMarkers.push(
        <div
          key={i}
          className="h-4 w-4 rounded-full outline outline-1 -outline-offset-2"
        />,
      );
    }
    return (
      <tr key={name}>
        <td>{name}</td>
        <td>
          <div className="flex justify-end">{ideaMarkers}</div>
        </td>
      </tr>
    );
  });

  return (
    <table className="w-full">
      <tbody>{elem}</tbody>
    </table>
  );
};

const GovernmentStrength = ({
  government_strength,
}: Pick<CountryDetails, "government_strength">) => {
  switch (government_strength.kind) {
    case "Legitimacy":
      return (
        <div className="flex text-right">
          <LegitimacyIcon />
          <span className="grow">{formatInt(government_strength.value)}</span>
        </div>
      );
    case "Republic":
      return (
        <div className="flex text-right">
          <RepublicanTraditionIcon />
          <span className="grow">{formatInt(government_strength.value)}</span>
        </div>
      );
    case "Devotion":
      return (
        <div className="flex text-right">
          <DevotionIcon />
          <span className="grow">{formatInt(government_strength.value)}</span>
        </div>
      );
    case "Horde":
      return (
        <div className="flex text-right">
          <HordeUnityIcon />
          <span className="grow">{formatInt(government_strength.value)}</span>
        </div>
      );
    case "Meritocracy":
      return (
        <div className="flex text-right">
          <MeritocracyIcon />
          <span className="grow">{formatInt(government_strength.value)}</span>
        </div>
      );
    case "Native":
      return (
        <div className="flex text-right">
          <LegitimacyIcon />
          <span className="grow">---</span>
        </div>
      );
  }
};

export const CountryDetailsDescriptions = ({
  details,
}: CountryDetailsProps) => {
  const { ruler, technology, ideas } = details;
  const isJuniorPartner = useIsJuniorPartner(details);

  return (
    <div className="flex flex-wrap justify-center gap-8">
      <Card className="flex w-80 flex-col gap-4 p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="flex text-right">
              {details.national_focus === "ADM" ? (
                <AdminManaFocusedIcon />
              ) : (
                <AdminManaIcon />
              )}
              <span className="grow">{formatInt(details.adm_mana)}</span>
            </div>

            <div className="flex text-right">
              <GoldIcon />
              <span className="grow">{formatInt(details.treasury)}</span>
            </div>

            <div className="flex text-right">
              <PrestigeIcon />
              <div className="grow">{formatInt(details.prestige)}</div>
            </div>

            <div className="flex text-right">
              <InnovativenessIcon />
              <span className="grow">{formatInt(details.innovativeness)}</span>
            </div>

            <div className="flex text-right">
              <DevelopmentIcon />
              <span className="grow">{formatInt(details.raw_development)}</span>
            </div>
            <div className="flex text-right">
              <ProvincesIcon />
              <span className="grow">{formatInt(details.num_cities)}</span>
            </div>
            <div className="flex text-right">
              <AbsolutismIcon />
              <span className="grow">{formatInt(details.absolutism)}</span>
            </div>
            <div className="flex text-right">
              <AdminTechIcon />
              <span className="grow">
                {formatInt(details.technology.adm_tech)}
              </span>
            </div>
          </div>

          <div>
            <div className="flex text-right">
              {details.national_focus === "DIP" ? (
                <DiplomaticManaFocusedIcon />
              ) : (
                <DiplomaticManaIcon />
              )}
              <span className="grow">{formatInt(details.dip_mana)}</span>
            </div>
            <div className="flex text-right">
              <DebtIcon />
              <span className="grow">{formatInt(details.debt)}</span>
            </div>
            <div className="flex text-right">
              <StabilityIcon />
              <span className="grow">{formatInt(details.stability)}</span>
            </div>
            <div className="flex text-right">
              <CorruptionIcon />
              <span className="grow">{formatInt(details.corruption)}</span>
            </div>
            <div className="flex text-right">
              <AutonomyDevelopmentIcon />
              <span className="grow">{formatInt(details.development)}</span>
            </div>
            <div className="flex text-right">
              <OverextensionIcon />
              <span className="grow">{formatInt(details.overextension)}%</span>
            </div>
            <div className="flex text-right">
              <MercantilismIcon />
              <span className="grow">{formatInt(details.mercantilism)}</span>
            </div>
            <div className="flex text-right">
              <DiplomaticTechIcon />
              <span className="grow">
                {formatInt(details.technology.dip_tech)}
              </span>
            </div>
          </div>

          <div>
            <div className="flex text-right">
              {details.national_focus === "MIL" ? (
                <MilitaryManaFocusedIcon />
              ) : (
                <MilitaryManaIcon />
              )}
              <span className="grow">{formatInt(details.mil_mana)}</span>
            </div>
            <div className="flex text-right">
              <InflationIcon />
              <span className="grow">{formatFloat(details.inflation, 2)}%</span>
            </div>
            <div className="flex text-right">
              <PowerProjectionIcon />
              <span className="grow">
                {formatInt(details.power_projection)}
              </span>
            </div>
            <GovernmentStrength
              government_strength={details.government_strength}
            />
            <div className="flex text-right">
              <AverageAutonomyIcon />
              <span className="grow">
                {formatInt(
                  100 - (details.development / details.raw_development) * 100 ||
                    0,
                )}
                %
              </span>
            </div>
            <div className="flex text-right">
              <ReligiousUnityIcon />
              <span className="grow">
                {formatInt(details.religious_unity * 100)}%
              </span>
            </div>
            <div className="flex text-right">
              <SplendorIcon />
              <span className="grow">{formatInt(details.splendor)}</span>
            </div>
            <div className="flex text-right">
              <MilitaryTechIcon />
              <span className="grow">
                {formatInt(details.technology.mil_tech)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-around">
          <div className="flex items-center gap-1">
            <MerchantIcon />
            <div>{formatInt(details.merchants)}</div>
          </div>
          <div className="flex items-center gap-1">
            <ColonistIcon />
            <div>{formatInt(details.colonists)}</div>
          </div>
          <div className="flex items-center gap-1">
            <DiplomatIcon />
            <div>{formatInt(details.diplomats)}</div>
          </div>
          <div className="flex items-center gap-1">
            <MissionaryIcon />
            <div>{formatInt(details.missionaries)}</div>
          </div>
        </div>

        <div>
          <div>Religion: {details.religion}</div>
          <div>Primary culture: {details.primary_culture}</div>
          <div className="flex gap-1">
            Country ID: {details.id}{" "}
            <HelpTooltip help="Lowest country ID decides which army arrives first in case of a tie" />
          </div>
        </div>
      </Card>

      <Card className="flex w-80 flex-col gap-4 p-4">
        <div className="flex justify-around">
          <div className="flex items-center gap-1">
            <ManpowerIcon />
            <div>{formatInt(details.manpower)}K</div>
          </div>
          <div className="flex items-center gap-1">
            <ReinforcementsIcon />
            <div>
              {formatInt(
                details.infantryUnits.count +
                  details.cavalryUnits.count +
                  details.artilleryUnits.count -
                  details.infantryUnits.strength -
                  details.cavalryUnits.strength -
                  details.artilleryUnits.strength,
              )}
              K
            </div>
          </div>
          <div className="flex items-center gap-1">
            <MaxManpowerIcon />
            <div>{formatInt(details.max_manpower)}K</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <div>
            <div className="flex text-right">
              <InfantryIcon />
              <span className="grow">
                {formatInt(details.infantryUnits.count)}
              </span>
            </div>

            <div className="flex text-right">
              <CavalryIcon />
              <div className="grow">
                {formatInt(details.cavalryUnits.count)}
              </div>
            </div>

            <div className="flex text-right">
              <ArtilleryIcon />
              <span className="grow">
                {formatInt(details.artilleryUnits.count)}
              </span>
            </div>

            <div className="flex text-right">
              <MercenaryIcon />
              <span className="grow">
                {formatInt(details.mercenaryUnits.count)}
              </span>
            </div>
          </div>
          <div>
            <div className="flex text-right">
              <HeavyShipIcon />
              <span className="grow">{formatInt(details.heavyShipUnits)}</span>
            </div>

            <div className="flex text-right">
              <LightShipIcon />
              <span className="grow">{formatInt(details.lightShipUnits)}</span>
            </div>

            <div className="flex text-right">
              <GalleyIcon />
              <span className="grow">{formatInt(details.galleyUnits)}</span>
            </div>

            <div className="flex text-right">
              <TransportIcon />
              <span className="grow">{formatInt(details.transportUnits)}</span>
            </div>
          </div>
          <div>
            <div className="flex text-right">
              <ProfessionalismIcon />
              <span className="grow">
                {formatInt(details.professionalism * 100)}%
              </span>
            </div>
            <div className="flex text-right">
              <ArmyTraditionIcon />
              <span className="grow">{formatInt(details.army_tradition)}</span>
            </div>
            <div className="flex text-right">
              <NavyTraditionIcon />
              <span className="grow">{formatInt(details.navy_tradition)}</span>
            </div>
          </div>
        </div>

        {details.bestGeneral || details.bestAdmiral ? (
          <div>
            <div>BEST LEADERS:</div>
            {details.bestGeneral ? (
              <div className="ml-2 flex gap-2">
                <div className="grow">
                  {details.bestGeneral.kind} {details.bestGeneral.name}
                </div>
                <LeaderStats {...details.bestGeneral} />
              </div>
            ) : null}
            {details.bestAdmiral ? (
              <div className="ml-2 flex gap-2">
                <div className="grow">
                  {details.bestAdmiral.kind} {details.bestAdmiral.name}
                </div>
                <LeaderStats {...details.bestAdmiral} />
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="flex w-64 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <div>
            <RulerIcon />
          </div>
          <div className="grow text-lg">{ruler.name}</div>
          <div>Age: {ruler.age}</div>
        </div>
        <div>
          <div className="flex justify-around text-2xl">
            <div className="flex gap-1">
              <AdminManaIcon /> <span>{ruler.adm}</span>
            </div>
            <div className="flex gap-1">
              <DiplomaticManaIcon /> <span>{ruler.dip}</span>
            </div>
            <div className="flex gap-1">
              <MilitaryManaIcon /> <span>{ruler.mil}</span>
            </div>
          </div>
          <div className="flex justify-center">
            {ruler.personalities.map((personality) => (
              <PersonalityAvatar key={personality.id} {...personality} />
            ))}
          </div>
          <div className="flex">
            <div>Inaugurated:</div>
            <div className="grow text-right">{ruler.ascended}</div>
          </div>
          <div className="flex">
            <div>Culture:</div>
            <div className="grow text-right">{ruler.culture}</div>
          </div>
          <div className="flex">
            <div>Religion:</div>
            <div className="grow text-right">{ruler.religion}</div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          <div>
            Inheritance value:{" "}
            <span>
              {!isJuniorPartner
                ? details.inheritance.inheritance_value
                : details.inheritance.pu_inheritance_value}
            </span>
          </div>
          <InheritanceValueBreakdown details={details} />
        </div>
      </Card>

      <Card className="flex w-64 flex-col gap-2 p-4">
        <div className="flex gap-2">
          <IdeaGroupsIcon />
          <div className="grow text-lg">Ideas</div>
          <div>
            {formatInt(ideas.reduce((acc, [_, count]) => acc + count, 0))}
          </div>
        </div>
        <div>
          <IdeasTable ideas={ideas} />
        </div>
      </Card>
    </div>
  );
};
