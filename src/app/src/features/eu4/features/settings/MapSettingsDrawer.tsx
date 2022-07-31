import { Drawer } from "antd";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { MapSettings } from "./MapSettings";

interface CountryDetailsProps {
  visible: boolean;
  closeDrawer: () => void;
}

export const MapSettingsDrawer = ({
  visible,
  closeDrawer,
}: CountryDetailsProps) => {
  const sideBarContainerRef = useSideBarContainerRef();
  return (
    <Drawer
      title="Map Settings"
      placement="right"
      closable={true}
      mask={false}
      maskClosable={false}
      onClose={closeDrawer}
      visible={visible}
      width="min(400px, 100%)"
    >
      <div className="flex flex-col gap-2" ref={sideBarContainerRef}>
        <MapSettings />
      </div>
    </Drawer>
  );
};
