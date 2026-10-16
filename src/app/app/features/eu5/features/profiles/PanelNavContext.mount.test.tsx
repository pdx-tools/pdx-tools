import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { useHistory } from "../../history/store";
import { PanelNavProvider, usePanelNav } from "./PanelNavContext";

vi.mock("../../store", () => ({ useEu5SelectionRevision: () => 0 }));
beforeEach(() => useHistory.setState({ viewedProfiles: [], remapRevision: 0 }));

function Breadcrumbs() {
  const nav = usePanelNav();
  return (
    <ol>
      {nav.stack.map((entry) => (
        <li key={`${entry.kind}/${entry.label}`}>
          {entry.kind}: {entry.label}
        </li>
      ))}
    </ol>
  );
}
const render = () =>
  renderToStaticMarkup(
    <PanelNavProvider>
      <Breadcrumbs />
    </PanelNavProvider>,
  );

it("initializes a destination route from the profiles restored by its save session", () => {
  useHistory.getState().remapViewedProfiles([
    { kind: "country", country: { key: 17, name: "France" } },
    { kind: "market", market: { key: 20, name: "Paris market" } },
    { kind: "location", location: { key: 21, name: "Paris" } },
  ]);
  expect(render()).toBe(
    "<ol><li>profile: France</li><li>profile: Paris market</li><li>focus: Paris</li></ol>",
  );
  expect(useHistory.getState().viewedProfiles).toHaveLength(3);
});

it("starts with no breadcrumbs after another campaign clears the restored identities", () => {
  useHistory
    .getState()
    .setViewedProfiles([{ kind: "country", country: { key: 17, name: "France" } }]);
  useHistory.getState().remapViewedProfiles([]);
  expect(render()).toBe("<ol></ol>");
});
