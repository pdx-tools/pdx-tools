import React from "react";

interface VisualizationState {
  loading: number;
  getCsvData: () => Promise<string>;
}

type Action =
  | { type: "enqueue-loading" }
  | { type: "dequeue-loading" }
  | { type: "update-csv-data"; getCsvData: VisualizationState["getCsvData"] };

type Dispatch = (action: Action) => void;
const VisualizationContext = React.createContext<
  VisualizationState | undefined
>(undefined);
const VisualizationDispatchContext = React.createContext<Dispatch | undefined>(
  undefined,
);

function visualizationReducer(
  state: VisualizationState,
  action: Action,
): VisualizationState {
  switch (action.type) {
    case "enqueue-loading":
      return { ...state, loading: state.loading + 1 };
    case "dequeue-loading":
      return { ...state, loading: state.loading - 1 };
    case "update-csv-data":
      return { ...state, getCsvData: action.getCsvData };
  }
}

interface VisualizationProviderProps {
  children: React.ReactNode;
}

export const VisualizationProvider = ({
  children,
}: VisualizationProviderProps) => {
  const [state, dispatch] = React.useReducer(visualizationReducer, {
    loading: 0,
    getCsvData: async () => "",
  });

  return (
    <VisualizationContext.Provider value={state}>
      <VisualizationDispatchContext.Provider value={dispatch}>
        {children}
      </VisualizationDispatchContext.Provider>
    </VisualizationContext.Provider>
  );
};

export function useVisualization() {
  const data = React.useContext(VisualizationContext);
  if (data === undefined) {
    throw new Error("visualization context is undefined");
  }

  return data;
}

export function useVisualizationDispatch() {
  const data = React.useContext(VisualizationDispatchContext);
  if (data === undefined) {
    throw new Error("visualization dispatch context is undefined");
  }

  return data;
}

export function useIsLoading(): boolean {
  return useVisualization().loading > 0;
}
