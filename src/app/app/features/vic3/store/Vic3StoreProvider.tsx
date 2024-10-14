import { Vic3SaveContext, Vic3Store } from "./vic3Store";

type Vic3StoreProviderProps = React.PropsWithChildren<{ store: Vic3Store }>;
export function Vic3StoreProvider({ children, store }: Vic3StoreProviderProps) {
  return (
    <Vic3SaveContext.Provider value={store}>
      {children}
    </Vic3SaveContext.Provider>
  );
}
