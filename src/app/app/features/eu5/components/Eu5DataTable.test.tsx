import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Eu5DataTable } from "./Eu5DataTable";

const location = { key: 4, name: "Paris" };
const rows = [
  {
    location,
    building: { key: "farm" },
    foreignOwner: { tag: "FRA", country: { key: 1 } },
    value: 10,
  },
  {
    location,
    building: { key: "port" },
    foreignOwner: { tag: "FRA", country: { key: 1 } },
    value: 20,
  },
  {
    location,
    building: { key: "farm" },
    foreignOwner: { tag: "ENG", country: { key: 2 } },
    value: 30,
  },
];
function keys(data: typeof rows) {
  const html = renderToStaticMarkup(
    <Eu5DataTable data={data} columns={[{ accessorKey: "value" }]} />,
  );
  return [...html.matchAll(/data-row-key="([^"]+)"/g)].map((match) => match[1]);
}

it("keeps foreign building rows distinct when they share a location", () => {
  const ids = keys(rows);
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);
  expect(keys([...rows].reverse())).toEqual([...ids].reverse());
});

it("uses canonical location keys rather than potentially repeated display names", () => {
  const ids = keys([rows[0], { ...rows[0], location: { key: 5, name: "Paris" } }]);
  expect(ids[0]).not.toBe(ids[1]);
  expect(keys([{ ...rows[0], value: 99 }])[0]).toBe(ids[0]);
});
