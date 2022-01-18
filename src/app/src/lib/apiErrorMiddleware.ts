import {
  MiddlewareAPI,
  isRejectedWithValue,
  isRejected,
  Middleware,
} from "@reduxjs/toolkit";
import { captureException } from "@sentry/nextjs";
import { newError } from "../features/notifications/toastSlice";
import { rakalyApi } from "../services/rakalyApi";
export const rtkQueryErrorLogger: Middleware =
  (api: MiddlewareAPI) => (next) => (action) => {
    if (isRejectedWithValue(action)) {
      captureException(action.payload.data.msg);
      api.dispatch(newError(action.payload.data.msg));
    } else if (
      isRejected(action) &&
      (action.type || "").startsWith(`${rakalyApi.reducerPath}/`) &&
      action.error?.name !== "ConditionError"
    ) {
      captureException(action.error);
      api.dispatch(newError(action.error.message));
    }

    return next(action);
  };
