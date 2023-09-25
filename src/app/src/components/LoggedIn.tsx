import { PropsWithChildren, createContext, useContext } from "react";
import { PrivateUserInfo, pdxApi, sessionSelect } from "@/services/appApi";
import { check } from "@/lib/isPresent";

const LoggedInContext = createContext<undefined | PrivateUserInfo>(undefined);

export function LoggedIn({ children }: PropsWithChildren<{}>) {
  const session = pdxApi.session.useCurrent();
  return sessionSelect.isLoggedIn(session) ? (
    <LoggedInContext.Provider value={session.data.user}>
      {children}
    </LoggedInContext.Provider>
  ) : null;
}

export const useLoggedIn = () => check(useContext(LoggedInContext));
