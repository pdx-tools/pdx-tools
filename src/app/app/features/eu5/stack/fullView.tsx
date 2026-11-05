import { createContext, useContext } from "react";

/** The view of the frame: the map with the column beside it, or the analysis alone */
export type FullView = { on: boolean; toggle: () => void };

export const FullViewContext = createContext<FullView>({ on: false, toggle: () => {} });

export function useFullView(): FullView {
  return useContext(FullViewContext);
}
