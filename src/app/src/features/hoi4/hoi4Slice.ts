import { useAppSelector } from "@/lib/store";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Hoi4Metadata } from "../engine/worker/hoi4";

interface EndHoi4AnalyzePayload {
  meta: Hoi4Metadata;
}

interface Hoi4State {
  meta: Hoi4Metadata | undefined;
}

const initialState: Hoi4State = {
  meta: undefined,
};

const hoi4Slice = createSlice({
  name: "hoi4",
  initialState: initialState,
  reducers: {
    endHoi4Analyze(state, action: PayloadAction<EndHoi4AnalyzePayload>) {
      state.meta = action.payload.meta;
    },
  },
});

export function useHoi4Meta() {
  const meta = useAppSelector((state) => state.hoi4.meta);
  if (!meta) {
    throw new Error("hoi4 save meta must be defined");
  }

  return meta;
}

export const { endHoi4Analyze } = hoi4Slice.actions;

export const { reducer } = hoi4Slice;
