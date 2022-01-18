import { useAppSelector } from "@/lib/store";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Ck3Metadata } from "../engine/worker/ck3";

interface EndCk3AnalyzePayload {
  meta: Ck3Metadata;
}

interface Ck3State {
  meta: Ck3Metadata | undefined;
}

const initialState: Ck3State = {
  meta: undefined,
};

const ck3Slice = createSlice({
  name: "ck3",
  initialState: initialState,
  reducers: {
    endCk3Analyze(state, action: PayloadAction<EndCk3AnalyzePayload>) {
      state.meta = action.payload.meta;
    },
  },
});

export function useCk3Meta() {
  const meta = useAppSelector((state) => state.ck3.meta);
  if (!meta) {
    throw new Error("ck3 save meta must be defined");
  }

  return meta;
}

export const { endCk3Analyze } = ck3Slice.actions;

export const { reducer } = ck3Slice;
