import { formatInt, sentenceCasing } from "@/lib/format";
import { useCallback, useMemo } from "react";
import { Flag } from "../../components/avatars";
import { CountryDetails, DiplomacyEntry } from "../../types/models";
import { isOfType } from "@/lib/isPresent";

const isColony = (subjectType: string) => {
  switch (subjectType) {
    case "colony":
    case "private_enterprise":
    case "self_governing_colony":
    case "crown_colony":
      return true;
    default:
      return false;
  }
};

const RelationshipSince = ({
  x,
}: {
  x: { tag: string; name: string; start_date: string | undefined };
}) => {
  return (
    <div>
      <p className="m-0 text-sm">{`${x.name} (${x.tag})`}</p>
      {x.start_date && <p className="m-0 text-sm">Since: {x.start_date}</p>}
    </div>
  );
};

export const DiploRow = <T extends { tag: string; name: string }>({
  title,
  relations,
  children,
}: {
  title: string;
  relations: T[] | undefined;
  children: (arg: T) => React.ReactNode;
}) => {
  const rowClass = `grid w-full gap-2 grid-cols-[repeat(auto-fill,_minmax(204px,_1fr))]`;

  if (relations === undefined || relations.length == 0) {
    return null;
  }

  return (
    <tr>
      <td className="py-4 align-baseline">{title}:</td>
      <td className="w-full px-2 py-4 pl-4">
        <div className={rowClass}>
          {relations.map((x) => (
            <Flag key={x.tag} tag={x.tag} name={x.name}>
              <Flag.DrawerTrigger className="gap-2 pr-4 text-left">
                <Flag.Image size="large" />
                {children(x)}
              </Flag.DrawerTrigger>
            </Flag>
          ))}
        </div>
      </td>
    </tr>
  );
};

const genericSubjects = [
  ["vassal", "Vassals"],
  ["eyalet", "Eyalets"],
  ["core_eyalet", "Core Eyalets"],
  ["appanage", "Appanages"],
  ["tributary_state", "Tributaries"],
  ["hereditary_pronoia_subject_type", "Hereditary Pronoias"],
  ["pronoia_subject_type", "Pronoias"],
] as const;

const genericSubjectTypes = new Set(
  genericSubjects.map(([type]) => type as string),
);

export const CountryDiplomacy = ({ details }: { details: CountryDetails }) => {
  const dip = useMemo(
    () => details.diplomacy.map(({ data, ...rest }) => ({ ...rest, ...data })),
    [details.diplomacy],
  );

  const notMe = useCallback(
    (x: Pick<DiplomacyEntry, "first" | "second">) =>
      x.first.tag === details.tag ? x.second : x.first,
    [details.tag],
  );

  const deps = useMemo(
    () =>
      dip
        .filter(isOfType("Dependency"))
        .filter((x) => x.first.tag === details.tag)
        .map((x) => ({ ...x, ...x.second })),
    [dip, details.tag],
  );

  const juniorPartners = useMemo(
    () =>
      dip.filter(isOfType("JuniorPartner")).map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe],
  );

  const overlord = useMemo(
    () =>
      dip
        .filter(
          (x) =>
            x.kind === "Dependency" &&
            x.second.tag === details.tag &&
            (x.subject_type == "personal_union" ||
              genericSubjectTypes.has(x.subject_type) ||
              isColony(x.subject_type)),
        )
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const colonies = useMemo(
    () =>
      dip
        .filter(isOfType("Dependency"))
        .filter((x) => x.first.tag === details.tag && isColony(x.subject_type))
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const allies = useMemo(
    () => dip.filter(isOfType("Alliance")).map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe],
  );

  const marriages = useMemo(
    () =>
      dip.filter(isOfType("RoyalMarriage")).map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe],
  );

  const relations = <T extends (typeof dip)[number]>(relations: T[]) => {
    const to = relations.filter((x) => x.first.tag === details.tag);
    const from = relations.filter((x) => x.second.tag === details.tag);
    return [
      to.map((x) => ({ ...x, ...x.second })),
      from.map((x) => ({ ...x, ...x.first })),
    ];
  };

  const [warned, warnedBy] = relations(dip.filter(isOfType("Warning")));
  const [subsidizing, subsidized] = relations(dip.filter(isOfType("Subsidy")));
  const [reparationsGiving, reparationsReceiving] = relations(
    dip.filter(isOfType("Reparations")),
  );
  const [tradePowerGiving, tradePowerReceiving] = relations(
    dip.filter(isOfType("TransferTrade")),
  );
  const [steerTradeGiving, steerTradeReceiving] = relations(
    dip.filter(isOfType("SteerTrade")),
  );

  return (
    <table className="w-full border-collapse">
      <tbody>
        <DiploRow title="Allies" relations={allies}>
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        <DiploRow title="Royal Marriages" relations={marriages}>
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        <DiploRow title="Overlord" relations={overlord}>
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        {genericSubjects.map(([type, name]) => (
          <DiploRow
            key={type}
            title={name}
            relations={deps.filter((x) => x.subject_type === type)}
          >
            {(x) => <RelationshipSince x={x} />}
          </DiploRow>
        ))}

        <DiploRow title="Colonies" relations={colonies}>
          {(x) => (
            <div>
              <p className="m-0 text-sm">{`${x.name} (${x.tag})`}</p>
              <p className="m-0 text-sm">
                {sentenceCasing(x.subject_type.replace("_", " "))}
              </p>
              {x.start_date && (
                <p className="m-0 text-sm">Since: {x.start_date}</p>
              )}
            </div>
          )}
        </DiploRow>

        <DiploRow title="Junior Partners" relations={juniorPartners}>
          {(x) => (
            <div>
              <p className="m-0 text-sm">{`${x.name} (${x.tag})`}</p>
              <p className="m-0 text-sm">
                Inheritance Value: {x.pu_inheritance_value}
              </p>
              {x.start_date && (
                <p className="m-0 text-sm">Since: {x.start_date}</p>
              )}
            </div>
          )}
        </DiploRow>

        <DiploRow title="Warning" relations={warned}>
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        <DiploRow title="Warned by" relations={warnedBy}>
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        <DiploRow title="Subsidizing" relations={subsidizing}>
          {(x) => (
            <div>
              <p className="m-0 text-sm">{`${x.name} (${x.tag})`}</p>
              <p className="m-0 text-sm">
                Monthly amount: {formatInt(x.amount)}
              </p>
              {x.start_date && (
                <p className="m-0 text-sm">{`Since ${x.start_date}${
                  x.total !== undefined && `: ${formatInt(x.total)}`
                }`}</p>
              )}
            </div>
          )}
        </DiploRow>

        <DiploRow title="Subsidized by" relations={subsidized}>
          {(x) => (
            <div>
              <p className="m-0 text-sm">{`${x.name} (${x.tag})`}</p>
              <p className="m-0 text-sm">
                Monthly amount: {formatInt(x.amount)}
              </p>
              {x.start_date && (
                <p className="m-0 text-sm">{`Since ${x.start_date}${
                  x.total !== undefined && `: ${formatInt(x.total)}`
                }`}</p>
              )}
            </div>
          )}
        </DiploRow>

        <DiploRow
          title="Reparations (receiving)"
          relations={reparationsReceiving}
        >
          {(x) => (
            <div>
              <p className="m-0 text-sm">{`${x.name} (${x.tag})`}</p>
              {x.start_date && (
                <p className="m-0 text-sm">Since: {x.start_date}</p>
              )}
              {x.end_date && <p className="m-0 text-sm">End: {x.end_date}</p>}
            </div>
          )}
        </DiploRow>

        <DiploRow title="Reparations (giving)" relations={reparationsGiving}>
          {(x) => (
            <div>
              <p className="m-0 text-sm">{`${x.name} (${x.tag})`}</p>
              {x.start_date && (
                <p className="m-0 text-sm">Since: {x.start_date}</p>
              )}
              {x.end_date && <p className="m-0 text-sm">End: {x.end_date}</p>}
            </div>
          )}
        </DiploRow>

        <DiploRow
          title="Trade Power (receiving)"
          relations={tradePowerReceiving}
        >
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        <DiploRow title="Trade Power (giving)" relations={tradePowerGiving}>
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        <DiploRow
          title="Steer Trade (receiving)"
          relations={steerTradeReceiving}
        >
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>

        <DiploRow title="Steer Trade (giving)" relations={steerTradeGiving}>
          {(x) => <RelationshipSince x={x} />}
        </DiploRow>
      </tbody>
    </table>
  );
};
