import { Drawer } from "antd";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { MapSettings } from "./MapSettings";

interface CountryDetailsProps {
  visible: boolean;
  closeDrawer: () => void;
}

export const MapSettingsDrawer: React.FC<CountryDetailsProps> = ({
  visible,
  closeDrawer,
}) => {
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
      <div className="flex-col gap" ref={sideBarContainerRef}>
        <MapSettings />
      </div>
    </Drawer>
  );
};
