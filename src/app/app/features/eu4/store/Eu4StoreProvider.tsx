import { Eu4SaveContext, Eu4Store } from "./eu4Store";

type Eu4StoreProviderProps = React.PropsWithChildren<{ store: Eu4Store }>;
export function Eu4StoreProvider({ children, store }: Eu4StoreProviderProps) {
  return (
    <Eu4SaveContext.Provider value={store}>{children}</Eu4SaveContext.Provider>
  );
}
