import { PropsWithChildren, createContext, useContext } from "react";
import { PrivateUserInfo, sessionSelect } from "@/services/appApi";
import { check } from "@/lib/isPresent";
import { useSession } from "@/features/account";

const LoggedInContext = createContext<undefined | PrivateUserInfo>(undefined);

export function LoggedIn({ children }: PropsWithChildren<{}>) {
  const session = useSession();
  return sessionSelect.isLoggedIn(session) ? (
    <LoggedInContext.Provider value={session.user}>
      {children}
    </LoggedInContext.Provider>
  ) : null;
}

export const useLoggedIn = () => check(useContext(LoggedInContext));
