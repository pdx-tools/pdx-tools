import React, { useEffect, useState } from "react";
import { message } from "antd";
import { useSelector, useDispatch } from "react-redux";
import { selectLatestToast, popToast } from "./toastSlice";

export const Toaster: React.FC<{}> = () => {
  const dispatch = useDispatch();
  const latestToast = useSelector(selectLatestToast);
  const [hideLoadingToast, setHide] = useState<() => void>(() => () => {});

  useEffect(() => {
    if (latestToast) {
      dispatch(popToast());
      if (latestToast.kind !== "loading" && hideLoadingToast) {
        hideLoadingToast();
        setHide(() => {});
      }

      if (latestToast.kind === "warning") {
        if (typeof latestToast.error === "string") {
          message.error(latestToast.error);
        } else {
          message.error(latestToast.error.message);
        }
      } else if (latestToast.kind === "message") {
        message.info(latestToast.message);
      } else if (latestToast.kind === "success") {
        message.success(latestToast.message);
      } else if (latestToast.kind === "loading") {
        const newHide = message.loading(latestToast.message, 0);
        // @ts-ignore
        setHide(() => () => newHide());
      }
    }
  }, [dispatch, latestToast, hideLoadingToast, setHide]);

  return <span></span>;
};
