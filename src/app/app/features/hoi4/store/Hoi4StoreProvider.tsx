import { Hoi4SaveContext, Hoi4Store } from "./hoi4Store";

type Hoi4StoreProviderProps = React.PropsWithChildren<{ store: Hoi4Store }>;
export function Hoi4StoreProvider({ children, store }: Hoi4StoreProviderProps) {
  return (
    <Hoi4SaveContext.Provider value={store}>
      {children}
    </Hoi4SaveContext.Provider>
  );
}
