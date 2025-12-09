import type { ReactNode } from "react";
import { Eu5Context } from "./eu5Store";
import type { Eu5Store } from "./eu5Store";

export const Eu5StoreProvider = ({
  children,
  store,
}: {
  children: ReactNode;
  store: Eu5Store;
}) => {
  return <Eu5Context.Provider value={store}>{children}</Eu5Context.Provider>;
};
