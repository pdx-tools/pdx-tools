import { useAppDispatch } from "@/lib/store";
import React, { useEffect } from "react";
import { appApi } from "../../services/appApi";
import { setIsDeveloper } from "./sessionSlice";

export const SessionProvider: React.FC<{}> = ({ children }) => {
  const dispatch = useAppDispatch();
  appApi.endpoints.getProfile.useQuery();

  useEffect(() => {
    const isDeveloper = localStorage.getItem("developer") === "1";
    dispatch(setIsDeveloper(isDeveloper));
  }, [dispatch]);
  return <>{children}</>;
};
