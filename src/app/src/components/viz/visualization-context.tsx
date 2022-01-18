import React from "react";

interface VisualizationState {
  loading: number;
}

type Action = { type: "enqueue-loading" } | { type: "dequeue-loading" };

type Dispatch = (action: Action) => void;
const VisualizationContext = React.createContext<
  VisualizationState | undefined
>(undefined);
const VisualizationDispatchContext = React.createContext<Dispatch | undefined>(
  undefined
);

function visualizationReducer(
  state: VisualizationState,
  action: Action
): VisualizationState {
  switch (action.type) {
    case "enqueue-loading":
      return { ...state, loading: state.loading + 1 };
    case "dequeue-loading":
      return { ...state, loading: state.loading - 1 };
  }
}

export const VisualizationProvider: React.FC<{}> = ({ children }) => {
  const [state, dispatch] = React.useReducer(visualizationReducer, {
    loading: 0,
  });

  return (
    <VisualizationContext.Provider value={state}>
      <VisualizationDispatchContext.Provider value={dispatch}>
        {children}
      </VisualizationDispatchContext.Provider>
    </VisualizationContext.Provider>
  );
};

function useVisualization() {
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
