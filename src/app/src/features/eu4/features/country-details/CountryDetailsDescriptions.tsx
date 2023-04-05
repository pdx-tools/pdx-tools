import React from "react";
import { StopOutlined, CheckCircleOutlined } from "@ant-design/icons";
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
} from "../../components/icons";
import { PersonalityAvatar } from "../../components/avatars";

interface CountryDetailsProps {
  details: CountryDetails;
}

const IdeasTable = ({ ideas }: Pick<CountryDetails, "ideas">) => {
  const elem = ideas.map(([name, count]) => {
    name = name.substring(0, name.length - "_ideas".length);
    let ideaMarkers = [];
    let i = 0;
    for (; i < count; i++) {
      ideaMarkers.push(<CheckCircleOutlined key={i} />);
    }
    for (; i < 7; i++) {
      ideaMarkers.push(<StopOutlined key={i} />);
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

export const CountryDetailsDescriptions = ({
  details,
}: CountryDetailsProps) => {
  const { ruler, technology, ideas } = details;
  const isJuniorPartner = useIsJuniorPartner(details);

  return (
    <div className="flex flex-wrap justify-center gap-8">
      <div className="flex w-72 flex-col gap-4 rounded-lg border border-solid border-gray-400/50 p-4 shadow-md drop-shadow-lg">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="flex text-right">
              <GoldIcon />
              <span className="grow">{formatInt(details.treasury)}</span>
            </div>

            <div className="flex text-right">
              <PrestigeIcon />
              <div className="grow">{formatInt(details.prestige)}</div>
            </div>

            <div className="flex text-right">
              <StabilityIcon />
              <span className="grow">{formatInt(details.stability)}</span>
            </div>

            <div className="flex text-right">
              <InnovativenessIcon />
              <span className="grow">{formatInt(details.innovativeness)}</span>
            </div>

            <div className="flex text-right">
              <PowerProjectionIcon />
              <span className="grow">
                {formatInt(details.power_projection)}
              </span>
            </div>

            <div className="flex text-right">
              <DevelopmentIcon />
              <span className="grow">{formatInt(details.raw_development)}</span>
            </div>
            <div className="flex text-right">
              <ProvincesIcon />
              <span className="grow">{formatInt(details.num_cities)}</span>
            </div>
          </div>

          <div>
            <div className="flex text-right">
              <DebtIcon />
              <span className="grow">{formatInt(details.debt)}</span>
            </div>
            <div className="flex text-right">
              <InflationIcon />
              <span className="grow">{formatFloat(details.inflation, 2)}%</span>
            </div>
            <div className="flex text-right">
              <CorruptionIcon />
              <span className="grow">{formatInt(details.corruption)}</span>
            </div>
            <div className="flex text-right">
              <OverextensionIcon />
              <span className="grow">{formatInt(details.overextension)}%</span>
            </div>
            <div className="flex text-right">
              <ReligiousUnityIcon />
              <span className="grow">
                {formatInt(details.religious_unity * 100)}%
              </span>
            </div>
            <div className="flex text-right">
              <AutonomyDevelopmentIcon />
              <span className="grow">{formatInt(details.development)}</span>
            </div>
            <div className="flex text-right">
              <AverageAutonomyIcon />
              <span className="grow">
                {formatInt(
                  100 - (details.development / details.raw_development) * 100 ||
                    0
                )}
                %
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-around">
          <div className="flex items-center gap-1">
            <AdminTechIcon />
            <div>{formatInt(details.technology.adm_tech)}</div>
          </div>
          <div className="flex items-center gap-1">
            <DiplomaticTechIcon />
            <div>{formatInt(details.technology.dip_tech)}</div>
          </div>
          <div className="flex items-center gap-1">
            <MilitaryTechIcon />
            <div>{formatInt(details.technology.mil_tech)}</div>
          </div>
        </div>

        <div>
          <div>Religion: {details.religion}</div>
          <div>Primary culture: {details.primary_culture}</div>
        </div>
      </div>

      <div className="flex w-72 flex-col gap-4 rounded-lg border border-solid border-gray-400/50 p-4 shadow-md drop-shadow-lg">
        <div className="flex justify-around">
          <div className="flex items-center gap-1">
            <ManpowerIcon />
            <div>{formatInt(details.manpower)}K</div>
          </div>
          <div className="flex items-center gap-1">
            <ReinforcementsIcon />
            <div>
              {formatInt(
                details.infantry_units.count +
                  details.cavalry_units.count +
                  details.artillery_units.count -
                  details.infantry_units.strength -
                  details.cavalry_units.strength -
                  details.artillery_units.strength
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
                {formatInt(details.infantry_units.count)}
              </span>
            </div>

            <div className="flex text-right">
              <CavalryIcon />
              <div className="grow">
                {formatInt(details.cavalry_units.count)}
              </div>
            </div>

            <div className="flex text-right">
              <ArtilleryIcon />
              <span className="grow">
                {formatInt(details.artillery_units.count)}
              </span>
            </div>

            <div className="flex text-right">
              <MercenaryIcon />
              <span className="grow">{formatInt(details.mercenary_units)}</span>
            </div>
          </div>
          <div>
            <div className="flex text-right">
              <HeavyShipIcon />
              <span className="grow">
                {formatInt(details.heavy_ship_units)}
              </span>
            </div>

            <div className="flex text-right">
              <LightShipIcon />
              <span className="grow">
                {formatInt(details.light_ship_units)}
              </span>
            </div>

            <div className="flex text-right">
              <GalleyIcon />
              <span className="grow">{formatInt(details.galley_units)}</span>
            </div>

            <div className="flex text-right">
              <TransportIcon />
              <span className="grow">{formatInt(details.transport_units)}</span>
            </div>
          </div>
          <div>
            <div className="flex text-right">
              <ProfessionalismIcon />
              <span className="grow">{formatInt(details.professionalism)}</span>
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

        {details.best_general || details.best_admiral ? (
          <div>
            <div>BEST LEADERS:</div>
            {details.best_general ? (
              <div className="ml-2 flex">
                <div className="grow">
                  {details.best_general.kind} {details.best_general.name}
                </div>
                <div>
                  ({details.best_general.fire} / {details.best_general.shock} /{" "}
                  {details.best_general.manuever} / {details.best_general.siege}
                  )
                </div>
              </div>
            ) : null}
            {details.best_admiral ? (
              <div className="ml-2 flex">
                <div className="grow">
                  {details.best_admiral.kind} {details.best_admiral.name}
                </div>
                <div>
                  ({details.best_admiral.fire} / {details.best_admiral.shock} /{" "}
                  {details.best_admiral.manuever})
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex w-64 flex-col gap-2 rounded-lg border border-solid border-gray-400/50 p-4 shadow-md drop-shadow-lg">
        <div className="flex items-center gap-2">
          <div>
            <RulerIcon />
          </div>
          <div className="grow text-lg">{ruler.name}</div>
          <div>Age: {ruler.age}</div>
        </div>
        <div>
          <div className="flex justify-around text-2xl">
            <div>
              <AdminManaIcon /> {ruler.adm}
            </div>
            <div>
              <DiplomaticManaIcon /> {ruler.dip}
            </div>
            <div>
              <MilitaryManaIcon /> {ruler.mil}
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
      </div>

      <div className="flex w-64 flex-col gap-2 rounded-lg border border-solid border-gray-400/50 p-4 shadow-md drop-shadow-lg">
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
      </div>
    </div>
  );
};
