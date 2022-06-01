import { useAppDispatch, useAppSelector } from "@/lib/store";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { PaginationProps } from "antd";

interface UiControlsState {
  tablePageSize?: number;
}

const initialState: UiControlsState = {
  tablePageSize: undefined,
};

const uiControlsSlice = createSlice({
  name: "uiControls",
  initialState: initialState,
  reducers: {
    pageSizeChange(state, action: PayloadAction<number>) {
      state.tablePageSize = action.payload;
    },
  },
});

export function useTablePagination(): PaginationProps {
  const dispatch = useAppDispatch();
  const tablePageSize = useAppSelector((x) => x.uiControls.tablePageSize);
  return {
    defaultPageSize: tablePageSize,
    showSizeChanger: true,
    onShowSizeChange: (_, size) => dispatch(pageSizeChange(size)),
  };
}

export const { pageSizeChange } = uiControlsSlice.actions;

export const { reducer } = uiControlsSlice;
