import type { MapCamera } from "@pdx.tools/map";
import type { Eu4Store } from "./store/eu4Store";

type Eu4State = ReturnType<Eu4Store["getState"]>;

/** What the next EU4 save of the campaign keeps of the view. */
export type Eu4Carry = {
  mapMode: Eu4State["mapMode"];
  /** The country by its tag. A tag that is gone from the next save is not kept. */
  selectedTag: string;
  countryDrawerVisible: boolean;
  camera: MapCamera | null;
};

export async function captureEu4Carry(store: Eu4Store): Promise<Eu4Carry> {
  const state = store.getState();
  return {
    mapMode: state.mapMode,
    selectedTag: state.selectedTag,
    countryDrawerVisible: state.countryDrawerVisible,
    camera: await state.map.getCamera(),
  };
}
