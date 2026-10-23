import { expectTypeOf, it } from "vitest";
import type {
  Eu4AnalysisStore,
  Eu4Answer,
  Eu4Detail,
  Eu4Query,
  parse_analysis,
  ProvinceId,
} from "@/wasm/wasm_eu4";
import type {
  Eu5AnalysisStore,
  Eu5Answer,
  Eu5App,
  Eu5Detail,
  Eu5Query,
  ImportLoader,
} from "@/wasm/wasm_eu5";
import type {
  Eu4Snapshot,
  Eu4SnapshotData,
  Eu4SnapshotDescriptor,
} from "@/features/eu4/analysis/analysisTypes";
import type {
  Eu5Snapshot,
  Eu5SnapshotData,
  Eu5SnapshotDescriptor,
} from "@/features/eu5/history/analysisTypes";
import type { SnapshotDescriptor } from "./descriptor";
import type { AnalysisStore, SnapshotOf, TypesOf } from "./session";

// The type check runs these. Rust generates each type, so this finds a
// shared type that no longer agrees with a game store.
it("gives each store and parser the types of its own game", () => {
  expectTypeOf<TypesOf<Eu4AnalysisStore>>().toEqualTypeOf<{
    descriptor: Eu4SnapshotDescriptor;
    data: Eu4SnapshotData;
    query: Eu4Query;
    answer: Eu4Answer;
  }>();
  expectTypeOf<Eu4AnalysisStore>().toExtend<AnalysisStore<TypesOf<Eu4AnalysisStore>>>();
  expectTypeOf<Eu4SnapshotDescriptor>().toEqualTypeOf<SnapshotDescriptor & Eu4Detail>();
  expectTypeOf<SnapshotOf<Eu4AnalysisStore>>().toEqualTypeOf<Eu4Snapshot>();
  expectTypeOf<ReturnType<typeof parse_analysis>>().toEqualTypeOf<Eu4Snapshot>();
  expectTypeOf<Extract<Eu4Query, { kind: "provinceDevelopment" }>["provinceIds"]>().toEqualTypeOf<
    ProvinceId[]
  >();

  expectTypeOf<TypesOf<Eu5AnalysisStore>>().toEqualTypeOf<{
    descriptor: Eu5SnapshotDescriptor;
    data: Eu5SnapshotData;
    query: Eu5Query;
    answer: Eu5Answer;
  }>();
  expectTypeOf<Eu5AnalysisStore>().toExtend<AnalysisStore<TypesOf<Eu5AnalysisStore>>>();
  expectTypeOf<Eu5SnapshotDescriptor>().toEqualTypeOf<SnapshotDescriptor & Eu5Detail>();
  expectTypeOf<SnapshotOf<Eu5AnalysisStore>>().toEqualTypeOf<Eu5Snapshot>();
  expectTypeOf<Extract<Eu5Query, { kind: "locationPopulation" }>["locationIds"]>().toEqualTypeOf<
    number[]
  >();
  expectTypeOf<ReturnType<ImportLoader["parse_import"]>>().toEqualTypeOf<Eu5Snapshot>();
  expectTypeOf<Parameters<Eu5App["paint_map_projection"]>[1]>().toEqualTypeOf<Eu5SnapshotData>();

  // The binary form of one game does not fit the store of the other.
  expectTypeOf<Eu4SnapshotData>().not.toExtend<Eu5SnapshotData>();
  expectTypeOf<Eu5SnapshotData>().not.toExtend<Eu4SnapshotData>();
});
