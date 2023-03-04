import { Button, Drawer } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useState } from "react";
import { CountryDetails } from "../../types/models";
import classes from "./InheritanceLabel.module.css";
import { useIsJuniorPartner } from "./detailHooks";
import { useEu4Meta } from "../../store";

export interface InheranticeLabelProps {
  details: CountryDetails;
}

export const InheritanceLabel = ({ details }: InheranticeLabelProps) => {
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
              {inheritance.calculations.map((x) => (
                <tr key={x.name}>
                  <td>
                    {x.name}
                    {x.dependency != "Independent"
                      ? ` (${x.dependency.Dependent})`
                      : ``}
                  </td>
                  <td>{x.value}</td>
                </tr>
              ))}
              <tr className="bg-gray-200">
                <td>Subtotal</td>
                <td>{inheritance.subtotal}</td>
              </tr>
              <tr>
                <td>Save year</td>
                <td>{saveYear}</td>
              </tr>
              <tr className="bg-gray-200">
                <td>Inheritance Value</td>
                <td>{inheritance.inheritance_value}</td>
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
              greater than inheritance value ({inheritance.inheritance_value})
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
