import { formatFloat, formatInt } from "@/lib/format";
import { useCallback, useMemo } from "react";
import { FlagAvatar, FlagAvatarCore } from "../../components/avatars";
import {
  CountryDetails,
  DiplomacyEntry,
  DiplomacySubsidy,
  Eu4Date,
} from "../../types/models";

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

export const CountryDiplomacy = ({ details }: { details: CountryDetails }) => {
  const juniorPartners = useMemo(
    () =>
      details.diplomacy.filter(
        (x) =>
          x.kind === "Dependency" &&
          x.first.tag == details.tag &&
          x.subject_type === "personal_union"
      ),
    [details]
  );

  const vassals = useMemo(
    () =>
      details.diplomacy.filter(
        (x) =>
          x.kind === "Dependency" &&
          x.first.tag === details.tag &&
          x.subject_type === "vassal"
      ),
    [details]
  );

  const colonies = useMemo(
    () =>
      details.diplomacy.filter(
        (x): x is DiplomacyEntry & { subject_type: string } =>
          x.kind === "Dependency" &&
          x.first.tag === details.tag &&
          isColony(x.subject_type)
      ),
    [details]
  );

  const allies = useMemo(
    () => details.diplomacy.filter((x) => x.kind === "Alliance"),
    [details]
  );
  const marriages = useMemo(
    () => details.diplomacy.filter((x) => x.kind === "RoyalMarriage"),
    [details]
  );

  const warned = useMemo(
    () =>
      details.diplomacy.filter(
        (x) => x.kind === "Warning" && x.first.tag === details.tag
      ),
    [details]
  );

  const warnedBy = useMemo(
    () =>
      details.diplomacy.filter(
        (x) => x.kind === "Warning" && x.second.tag === details.tag
      ),
    [details]
  );

  const subsidizing = useMemo(
    () =>
      details.diplomacy.filter(
        (x): x is DiplomacyEntry & DiplomacySubsidy =>
          x.kind === "Subsidy" && x.first.tag === details.tag
      ),
    [details]
  );

  const subsidized = useMemo(
    () =>
      details.diplomacy.filter(
        (x): x is DiplomacyEntry & DiplomacySubsidy =>
          x.kind === "Subsidy" && x.second.tag === details.tag
      ),
    [details]
  );

  const reparationsReceiving = useMemo(
    () =>
      details.diplomacy.filter(
        (x): x is DiplomacyEntry & { end_date: Eu4Date | null } =>
          x.kind === "Reparations" && x.second.tag === details.tag
      ),
    [details]
  );

  const reparationsGiving = useMemo(
    () =>
      details.diplomacy.filter(
        (x): x is DiplomacyEntry & { end_date: Eu4Date | null } =>
          x.kind === "Reparations" && x.first.tag === details.tag
      ),
    [details]
  );

  const tradePowerReceiving = useMemo(
    () =>
      details.diplomacy.filter(
        (x) => x.kind === "TransferTrade" && x.second.tag === details.tag
      ),
    [details]
  );

  const tradePowerGiving = useMemo(
    () =>
      details.diplomacy.filter(
        (x) => x.kind === "TransferTrade" && x.first.tag === details.tag
      ),
    [details]
  );

  const steerTradeReceiving = useMemo(
    () =>
      details.diplomacy.filter(
        (x) => x.kind === "SteerTrade" && x.second.tag === details.tag
      ),
    [details]
  );

  const steerTradeGiving = useMemo(
    () =>
      details.diplomacy.filter(
        (x) => x.kind === "SteerTrade" && x.first.tag === details.tag
      ),
    [details]
  );

  const notMe = useCallback(
    (x: DiplomacyEntry) => (x.first.tag === details.tag ? x.second : x.first),
    [details]
  );

  return (
    <table className="border-collapse">
      <tbody>
        {allies.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Allies:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {allies.map((x) => (
                <div key={notMe(x).tag} className="flex gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {marriages.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Royal Marriages:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {marriages.map((x) => (
                <div key={notMe(x).tag} className="flex gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {vassals.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Vassals:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {vassals.map((x) => (
                <div key={notMe(x).tag} className="flex gap-x-1">
                  <FlagAvatarCore tag={x.second.tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${x.second.name} (${x.second.tag})`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {colonies.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Colonies:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {colonies.map((x) => (
                <div key={notMe(x).tag}>
                  <p className="m-0 text-sm">{`${x.second.name} (${x.second.tag})`}</p>
                  <p className="m-0 text-sm">
                    {x.subject_type.replace("_colony", "")}
                  </p>
                  {x.start_date && (
                    <p className="m-0 text-sm">Since: {x.start_date}</p>
                  )}
                </div>
              ))}
            </td>
          </tr>
        )}
        {juniorPartners.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Junior Partners:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {juniorPartners.map((x) => (
                <div key={notMe(x).tag} className="flex gap-x-1">
                  <FlagAvatarCore tag={x.second.tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${x.second.name} (${x.second.tag})`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {warned.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Warning:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {warned.map((x) => (
                <div key={notMe(x).tag} className="flex gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {warnedBy.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Warned by:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {warnedBy.map((x) => (
                <div key={notMe(x).tag} className="flex gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}

        {subsidizing.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Subsidizing:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {subsidizing.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    <p className="m-0 text-sm">Monthly amount: {x.amount}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">{`Since ${x.start_date}${
                        x.total !== null && `: ${formatInt(x.total)}`
                      }`}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}

        {subsidized.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Subsidized by:</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {subsidized.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    <p className="m-0 text-sm">Monthly amount: {x.amount}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">{`Since ${x.start_date}${
                        x.total !== null && `: ${formatInt(x.total)}`
                      }`}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}

        {reparationsReceiving.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Reparations (receiving):</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {reparationsReceiving.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                    {x.end_date && (
                      <p className="m-0 text-sm">End: {x.end_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {reparationsGiving.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Reparations (giving):</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {reparationsGiving.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                    {x.end_date && (
                      <p className="m-0 text-sm">End: {x.end_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}

        {tradePowerReceiving.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Trade Power (receiving):</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {tradePowerReceiving.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {tradePowerGiving.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Trade Power (giving):</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {tradePowerGiving.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}

        {steerTradeReceiving.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Steer Trade (receiving):</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {steerTradeReceiving.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
        {steerTradeGiving.length > 0 && (
          <tr className="even:bg-gray-50">
            <td>Steer Trade (giving):</td>
            <td className="flex flex-wrap gap-x-4 gap-y-2 px-2 py-4">
              {steerTradeGiving.map((x) => (
                <div key={notMe(x).tag} className="flex items-center gap-x-1">
                  <FlagAvatarCore tag={notMe(x).tag} size="large" />
                  <div>
                    <p className="m-0 text-sm">{`${notMe(x).name} (${
                      notMe(x).tag
                    })`}</p>
                    {x.start_date && (
                      <p className="m-0 text-sm">Since: {x.start_date}</p>
                    )}
                  </div>
                </div>
              ))}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
