import React, { useContext, useEffect, useState } from "react";
import { getIsDeveloper } from "./isDeveloper";

type SessionProviderProps = {
  children: React.ReactNode;
};

interface SessionContextData {
  isDeveloper: boolean;
}

const SessionContext = React.createContext<SessionContextData>({
  isDeveloper: false,
});

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    setIsDeveloper(getIsDeveloper());
  }, []);

  return (
    <SessionContext.Provider value={{ isDeveloper }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useIsDeveloper = () => useContext(SessionContext).isDeveloper;
