import { expectTypeOf, it } from "vitest";
import type {
  Eu4AnalysisStore,
  Eu4Answer,
  Eu4Query,
  Eu4Snapshot,
  Eu4SnapshotDescriptor,
  QueryReply,
  SnapshotData,
  parse_analysis,
} from "@/wasm/wasm_eu4";
import type {
  Eu5AnalysisStore,
  Eu5Answer,
  Eu5Query,
  Eu5Snapshot,
  Eu5SnapshotDescriptor,
  Eu5App,
  ImportLoader,
} from "@/wasm/wasm_eu5";
import type { DescriptorOf, QueryOf, SnapshotOf } from "./session";

// The type check runs these. Each `wasm_store!` call names its TypeScript
// types in strings, so this finds a string that names another game.
it("gives each store and parser the types of its own game", () => {
  expectTypeOf<Parameters<Eu4AnalysisStore["append"]>[1]>().toEqualTypeOf<SnapshotData<"eu4">>();
  expectTypeOf<DescriptorOf<Eu4AnalysisStore>>().toEqualTypeOf<Eu4SnapshotDescriptor>();
  expectTypeOf<SnapshotOf<Eu4AnalysisStore>>().toEqualTypeOf<Eu4Snapshot>();
  expectTypeOf<QueryOf<Eu4AnalysisStore>>().toEqualTypeOf<Eu4Query>();
  expectTypeOf<ReturnType<Eu4AnalysisStore["query"]>>().toEqualTypeOf<QueryReply<Eu4Answer>>();
  expectTypeOf<ReturnType<typeof parse_analysis>>().toEqualTypeOf<Eu4Snapshot>();
  expectTypeOf<Eu4Snapshot["data"]>().toEqualTypeOf<SnapshotData<"eu4">>();
  expectTypeOf<Eu4SnapshotDescriptor["game"]>().toEqualTypeOf<"eu4">();

  expectTypeOf<Parameters<Eu5AnalysisStore["append"]>[1]>().toEqualTypeOf<SnapshotData<"eu5">>();
  expectTypeOf<DescriptorOf<Eu5AnalysisStore>>().toEqualTypeOf<Eu5SnapshotDescriptor>();
  expectTypeOf<SnapshotOf<Eu5AnalysisStore>>().toEqualTypeOf<Eu5Snapshot>();
  expectTypeOf<QueryOf<Eu5AnalysisStore>>().toEqualTypeOf<Eu5Query>();
  expectTypeOf<ReturnType<Eu5AnalysisStore["query"]>>().toEqualTypeOf<QueryReply<Eu5Answer>>();
  expectTypeOf<ReturnType<ImportLoader["parse_import"]>>().toEqualTypeOf<Eu5Snapshot>();
  expectTypeOf<Parameters<Eu5App["paint_map_projection"]>[1]>().toEqualTypeOf<
    SnapshotData<"eu5">
  >();
  expectTypeOf<Eu5Snapshot["data"]>().toEqualTypeOf<SnapshotData<"eu5">>();
  expectTypeOf<Eu5SnapshotDescriptor["game"]>().toEqualTypeOf<"eu5">();
});
