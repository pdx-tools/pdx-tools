import { Drawer } from "antd";
import { useEffect, useState } from "react";
import { ProvinceDetailsDescriptions } from "./ProvinceDetailsDescriptions";
import { SideBarContainerProvider, closeDrawerPropagation } from "../../components/SideBarContainer";
import { useEu4Map } from "../../store";
import { ProvinceDetails } from "../../types/models";
import { getEu4Worker } from "../../worker";

export const ProvinceSelectListener = () => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const map = useEu4Map();
  const [data, setData] = useState<ProvinceDetails | undefined>();
  useEffect(() => {
    map.onProvinceSelection = async (id) => {
      const details = await getEu4Worker().eu4GetProvinceDeteails(id);
      if (details) {
        map.highlightSelectedProvince();
        map.redrawMapImage();
        setDrawerVisible(true);
        setData(details);
      } else {
        map.unhighlightSelectedProvince();
        map.redrawMapImage();
        setDrawerVisible(false);
      }
    };

    return () => {
      map.onProvinceSelection = undefined;
    };
  }, [map]);

  const visible = drawerVisible && !!data;
  return (
    <Drawer
      title="Province Details"
      placement="right"
      onClose={closeDrawerPropagation(() => setDrawerVisible(false), visible)}
      visible={visible}
      mask={false}
      closable={true}
      width="min(400px, 100%)"
    >
      <SideBarContainerProvider>
        {data ? <ProvinceDetailsDescriptions province={data} /> : null}
      </SideBarContainerProvider>
    </Drawer>
  );
};
