import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { rakalyApi } from "@/services/rakalyApi";
import { createSelectorHook, useDispatch } from "react-redux";
import { reducer as sessionReducer } from "@/features/account";
import { reducer as toasterReducer } from "@/features/notifications";
import { reducer as engineReducer } from "@/features/engine";
import { reducer as eu4Reducer } from "@/features/eu4/eu4Slice";
import { reducer as ck3Reducer } from "@/features/ck3/ck3Slice";
import { reducer as hoi4Reducer } from "@/features/hoi4/hoi4Slice";
import { reducer as imperatorReducer } from "@/features/imperator/imperatorSlice";
import { rtkQueryErrorLogger } from "./apiErrorMiddleware";

const rootReducer = combineReducers({
  session: sessionReducer,
  toaster: toasterReducer,
  engine: engineReducer,
  eu4: eu4Reducer,
  ck3: ck3Reducer,
  hoi4: hoi4Reducer,
  imperator: imperatorReducer,
  [rakalyApi.reducerPath]: rakalyApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;
const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(rakalyApi.middleware)
      .concat(rtkQueryErrorLogger),
});

setupListeners(store.dispatch);

export { store };
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = createSelectorHook<RootState>();
