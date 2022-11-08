import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { appApi } from "@/services/appApi";
import {
  useSelector,
  useDispatch,
  type TypedUseSelectorHook,
} from "react-redux";
import { reducer as sessionReducer } from "@/features/account";
import { reducer as toasterReducer } from "@/features/notifications";
import { reducer as engineReducer } from "@/features/engine";
import { reducer as eu4Reducer } from "@/features/eu4/eu4Slice";
import { reducer as ck3Reducer } from "@/features/ck3/ck3Slice";
import { reducer as hoi4Reducer } from "@/features/hoi4/hoi4Slice";
import { reducer as vic3Reducer } from "@/features/vic3/vic3Slice";
import { reducer as imperatorReducer } from "@/features/imperator/imperatorSlice";
import { reducer as uiControlsReducer } from "@/features/ui-controls";
import { rtkQueryErrorLogger } from "./apiErrorMiddleware";

const rootReducer = combineReducers({
  session: sessionReducer,
  toaster: toasterReducer,
  engine: engineReducer,
  eu4: eu4Reducer,
  ck3: ck3Reducer,
  hoi4: hoi4Reducer,
  vic3: vic3Reducer,
  imperator: imperatorReducer,
  uiControls: uiControlsReducer,
  [appApi.reducerPath]: appApi.reducer,
});

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(appApi.middleware)
      .concat(rtkQueryErrorLogger),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;

export { store };
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
