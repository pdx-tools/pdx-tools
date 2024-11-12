import { useEffect, useState } from "react";
import { ProvinceDetailsDescriptions } from "./ProvinceDetailsDescriptions";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { useEu4Map } from "../../store";
import { ProvinceDetails } from "../../types/models";
import { getEu4Worker } from "../../worker";
import { Sheet } from "@/components/Sheet";

export const ProvinceSelectListener = () => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const map = useEu4Map();
  const [data, setData] = useState<ProvinceDetails | undefined>();
  useEffect(() => {
    map.register({
      async onProvinceSelect(province) {
        const details = await getEu4Worker().eu4GetProvinceDeteails(
          province.provinceId,
        );
        if (details) {
          map.highlightProvince(province);
          setDrawerVisible(true);
          setData(details);
        } else {
          map.unhighlightProvince();
          setDrawerVisible(false);
        }
      },
    });
  }, [map]);

  const visible = drawerVisible && !!data;
  return (
    <Sheet modal={false} open={visible} onOpenChange={setDrawerVisible}>
      <Sheet.Content
        side="right"
        className="flex w-[480px] max-w-full flex-col bg-white dark:bg-slate-900"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SideBarContainerProvider>
          {data ? (
            <>
              <Sheet.Header className="z-10 items-center p-4 shadow-md">
                <Sheet.Close />
                <Sheet.Title>
                  {data.id}: {data.name}
                </Sheet.Title>
              </Sheet.Header>
              <Sheet.Body className="px-4 py-6">
                <ProvinceDetailsDescriptions province={data} />
              </Sheet.Body>
            </>
          ) : null}
        </SideBarContainerProvider>
      </Sheet.Content>
    </Sheet>
  );
};
