import { Drawer } from "antd";
import { useCallback, useEffect, useState } from "react";
import { ProvinceDetailsDescriptions } from "./ProvinceDetailsDescriptions";
import { ProvinceDetails } from "../../types/models";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import {
  useEu4CanvasRef,
  getEu4Canvas,
  WorkerClient,
  useWorkerOnSave,
} from "@/features/engine";

export const ProvinceSelectListener: React.FC<{}> = () => {
  const eu4CanvasRef = useEu4CanvasRef();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [provinceDetails, setProvinceDetails] = useState<
    ProvinceDetails | undefined
  >(undefined);
  const [provinceId, setProvinceId] = useState<number | undefined>(undefined);

  useEffect(() => {
    const map = eu4CanvasRef.current?.map;
    if (map) {
      map.onProvinceSelection = (id) => setProvinceId(id);
    }
  }, [eu4CanvasRef]);

  const cb = useCallback(
    async (worker: WorkerClient) => {
      if (provinceId === undefined) {
        return;
      }

      const data = await worker.eu4GetProvinceDeteails(provinceId);
      setProvinceDetails(data);
      setDrawerVisible(true);
    },
    [provinceId]
  );

  useWorkerOnSave(cb);

  return (
    <Drawer
      title="Province Details"
      placement="right"
      onClose={() => setDrawerVisible(false)}
      visible={drawerVisible}
      mask={false}
      closable={true}
      width="min(400px, 100%)"
    >
      <SideBarContainerProvider>
        {provinceDetails ? (
          <ProvinceDetailsDescriptions province={provinceDetails} />
        ) : null}
      </SideBarContainerProvider>
    </Drawer>
  );
};
