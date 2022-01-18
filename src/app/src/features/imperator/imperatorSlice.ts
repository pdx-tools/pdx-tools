import { useAppSelector } from "@/lib/store";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ImperatorMetadata } from "../engine/worker/imperator";

interface EndImperatorAnalyzePayload {
  meta: ImperatorMetadata;
}

interface ImperatorState {
  meta: ImperatorMetadata | undefined;
}

const initialState: ImperatorState = {
  meta: undefined,
};

const imperatorSlice = createSlice({
  name: "imperator",
  initialState: initialState,
  reducers: {
    endImperatorAnalyze(
      state,
      action: PayloadAction<EndImperatorAnalyzePayload>
    ) {
      state.meta = action.payload.meta;
    },
  },
});

export function useImperatorMeta() {
  const meta = useAppSelector((state) => state.imperator.meta);
  if (!meta) {
    throw new Error("imperator save meta must be defined");
  }

  return meta;
}

export const { endImperatorAnalyze } = imperatorSlice.actions;

export const { reducer } = imperatorSlice;
