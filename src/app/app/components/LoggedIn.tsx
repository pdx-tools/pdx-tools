import { PropsWithChildren, createContext, useContext } from "react";
import { check } from "@/lib/isPresent";
import { type PdxUserSession } from "@/server-lib/auth/cookie";

const LoggedInContext = createContext<undefined | PdxUserSession>(undefined);

export function LoggedIn({
  children,
  session,
}: PropsWithChildren<{ session: PdxUserSession }>) {
  return (
    <LoggedInContext.Provider value={session}>
      {children}
    </LoggedInContext.Provider>
  );
}

export const useLoggedIn = () => check(useContext(LoggedInContext));
