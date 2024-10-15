import React, { useContext, useEffect, useState } from "react";
import { getIsDeveloper } from "../../lib/isDeveloper";
import { PdxSession } from "@/server-lib/auth/session";
import { check } from "@/lib/isPresent";

type SessionProviderProps = {
  children: React.ReactNode;
  profile: PdxSession;
};

interface SessionContextData {
  isDeveloper: boolean;
  profile?: PdxSession;
}

const SessionContext = React.createContext<SessionContextData>({
  isDeveloper: false,
  profile: undefined,
});

export const SessionProvider = ({
  children,
  profile,
}: SessionProviderProps) => {
  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    setIsDeveloper(getIsDeveloper());
  }, []);

  return (
    <SessionContext.Provider value={{ isDeveloper, profile }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => check(useContext(SessionContext).profile);

export const useIsDeveloper = () => useContext(SessionContext).isDeveloper;
