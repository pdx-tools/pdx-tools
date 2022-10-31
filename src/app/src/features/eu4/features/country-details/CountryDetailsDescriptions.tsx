import React, { useMemo } from "react";
import { StopOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Descriptions } from "antd";
import { formatFloat, formatInt } from "@/lib/format";
import { CountryDetails } from "@/features/eu4/types/models";
import { InheritanceLabel } from "./InheritanceLabel";
import { useIsJuniorPartner } from "./detailHooks";

interface CountryDetailsProps {
  details: CountryDetails;
}

export const CountryDetailsDescriptions = ({
  details,
}: CountryDetailsProps) => {
  const { ruler, technology, ideas } = details;
  const isJuniorParter = useIsJuniorPartner(details);
  let ideaElem = ideas.map(([name, count]) => {
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
          <div className="flex">{ideaMarkers}</div>
        </td>
      </tr>
    );
  });

  return (
    <Descriptions>
      <Descriptions.Item label="Prestige">{`${formatFloat(
        details.prestige,
        3
      )}`}</Descriptions.Item>
      <Descriptions.Item label="Stability">{`${formatInt(
        details.stability
      )}`}</Descriptions.Item>
      <Descriptions.Item label="Ducats">{`${formatInt(
        details.treasury
      )}`}</Descriptions.Item>
      <Descriptions.Item label="Inflation">{`${formatFloat(
        details.inflation,
        2
      )}`}</Descriptions.Item>
      <Descriptions.Item label="Corruption">{`${formatFloat(
        details.corruption,
        2
      )}`}</Descriptions.Item>
      <Descriptions.Item label="Religion">{`${details.religion}`}</Descriptions.Item>
      <Descriptions.Item label="Primary Culture">{`${details.primary_culture}`}</Descriptions.Item>
      <Descriptions.Item
        label="Ruler"
        span={2}
      >{`${ruler.name} (${ruler.adm} / ${ruler.dip} / ${ruler.mil})`}</Descriptions.Item>
      <Descriptions.Item label="Technology">{`(${technology.adm_tech} / ${technology.dip_tech} / ${technology.mil_tech})`}</Descriptions.Item>
      <Descriptions.Item label="Loans">{`${formatInt(
        details.loans
      )} (${formatInt(details.debt)})`}</Descriptions.Item>

      <Descriptions.Item label="Ideas">
        <table className="px-0 py-1">
          <tbody>{ideaElem}</tbody>
        </table>
      </Descriptions.Item>
      <Descriptions.Item label={<InheritanceLabel details={details} />} 
        span={3}>
        <div className="no-break flex flex-col">
          {!isJuniorParter && (
            <div>{`Window: [${details.inheritance.start_t1_year} - ${details.inheritance.end_t1_year}]`}</div>
          )}
          <div>{`Inheritance Value: ${details.inheritance.inheritance_value}`}</div>
        </div>
      </Descriptions.Item>

      <Descriptions.Item label="Dev">
        <div className="no-break flex flex-col">
          <div>{`${formatFloat(details.development, 2)} / ${formatInt(details.raw_development)}`}</div>
          <div>{`${formatFloat(100 * (1 - details.development/details.raw_development), 2)}% avg autonomy`}</div>
        </div>
      </Descriptions.Item>
    </Descriptions>
  );
};
