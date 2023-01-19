import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  Achievements,
  CountryMatcher,
  EnhancedCountryInfo,
  EnhancedMeta,
  MapDate,
} from "./types/models";
import { MapControls, MapOnlyControls, MapPayload } from "./types/map";
import { RootState, useAppSelector } from "@/lib/store";
import { SaveFile } from "@/services/appApi";

interface EndEu4AnalyzePayload {
  date: string;
  defaultSelectedCountry: string;
  meta: EnhancedMeta;
  achievements: Achievements;
  countries: EnhancedCountryInfo[];
  mapPosition: [number, number];
}

interface Eu4State {
  countryFilter: CountryMatcher;
  mapDate: MapDate;
  meta: EnhancedMeta | undefined;
  achievements: Achievements | undefined;
  serverSaveFile: SaveFile | undefined;
  countries: EnhancedCountryInfo[];
  mapPosition: [number, number];
  mapControls: MapControls;
  selectedTag: string;
}

export const initialEu4CountryFilter: CountryMatcher = {
  players: "all",
  ai: "alive",
  subcontinents: [],
  include: [],
  exclude: [],
  includeSubjects: false,
};

const initialState: Eu4State = {
  countryFilter: initialEu4CountryFilter,
  mapDate: {
    text: "1444-11-11",
    days: 0,
  },
  meta: undefined,
  achievements: undefined,
  serverSaveFile: undefined,
  mapControls: {
    mode: "political",
    onlyPlayers: false,
    borderFill: "Countries",
    includeSubjects: false,
    paintSubjectInOverlordHue: false,
    showController: true,
    showProvinceBorders: true,
    showCountryBorders: true,
    showMapModeBorders: false,
    showTerrain: false,
  },
  countries: [],
  mapPosition: [0, 0],
  selectedTag: "FRA",
};

const eu4Slice = createSlice({
  name: "eu4",
  initialState: initialState,
  reducers: {
    setEu4ServerSaveFile(state, action: PayloadAction<SaveFile | undefined>) {
      state.serverSaveFile = action.payload;
    },

    endEu4Analyze(state, action: PayloadAction<EndEu4AnalyzePayload>) {
      state.selectedTag = action.payload.defaultSelectedCountry;
      state.mapDate = {
        text: action.payload.date,
        days: action.payload.meta.total_days,
      };
      state.meta = action.payload.meta;
      state.achievements = action.payload.achievements;
      state.countries = action.payload.countries;
      state.mapPosition = action.payload.mapPosition;
    },

    setEu4SelectedTag(state, action: PayloadAction<string>) {
      state.selectedTag = action.payload;
    },
    setEu4MapMode(state, action: PayloadAction<MapPayload["kind"]>) {
      state.mapControls.mode = action.payload;
    },
    setEu4CountryFilter(state, action: PayloadAction<CountryMatcher>) {
      state.countryFilter = action.payload;
    },
    togglePaintSubjectInOverlordHue(
      state,
      action: PayloadAction<boolean | undefined>
    ) {
      state.mapControls.paintSubjectInOverlordHue =
        action.payload ?? !state.mapControls.paintSubjectInOverlordHue;
    },
    toggleShowController(state, action: PayloadAction<boolean | undefined>) {
      state.mapControls.showController =
        action.payload ?? !state.mapControls.showController;
    },
    toggleShowTerrain(state, action: PayloadAction<boolean | undefined>) {
      state.mapControls.showTerrain =
        action.payload ?? !state.mapControls.showTerrain;
    },
    toggleShowProvinceBorders(
      state,
      action: PayloadAction<boolean | undefined>
    ) {
      state.mapControls.showProvinceBorders =
        action.payload ?? !state.mapControls.showProvinceBorders;
    },
    toggleShowCountryBorders(
      state,
      action: PayloadAction<boolean | undefined>
    ) {
      state.mapControls.showCountryBorders =
        action.payload ?? !state.mapControls.showCountryBorders;
    },
    toggleShowMapModeBorders(
      state,
      action: PayloadAction<boolean | undefined>
    ) {
      state.mapControls.showMapModeBorders =
        action.payload ?? !state.mapControls.showMapModeBorders;
    },
    setMapControls(state, action: PayloadAction<MapControls>) {
      state.mapControls = action.payload;
    },
    setMapDate(state, action: PayloadAction<MapDate>) {
      state.mapDate.days = action.payload.days;
      state.mapDate.text = action.payload.text;
    },
  },
});

export const selectEu4CountryNameLookup = createSelector(
  (state: RootState) => state.eu4.countries,
  (countries) => new Map(countries.map((x) => [x.normalizedName, x]))
);

export const selectEu4CountryFilter = (state: RootState) =>
  state.eu4.countryFilter;
export const selectEu4MapDate = (state: RootState) => state.eu4.mapDate;
export const selectEu4SelectedTag = (state: RootState) => state.eu4.selectedTag;

export const selectEu4CountryBordersDisabled = (state: RootState) => {
  return (
    (state.eu4.mapControls.mode == "political" ||
      state.eu4.mapControls.mode == "religion") &&
    state.eu4.mapDate.days != state.eu4.meta?.total_days
  );
};

export const selectEu4MapDecorativeSettings = createSelector(
  selectEu4CountryBordersDisabled,
  (state: RootState) => state.eu4.mapControls,
  (bordersDisabled, mapControls): MapOnlyControls => ({
    showCountryBorders: !bordersDisabled && mapControls.showCountryBorders,
    showProvinceBorders: mapControls.showProvinceBorders,
    showMapModeBorders: mapControls.showMapModeBorders,
    showTerrain: mapControls.showTerrain,
  })
);

export const selectEu4MapColorPayload = createSelector(
  (state: RootState) => state.eu4.mapControls.mode,
  (state: RootState) => state.eu4.countryFilter,
  (state: RootState) => state.eu4.mapDate.days,
  (state: RootState) => state.eu4.mapControls,
  (state: RootState) => state.eu4.meta,
  (mode, countryFilter, days, mapControls, meta): MapPayload => ({
    kind: mode,
    tagFilter: countryFilter,
    date: days == meta?.total_days ? null : days,
    showSecondaryColor: mapControls.showController,
    paintSubjectInOverlordHue: mapControls.paintSubjectInOverlordHue,
  })
);

export const selectEu4HumanCountries = createSelector(
  (state: RootState) => state.eu4.countries,
  (countries) => {
    const result = countries.filter((x) => x.is_human) || [];
    result.sort((a, b) => a.tag.localeCompare(b.tag));
    return result;
  }
);

export const selectEu4AliveAICountries = createSelector(
  (state: RootState) => state.eu4.countries,
  (countries) => {
    const result = countries.filter((x) => !x.is_human && x.is_alive) || [];
    result.sort((a, b) => a.tag.localeCompare(b.tag));
    return result;
  }
);

export const selectEu4AICountries = createSelector(
  (state: RootState) => state.eu4.countries,
  (countries) => {
    const result = countries.filter((x) => !x.is_human) || [];
    result.sort((a, b) => a.tag.localeCompare(b.tag));
    return result;
  }
);

export function useEu4Meta() {
  const meta = useAppSelector((state) => state.eu4.meta);
  if (!meta) {
    throw new Error("eu4 save meta must be defined");
  }

  return meta;
}

export function useEu4Achievements() {
  const achievements = useAppSelector((state) => state.eu4.achievements);
  if (!achievements) {
    throw new Error("eu4 save achievements must be defined");
  }

  return achievements;
}

export function useEu4ModList() {
  const meta = useEu4Meta();

  return meta.mod_enabled.length > 0
    ? meta.mod_enabled
    : meta.mods_enabled_names.map((x) => x.name);
}

export const selectEu4MapMode = (state: RootState): string =>
  state.eu4.mapControls.mode;

export const {
  endEu4Analyze,
  setEu4CountryFilter,
  setEu4MapMode,
  setEu4SelectedTag,
  setEu4ServerSaveFile,
  setMapDate,
  setMapControls,
  togglePaintSubjectInOverlordHue,
  toggleShowController,
  toggleShowTerrain,
  toggleShowProvinceBorders,
  toggleShowMapModeBorders,
  toggleShowCountryBorders,
} = eu4Slice.actions;

export const { reducer } = eu4Slice;
