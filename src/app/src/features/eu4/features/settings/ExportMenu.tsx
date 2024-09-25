import React, { useCallback } from "react";
import { downloadData } from "@/lib/downloadData";
import { useIsDeveloper } from "@/features/account";
import { getEu4Worker } from "../../worker";
import { selectMapPayload, useEu4Context } from "../../store";
import { DropdownMenu } from "@/components/DropdownMenu";
import { Button } from "@/components/Button";
import { provinceIdToColorIndexInvert } from "map/src/resources";

export const ExportMenu = () => {
  const isDeveloper = useIsDeveloper();
  const store = useEu4Context();

  const colorCb = useCallback(async () => {
    const mapPayload = selectMapPayload(store.getState());
    const { primary } = await getEu4Worker().eu4MapColors(mapPayload);
    downloadData(new Uint8Array(primary.buffer), "color-data.bin");
  }, [store]);

  const indicesCb = useCallback(async () => {
    const provinceIdToColorIndex =
      await getEu4Worker().eu4GetProvinceIdToColorIndex();
    const colorIndexToProvinceId = provinceIdToColorIndexInvert(
      provinceIdToColorIndex,
    );
    downloadData(colorIndexToProvinceId, "color-index.bin");
  }, []);

  if (!isDeveloper) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button variant="default" className="text-xs">
          Export
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="w-40">
        {isDeveloper ? (
          <>
            <DropdownMenu.Item asChild>
              <Button variant="ghost" className="w-full" onClick={colorCb}>
                Color Data
              </Button>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Button variant="ghost" className="w-full" onClick={indicesCb}>
                Index Data
              </Button>
            </DropdownMenu.Item>
          </>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
