import { useCallback } from "react";
import { CountryDetails, Estate } from "../../types/models";
import { useEu4Worker } from "../../worker";
import React from "react";
import { formatInt, sentenceCasing } from "@/lib/format";
import { Alert } from "@/components/Alert";
import { Card } from "@/components/Card";

const CountryEstate = ({ estate }: { estate: Estate }) => {
  return (
    <Card className="flex w-96 flex-col gap-2 p-4">
      <div className="flex">
        <h3 className="inline-block grow">{estate.kind}</h3>
        <span className="flex gap-4">
          <span>Loyalty: {formatInt(estate.loyalty)}%</span>
          <span>Territory: {formatInt(estate.territory)}%</span>
        </span>
      </div>
      <div>Completed agendas: {formatInt(estate.completedAgendas)}</div>
      {estate.privileges.length > 0 ? (
        <table className="my-2 w-full">
          <thead>
            <tr>
              <th className="text-left">Privilege:</th>
              <th className="text-right">Since:</th>
            </tr>
          </thead>
          <tbody>
            {estate.privileges.map(([privilege, date]) => (
              <tr key={privilege}>
                <td>{sentenceCasing(privilege)}</td>
                <td className="no-break text-right">{date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {estate.influenceModifiers.length > 0 ? (
        <table className="my-2 w-full">
          <thead>
            <tr>
              <th className="text-left">Influence Modifier:</th>
              <th className="text-right">Value:</th>
              <th className="text-right">Expires:</th>
            </tr>
          </thead>
          <tbody>
            {estate.influenceModifiers.map((modifier) => (
              <tr key={`${modifier.desc}-${modifier.date}`}>
                <td>{sentenceCasing(modifier.desc)}</td>
                <td className="pr-2 text-right">{formatInt(modifier.value)}</td>
                <td className="no-break text-right">{modifier.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Card>
  );
};

const CountryEstateDetails = ({ data }: { data: Estate[] }) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="w-96 text-center">
        Crownland:{" "}
        {formatInt(
          data.map((x) => x.territory).reduce((acc, x) => acc - x, 100),
        )}
        %
      </div>
      <div className="flex flex-wrap gap-8">
        {data.map((x) => (
          <CountryEstate key={x.kind} estate={x} />
        ))}
      </div>
    </div>
  );
};

const CountryEstatesImpl = React.memo(CountryEstateDetails);

export interface CountryEstatesProps {
  details: CountryDetails;
}

export const CountryEstates = ({ details }: CountryEstatesProps) => {
  const { data = [], error } = useEu4Worker(
    useCallback(
      (worker) => worker.eu4GetCountryEstates(details.tag),
      [details.tag],
    ),
  );

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (data.length == 0) {
    return <div>No estates</div>;
  } else {
    return <CountryEstatesImpl data={data} />;
  }
};
