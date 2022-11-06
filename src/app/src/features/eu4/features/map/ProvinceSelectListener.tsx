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
  selectAnalyzeId,
} from "@/features/engine";
import { useSelector } from "react-redux";

export const ProvinceSelectListener = () => {
  const eu4CanvasRef = useEu4CanvasRef();
  const analyzeId = useSelector(selectAnalyzeId);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [provinceDetails, setProvinceDetails] = useState<
    ProvinceDetails | undefined
  >(undefined);
  const [provinceId, setProvinceId] = useState<number | undefined>(undefined);

  const map = eu4CanvasRef.current?.map;
  if (map) {
    map.onProvinceSelection = (id) => setProvinceId(id);
  }

  useEffect(() => {
    setProvinceId(undefined);
    setProvinceDetails(undefined);
  }, [analyzeId]);

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
      visible={drawerVisible && provinceId !== undefined}
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
