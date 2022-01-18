import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../../lib/store";
import { ProfileResponse, rakalyApi } from "../../services/rakalyApi";

type SessionStatus =
  | {
      kind: "unknown";
    }
  | ProfileResponse;

interface SessionState {
  session: SessionStatus;
  isDeveloper: boolean;
}

const initialState: SessionState = {
  session: { kind: "unknown" },
  isDeveloper: false,
};

const sessionSlice = createSlice({
  name: "session",
  initialState: initialState,
  reducers: {
    setIsDeveloper(state, action: PayloadAction<boolean>) {
      state.isDeveloper = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      rakalyApi.endpoints.getProfile.matchFulfilled,
      (state, action) => {
        state.session = action.payload;
      }
    );

    builder.addMatcher(
      rakalyApi.endpoints.logout.matchFulfilled,
      (state, action) => {
        state.session = action.payload;
      }
    );
  },
});

export const hasSession = (state: RootState) =>
  state.session.session.kind === "user";
export const selectUserInfo = (state: RootState) => {
  if (state.session.session.kind === "user") {
    return state.session.session.user;
  } else {
    return undefined;
  }
};

export const selectIsDeveloper = (state: RootState) =>
  state.session.isDeveloper;

export const selectIsPrivileged = (state: RootState) =>
  selectUserInfo(state)?.account === "admin";
export const selectSession = (state: RootState) => state.session.session;
export const { setIsDeveloper } = sessionSlice.actions;
export const { reducer } = sessionSlice;
