import { StringTable } from "./stringTable";
import type { OverviewData } from "@/wasm/wasm_eu5";

type Column =
  | {
      kind: "number";
      values: Float64Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
      presence?: Uint8Array<ArrayBuffer>;
    }
  | { kind: "string"; values: Uint32Array<ArrayBuffer> }
  | { kind: "boolean"; values: Uint8Array<ArrayBuffer> }
  | { kind: "object"; fields: Record<string, Column>; presence?: Uint8Array<ArrayBuffer> }
  | {
      kind: "array";
      offsets: Uint32Array<ArrayBuffer>;
      items: Column;
      presence?: Uint8Array<ArrayBuffer>;
    }
  | { kind: "reference"; values: Uint32Array<ArrayBuffer>; presence?: Uint8Array<ArrayBuffer> }
  | { kind: "concentration"; values: Float64Array<ArrayBuffer> }
  | { kind: "empty" };
export type PackedOverviews = { strings: string[]; root: Column; references: Column };
const absent = 0xffffffff,
  nil = 0xfffffffe;

/** Transpose nested overview rows into lossless columns. No per-row objects survive import. */
export function packOverviews(overviews: OverviewData): PackedOverviews {
  const strings = new StringTable();
  const referenceRows: unknown[] = [],
    referenceIds = new Map<string, number>();
  const column = (values: unknown[], key = "", allowReferences = true): Column => {
    const sample = values.find((value) => value != null);
    if (sample === undefined)
      return {
        kind: "boolean",
        values: Uint8Array.from(values, (value) => (value === null ? 3 : 2)),
      };
    const flags = values.some((value) => value == null)
      ? Uint8Array.from(values, (value) => (value === null ? 2 : value === undefined ? 0 : 1))
      : undefined;
    if (typeof sample === "number")
      return {
        kind: "number",
        values: values.every(
          (value) =>
            value == null ||
            (typeof value === "number" &&
              Number.isInteger(value) &&
              value >= 0 &&
              value <= 0xffffffff &&
              !Object.is(value, -0)),
        )
          ? Uint32Array.from(values, (value) => (typeof value === "number" ? value : 0))
          : Float64Array.from(values, (value) => (typeof value === "number" ? value : 0)),
        presence: flags,
      };
    if (typeof sample === "string")
      return {
        kind: "string",
        values: Uint32Array.from(values, (value) =>
          value === undefined ? absent : value === null ? nil : strings.intern(String(value)),
        ),
      };
    if (typeof sample === "boolean")
      return {
        kind: "boolean",
        values: Uint8Array.from(values, (value) =>
          value === undefined ? 2 : value === null ? 3 : value ? 1 : 0,
        ),
      };
    if (Array.isArray(sample)) {
      // The two concentration curves are reconstructible from their exact sorted values.
      if (key === "concentration" && values.length === 1)
        return { kind: "concentration", values: Float64Array.from(sample, (point) => point.value) };
      const offsets = new Uint32Array(values.length + 1),
        items: unknown[] = [];
      values.forEach((value, index) => {
        if (Array.isArray(value)) for (const item of value) items.push(item);
        offsets[index + 1] = items.length;
      });
      return { kind: "array", offsets, items: column(items, "", allowReferences), presence: flags };
    }
    const referenceKey = (value: unknown): string | undefined => {
      if (!value || typeof value !== "object") return undefined;
      const row = value as {
        country?: { key?: unknown };
        market?: { key?: unknown };
        key?: unknown;
        name?: unknown;
        colorHex?: unknown;
      };
      if (typeof row.country?.key === "number") return `country:${row.country.key}`;
      if (typeof row.market?.key === "number") return `market:${row.market.key}`;
      if (
        typeof row.key === "string" &&
        typeof row.name === "string" &&
        Object.keys(row).every((name) => ["key", "name", "colorHex"].includes(name))
      )
        return `label:${JSON.stringify([row.key, row.name, typeof row.colorHex, row.colorHex])}`;
      return undefined;
    };
    if (allowReferences && referenceKey(sample) !== undefined) {
      return {
        kind: "reference",
        values: Uint32Array.from(values, (value) => {
          if (value == null) return 0;
          const id = referenceKey(value)!;
          let index = referenceIds.get(id);
          if (index === undefined) {
            index = referenceRows.length;
            referenceRows.push(value);
            referenceIds.set(id, index);
          }
          return index;
        }),
        presence: flags,
      };
    }
    if (typeof sample === "object") {
      const keys = new Set<string>();
      for (const value of values)
        if (value && typeof value === "object")
          for (const name of Object.keys(value)) keys.add(name);
      const fields: Record<string, Column> = {};
      for (const name of keys)
        fields[name] = column(
          values.map((value) =>
            value == null ? undefined : (value as Record<string, unknown>)[name],
          ),
          name,
          allowReferences,
        );
      return { kind: "object", fields, presence: flags };
    }
    throw Error("Unsupported analytical overview value");
  };
  const root = column([overviews]);
  return { strings: strings.values, root, references: column(referenceRows, "", false) };
}
function valueAt(node: Column, index: number, strings: string[], references?: Column): unknown {
  if ("presence" in node && node.presence && node.presence[index] !== 1)
    return node.presence[index] === 2 ? null : undefined;
  switch (node.kind) {
    case "reference":
      if (!references) throw Error("Missing overview reference table");
      return valueAt(references, node.values[index], strings);
    case "number":
      return node.values[index];
    case "string":
      return node.values[index] === absent
        ? undefined
        : node.values[index] === nil
          ? null
          : strings[node.values[index]];
    case "boolean":
      return node.values[index] === 2
        ? undefined
        : node.values[index] === 3
          ? null
          : node.values[index] === 1;
    case "object":
      return Object.fromEntries(
        Object.entries(node.fields).map(([name, child]) => [
          name,
          valueAt(child, index, strings, references),
        ]),
      );
    case "array":
      return Array.from({ length: node.offsets[index + 1] - node.offsets[index] }, (_, i) =>
        valueAt(node.items, node.offsets[index] + i, strings, references),
      );
    case "concentration": {
      const total = node.values.reduce((sum, value) => sum + value, 0);
      let cumulativeValue = 0;
      return Array.from(node.values, (value, i) => {
        cumulativeValue += value;
        return {
          locationRank: i + 1,
          locationCount: node.values.length,
          value,
          cumulativeValue,
          share: total > 0 ? cumulativeValue / total : 0,
        };
      });
    }
    case "empty":
      return undefined;
  }
}
export function overview<K extends keyof OverviewData>(
  packed: PackedOverviews,
  key: K,
): OverviewData[K] {
  if (packed.root.kind !== "object" || !(key in packed.root.fields))
    throw Error("Overview is not available");
  return valueAt(packed.root.fields[key], 0, packed.strings, packed.references) as OverviewData[K];
}
export { analyticalBuffers } from "./transferBuffers";
