import { Button, Drawer, Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useState } from "react";
import { CountryDetails } from "../../types/models";
import classes from "./InheritanceLabel.module.css";
import { useIsJuniorPartner } from "./detailHooks";
import { useEu4Meta } from "../../store";
import { formatInt } from "@/lib/format";

export interface InheranticeLabelProps {
  isJuniorPartner: boolean;
  details: CountryDetails;
}

export const InheritanceLabel = ({
  details,
  isJuniorPartner,
}: InheranticeLabelProps) => {
  const { inheritance, tag, num_cities } = details;
  const [drawerVisible, setDrawerVisible] = useState(false);
  const meta = useEu4Meta();
  const saveYear = +meta.date.split("-")[0];
  const isJuniorParter = useIsJuniorPartner(details);

  return (
    <div className="flex items-center gap-2">
      <Drawer
        placement="right"
        closable={true}
        onClose={() => setDrawerVisible(false)}
        visible={drawerVisible}
        width="450px"
      >
        <div className={classes.table}>
          <h2>Inheritance Value Breakdown</h2>
          <table className="mb-4 w-full">
            <tbody>
              <tr>
                <td>
                  HRE Ruler ID ({inheritance.calculations.hre.emperor_tag})
                </td>
                <td>{formatInt(inheritance.calculations.hre.ruler_id)}</td>
              </tr>
              <tr>
                <td>
                  Curia Controller Nation ID (
                  {inheritance.calculations.curia.controller_tag})
                </td>
                <td
                  className={
                    inheritance.calculations.curia.enabled ? "" : "line-through"
                  }
                >
                  <Tooltip
                    placement="topRight"
                    title="Only applies to Catholic nations"
                  >
                    {formatInt(inheritance.calculations.curia.controller_id)}
                  </Tooltip>
                </td>
              </tr>
              <tr>
                <td>Nation ID ({details.tag})</td>
                <td>{formatInt(inheritance.calculations.nation_id)}</td>
              </tr>
              <tr>
                <td>Ruler ID ({details.tag})</td>
                <td>{formatInt(inheritance.calculations.ruler_id)}</td>
              </tr>
              {isJuniorParter ? (
                <tr>
                  <td>Heir ID ({details.tag})</td>
                  <td
                    className={
                      inheritance.calculations.heir.enabled
                        ? ""
                        : "line-through"
                    }
                  >
                    <Tooltip
                      placement="topRight"
                      title="Only if the heir is younger than 15 years old"
                    >
                      {formatInt(inheritance.calculations.heir.heir_id ?? 0)}
                    </Tooltip>
                  </td>
                </tr>
              ) : null}
              <tr>
                <td>Previous Rulers ({details.tag})</td>
                <td>
                  {formatInt(inheritance.calculations.previous_ruler_ids)}
                </td>
              </tr>
              <tr>
                <td>Capital Province ({details.tag})</td>
                <td>{formatInt(inheritance.calculations.capital_province)}</td>
              </tr>
              <tr>
                <td>Owned Provinces ({details.tag})</td>
                <td>{formatInt(inheritance.calculations.owned_provinces)}</td>
              </tr>
              <tr className="bg-gray-200">
                <td>Subtotal</td>
                <td>
                  {formatInt(
                    isJuniorParter
                      ? inheritance.pu_subtotal
                      : inheritance.subtotal
                  )}
                </td>
              </tr>
              <tr>
                <td>Save year</td>
                <td>{saveYear}</td>
              </tr>
              <tr className="bg-gray-200">
                <td>Inheritance Value</td>
                <td>
                  {formatInt(
                    isJuniorParter
                      ? inheritance.pu_inheritance_value
                      : inheritance.inheritance_value
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <h3>On Ruler Death Tiers:</h3>
          {!isJuniorParter ? (
            <table className="mb-4 w-full">
              <tbody>
                <tr>
                  <td>
                    Spread Dynasty (T0){" "}
                    {saveYear >= inheritance.start_t0_year &&
                      saveYear < inheritance.end_t0_year && (
                        <span className="font-bold">(active)</span>
                      )}
                  </td>
                  <td>
                    {inheritance.start_t0_year} - {inheritance.end_t0_year}
                  </td>
                </tr>
                <tr>
                  <td>
                    Inheritance (T1){" "}
                    {saveYear >= inheritance.start_t1_year &&
                      saveYear < inheritance.end_t1_year && (
                        <span className="font-bold">(active)</span>
                      )}
                  </td>
                  <td>
                    {inheritance.start_t1_year} - {inheritance.end_t1_year}
                  </td>
                </tr>
                <tr>
                  <td>
                    Personal Union (T2){" "}
                    {saveYear >= inheritance.start_t2_year &&
                      saveYear < inheritance.end_t2_year && (
                        <span className="font-bold">(active)</span>
                      )}
                  </td>
                  <td>
                    {inheritance.start_t2_year} - {inheritance.end_t2_year}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p>
              Inheritance occurs when the inheritance chance (shown in game) is
              greater than inheritance value ({inheritance.pu_inheritance_value}
              )
            </p>
          )}

          <p>
            <a
              target="_blank"
              href="/docs/eu4-guides/royal-marriage-inheritance/"
            >
              Check out the guide on inheritance values
            </a>
            , which will deteministically tell you if the death of an heirless
            ruler will result in a PU or even an inheritance! It will also tell
            you if the junior partner of a PU will be inherited.
          </p>
        </div>
      </Drawer>
      <div>Inheritance</div>
      <Button
        onClick={() => setDrawerVisible(true)}
        icon={<QuestionCircleOutlined />}
      />
    </div>
  );
};
