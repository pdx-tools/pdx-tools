import React, { useContext, useEffect, useState } from "react";
import { getIsDeveloper } from "../../lib/isDeveloper";
import { PdxSession } from "@/server-lib/auth/session";
import { check } from "@/lib/isPresent";
import { pdxApi } from "@/services/appApi";

type SessionProviderProps = {
  children: React.ReactNode;
};

interface SessionContextData {
  isDeveloper: boolean;
  profile?: PdxSession;
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

  return (
    <SessionContext.Provider value={{ isDeveloper, profile: profile.data }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => check(useContext(SessionContext).profile);

export const useIsDeveloper = () => useContext(SessionContext).isDeveloper;
