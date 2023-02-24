import { PaginationProps } from "antd";
import { create } from "zustand";

type UiControlsState = {
  tablePageSize: number;
  actions: {
    pageSizeChange: (size: number) => void;
  };
};

const useUiControlsStore = create<UiControlsState>()((set) => ({
  tablePageSize: 20,
  actions: {
    pageSizeChange: (size: number) => set({ tablePageSize: size }),
  },
}));

export function useTablePagination(): PaginationProps {
  const { pageSizeChange } = useUiControlsStore((x) => x.actions);
  const tablePageSize = useUiControlsStore((x) => x.tablePageSize);
  return {
    defaultPageSize: tablePageSize,
    showSizeChanger: true,
    onShowSizeChange: (_, size) => pageSizeChange(size),
  };
}
