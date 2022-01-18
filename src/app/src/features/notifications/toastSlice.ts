import { createSlice, SerializedError } from "@reduxjs/toolkit";
import { RootState } from "../../lib/store";
import { rakalyApi } from "../../services/rakalyApi";

type ApiError = Error | SerializedError | string;

interface Message {
  kind: "message";
  message: string;
}

interface Success {
  kind: "success";
  message: string;
}

interface Loading {
  kind: "loading";
  message: string;
}

interface Warning {
  kind: "warning";
  error: ApiError;
}

type Toast = Message | Warning | Success | Loading;

interface SliceState {
  toasts: Toast[];
}

const initialState: SliceState = {
  toasts: [],
};

const err = (e: ApiError): Toast => {
  return {
    kind: "warning",
    error: e,
  };
};

const toastSlice = createSlice({
  name: "toast",
  initialState: initialState,
  reducers: {
    newError(state, action) {
      console.error(action.payload);
      state.toasts.push(err(action.payload));
    },
    popToast(state) {
      state.toasts.pop();
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      rakalyApi.endpoints.deleteSave.matchFulfilled,
      (state) => {
        state.toasts.push({
          kind: "success",
          message: "save deleted",
        });
      }
    );

    builder.addMatcher(
      rakalyApi.endpoints.getAchievements.matchRejected,
      (state, { error, payload }) => {
        if (!payload) {
          state.toasts.push({
            kind: "warning",
            error: { message: error.message },
          });
        } else {
          var data = payload.data as ApiError;
          state.toasts.push(err(data));
        }
      }
    );
  },
});

export const { newError, popToast } = toastSlice.actions;
export const selectLatestToast = (state: RootState) =>
  state.toaster.toasts.slice(-1)[0];
export const { reducer } = toastSlice;
