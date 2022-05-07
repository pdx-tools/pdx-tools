import { useAppDispatch } from "@/lib/store";
import React, { useEffect } from "react";
import { appApi } from "../../services/appApi";
import { setIsDeveloper } from "./sessionSlice";

interface SessionProviderProps {
  children: React.ReactNode;
}

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const dispatch = useAppDispatch();
  appApi.endpoints.getProfile.useQuery();

  useEffect(() => {
    const isDeveloper = localStorage.getItem("developer") === "1";
    dispatch(setIsDeveloper(isDeveloper));
  }, [dispatch]);
  return <>{children}</>;
};
