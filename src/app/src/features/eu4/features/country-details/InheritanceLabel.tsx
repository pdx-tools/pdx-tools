import { Button, Drawer } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useEu4Meta } from "../../eu4Slice";
import { CountryDetails } from "../../types/models";

export interface InheranticeLabelProps {
  details: CountryDetails;
}

export const InheritanceLabel: React.FC<InheranticeLabelProps> = ({
  details,
}) => {
  const { inheritance, tag, num_cities } = details;
  const [drawerVisible, setDrawerVisible] = useState(false);
  const meta = useEu4Meta();
  const saveYear = +meta.date.split("-")[0];
  return (
    <div className="flex-row gap">
      <Drawer
        placement="right"
        closable={true}
        onClose={() => setDrawerVisible(false)}
        visible={drawerVisible}
        width="400px"
      >
        <div>
          <style jsx>{`
            table {
              margin-bottom: 1rem;
              width: 100%;
            }

            td:nth-child(2) {
              text-align: right;
            }
          `}</style>
          <h2>Inheritance Values</h2>
          <table>
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
              <tr className="bg-gray-3">
                <td>Subtotal</td>
                <td>{inheritance.subtotal}</td>
              </tr>
              <tr>
                <td>Save year</td>
                <td>{saveYear}</td>
              </tr>
              <tr className="bg-gray-3">
                <td>Total</td>
                <td>{saveYear + inheritance.subtotal}</td>
              </tr>
              <tr className="bg-gray-3">
                <td>Inheritance Value</td>
                <td>{inheritance.inheritance_value}</td>
              </tr>
            </tbody>
          </table>

          <h3>On Ruler Death Tiers:</h3>
          <table>
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

          <p>
            Inheritance values give us insight into the window of inclusive
            years of other countries, who will be inherited if their ruler dies
            without an heir. All inheritance windows shift on new emperors,
            papacy controller changes, capital provinces, and number of
            provinces, so check this window frequently.
          </p>
          <p>
            These values also inform us of the chances a junior country in a
            personal union (PU) will be inherited on death (or abdication). The
            personal union chance factor already includes the size of the nation
            in the calculations, hence the possibility of negative chances. You
            need to add your diplomatic reputation and{" "}
            <a href="https://eu4.paradoxwikis.com/Personal_union#Inheritance">
              other factors
            </a>{" "}
            to calculate the true percentage.
          </p>
          <p>
            This is feature is currently intended to be used while EU4 is open,
            as EU4 informs us of rulers without an heir. Cross reference that
            list here to find old rulers who are likely die within their
            inheritance window.
          </p>
          <p>For more information LINK TO ATWIX AND REDDIT POST</p>
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
