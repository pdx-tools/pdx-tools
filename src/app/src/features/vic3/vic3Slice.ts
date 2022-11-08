import { useAppSelector } from "@/lib/store";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Vic3Metadata } from "../engine/worker/vic3";

interface EndVic3AnalyzePayload {
  meta: Vic3Metadata;
}

interface Vic3State {
  meta: Vic3Metadata | undefined;
}

const initialState: Vic3State = {
  meta: undefined,
};

const vic3Slice = createSlice({
  name: "vic3",
  initialState: initialState,
  reducers: {
    endVic3Analyze(state, action: PayloadAction<EndVic3AnalyzePayload>) {
      state.meta = action.payload.meta;
    },
  },
});

export function useVic3Meta() {
  const meta = useAppSelector((state) => state.vic3.meta);
  if (!meta) {
    throw new Error("vic3 save meta must be defined");
  }

  return meta;
}

export const { endVic3Analyze } = vic3Slice.actions;

export const { reducer } = vic3Slice;
