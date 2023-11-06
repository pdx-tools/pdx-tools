import { formatInt } from "@/lib/format";
import { useCallback, useMemo } from "react";
import { TagFlag } from "../../components/avatars";
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

export const DiploRow = <T,>({
  title,
  relations,
  children,
}: {
  title: string;
  relations: ({ tag: string; name: string } & T)[] | undefined;
  children: (arg: T) => React.ReactNode;
}) => {
  const rowClass = `grid w-full gap-2 grid-cols-[repeat(auto-fill,_minmax(204px,_1fr))]`;

  if (relations === undefined || relations.length == 0) {
    return null;
  }

  return (
    <tr className="even:bg-gray-50">
      <td className="py-4 align-baseline">{title}:</td>
      <td className="w-full px-2 py-4">
        <div className={rowClass}>
          {relations.map((x) => (
            <TagFlag key={x.tag} tag={x.tag} size="large">
              {children(x)}
            </TagFlag>
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
    () =>
      dip
        .filter((x) => x.kind === "Alliance")
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe],
  );

  const marriages = useMemo(
    () =>
      dip
        .filter((x) => x.kind === "RoyalMarriage")
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe],
  );

  const warned = useMemo(
    () =>
      dip
        .filter((x) => x.kind === "Warning" && x.first.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const warnedBy = useMemo(
    () =>
      dip
        .filter((x) => x.kind === "Warning" && x.second.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const subsidizing = useMemo(
    () =>
      dip
        .filter(isOfType("Subsidy"))
        .filter((x) => x.first.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const subsidized = useMemo(
    () =>
      dip
        .filter(isOfType("Subsidy"))
        .filter((x) => x.second.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const reparationsReceiving = useMemo(
    () =>
      dip
        .filter(isOfType("Reparations"))
        .filter((x) => x.second.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const reparationsGiving = useMemo(
    () =>
      dip
        .filter(isOfType("Reparations"))
        .filter((x) => x.first.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const tradePowerReceiving = useMemo(
    () =>
      dip
        .filter(
          (x) => x.kind === "TransferTrade" && x.second.tag === details.tag,
        )
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const tradePowerGiving = useMemo(
    () =>
      dip
        .filter(
          (x) => x.kind === "TransferTrade" && x.first.tag === details.tag,
        )
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const steerTradeReceiving = useMemo(
    () =>
      dip
        .filter((x) => x.kind === "SteerTrade" && x.second.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
  );

  const steerTradeGiving = useMemo(
    () =>
      dip
        .filter((x) => x.kind === "SteerTrade" && x.first.tag === details.tag)
        .map((x) => ({ ...x, ...notMe(x) })),
    [dip, notMe, details.tag],
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
                {x.subject_type.replace("_colony", "")}
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
              <p className="m-0 text-sm">Monthly amount: {x.amount}</p>
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
