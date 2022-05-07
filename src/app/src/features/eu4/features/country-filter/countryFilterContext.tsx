import React, { useCallback } from "react";
import { CountryMatcher, LocalizedTag } from "@/features/eu4/types/models";
import { WorkerClient, useWorkerOnSave } from "@/features/engine";

type Action =
  | {
      kind: "set-countries";
      countries: LocalizedTag[];
    }
  | {
      kind: "set-matcher";
      matcher: CountryMatcher;
    }
  | {
      kind: "exclude-tag" | "include-tag";
      tag: string;
    };
type Dispatch = (action: Action) => void;

type CountryFilterState = {
  matcher: CountryMatcher;
  countries: LocalizedTag[];
};

interface CountryFilterContextData {
  dispatch: Dispatch;
  state: CountryFilterState;
}

const CountryFilterContext = React.createContext<
  CountryFilterContextData | undefined
>(undefined);

const countryFilterReducer = (
  state: CountryFilterState,
  action: Action
): CountryFilterState => {
  switch (action.kind) {
    case "set-countries": {
      return {
        ...state,
        countries: action.countries,
      };
    }
    case "set-matcher": {
      return {
        ...state,
        matcher: action.matcher,
      };
    }
    case "exclude-tag": {
      if (state.matcher.exclude.find((x) => x === action.tag)) {
        return state;
      } else {
        return {
          ...state,
          matcher: {
            ...state.matcher,
            exclude: [...state.matcher.exclude, action.tag],
          },
        };
      }
    }
    case "include-tag": {
      if (state.matcher.include.find((x) => x === action.tag)) {
        return state;
      } else {
        return {
          ...state,
          matcher: {
            ...state.matcher,
            include: [...state.matcher.include, action.tag],
          },
        };
      }
    }
  }
};

interface CountryFilterProvider {
  initialValues: CountryMatcher;
  children: React.ReactNode;
}

export const CountryFilterProvider = ({
  initialValues,
  children,
}: CountryFilterProvider) => {
  const [state, dispatch] = React.useReducer(countryFilterReducer, {
    matcher: initialValues,
    countries: [],
  });

  const matchingCountries = useCallback(
    async (worker: WorkerClient) => {
      const countries = await worker.eu4MatchingCountries(state.matcher);

      dispatch({ kind: "set-countries", countries });
    },
    [state.matcher, dispatch]
  );
  useWorkerOnSave(matchingCountries);

  const value = { state, dispatch };
  return (
    <CountryFilterContext.Provider value={value}>
      {children}
    </CountryFilterContext.Provider>
  );
};

export const useCountryFilter = () => {
  const context = React.useContext(CountryFilterContext);
  if (context === undefined) {
    throw new Error("useUpload must be used within a UploadProvider");
  }
  return context;
};

export const useCountryFilterState = () => {
  return useCountryFilter().state;
};

export const useCountryFilterDispatch = () => {
  return useCountryFilter().dispatch;
};
