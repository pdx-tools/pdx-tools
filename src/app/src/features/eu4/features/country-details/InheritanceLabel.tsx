import { Button, Drawer } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useState } from "react";

export const InheritanceLabel: React.FC<{}> = () => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  return (
    <div className="flex-row gap">
      <Drawer
        placement="right"
        closable={true}
        onClose={() => setDrawerVisible(false)}
        visible={drawerVisible}
      >
        <div>
          <h2>Inheritance Rolls</h2>
          <p>
            Inheritance rolls give us insight into the window of inclusive years
            of other countries, who will be inherited if their ruler dies
            without an heir. This five year window happens once a century.
          </p>
          <p>
            These rolls also inform us of the chances a junior country in a
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
