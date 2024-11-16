import React, { useContext, useEffect, useState } from "react";
import { getIsDeveloper } from "@/lib/isDeveloper";
import { check } from "@/lib/isPresent";
import { pdxApi } from "@/services/appApi";
import { pdxUser, type User } from "@/lib/auth";

type SessionProviderProps = {
  children: React.ReactNode;
};

interface SessionContextData {
  isDeveloper: boolean;
  profile?: User;
}

const SessionContext = React.createContext<SessionContextData>({
  isDeveloper: false,
  profile: undefined,
});

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const [isDeveloper, setIsDeveloper] = useState(false);
  const profile = pdxApi.session.useCurrent();
  useEffect(() => {
    setIsDeveloper(getIsDeveloper());
  }, []);

  const user = pdxUser(profile.data);
  return (
    <SessionContext.Provider value={{ isDeveloper, profile: user }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => check(useContext(SessionContext).profile);

export const useIsDeveloper = () => useContext(SessionContext).isDeveloper;
