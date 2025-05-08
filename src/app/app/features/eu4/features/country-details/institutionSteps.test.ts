import { describe, it, expect } from "vitest";
import {
  calculateInstitutionSteps,
  consolidateSteps,
  InstitutionStep,
} from "./institutionSteps";
import { InstitutionCost } from "../../../../../../wasm-eu4/pkg/wasm_eu4";

// Helper to create institution cost with default values
function createInstitutionCost(
  overrides: Partial<InstitutionCost> = {},
): InstitutionCost {
  return {
    province_id: 1,
    name: "Test Province",
    mana_cost: 100,
    current_expand_infrastructure: 0,
    additional_expand_infrastructure: 0,
    current_dev: 3,
    final_dev: 10,
    current_institution_progress: 0,
    dev_cost_modifier: 0,
    dev_cost_modifier_heuristic: 0,
    exploit_at: undefined,
    ...overrides,
  };
}

describe("calculateInstitutionSteps", () => {
  it("should return empty array if institution is already present", () => {
    const province = createInstitutionCost({
      current_institution_progress: 100,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([]);
  });

  it("should handle simple development without exploit or infrastructure", () => {
    const province = createInstitutionCost({
      current_dev: 5,
      final_dev: 10,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([{ type: "develop", from: 5, to: 10 }]);
  });

  it("should handle exploitation", () => {
    const province = createInstitutionCost({
      current_dev: 5,
      final_dev: 12,
      exploit_at: 10,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "develop", from: 5, to: 10 },
      { type: "exploit", at: 10 },
      { type: "develop", from: 9, to: 12 },
    ]);
  });

  it("should handle infrastructure expansion", () => {
    const province = createInstitutionCost({
      current_dev: 10,
      final_dev: 20,
      current_expand_infrastructure: 0,
      additional_expand_infrastructure: 1,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "develop", from: 10, to: 15 },
      { type: "expand", at: 15 },
      { type: "develop", from: 15, to: 20 },
    ]);
  });

  it("should handle immediate expand", () => {
    const province = createInstitutionCost({
      current_dev: 15,
      final_dev: 20,
      current_expand_infrastructure: 0,
      additional_expand_infrastructure: 1,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "expand", at: 15, times: 1 },
      { type: "develop", from: 15, to: 20 },
    ]);
  });

  it("should handle multiple immediate expands", () => {
    const province = createInstitutionCost({
      current_dev: 30,
      final_dev: 35,
      current_expand_infrastructure: 0,
      additional_expand_infrastructure: 2,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "expand", at: 30, times: 2 },
      { type: "develop", from: 30, to: 35 },
    ]);
  });

  it("should handle multiple immediate expands at non-multiple of 15", () => {
    const province = createInstitutionCost({
      current_dev: 32,
      final_dev: 35,
      current_expand_infrastructure: 0,
      additional_expand_infrastructure: 2,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "expand", at: 32, times: 2 },
      { type: "develop", from: 32, to: 35 },
    ]);
  });

  it("should handle combination of exploit and infrastructure expansion", () => {
    const province = createInstitutionCost({
      current_dev: 5,
      final_dev: 20,
      exploit_at: 15,
      current_expand_infrastructure: 0,
      additional_expand_infrastructure: 1,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "develop", from: 5, to: 15 },
      { type: "expand", at: 15 },
      { type: "exploit", at: 15 },
      { type: "develop", from: 14, to: 20 },
    ]);
  });

  it("should handle expansion before and after exploit", () => {
    const province = createInstitutionCost({
      current_dev: 5,
      final_dev: 30,
      exploit_at: 15,
      current_expand_infrastructure: 0,
      additional_expand_infrastructure: 2,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "develop", from: 5, to: 15 },
      { type: "expand", at: 15 },
      { type: "exploit", at: 15 },
      { type: "develop", from: 14, to: 30 },
      { type: "expand", at: 30 },
    ]);
  });

  it("should handle complex case with multiple expansions and development phases", () => {
    const province = createInstitutionCost({
      current_dev: 12,
      final_dev: 50,
      exploit_at: 30,
      current_expand_infrastructure: 0,
      additional_expand_infrastructure: 3,
    });

    const steps = calculateInstitutionSteps(province);

    expect(steps).toEqual([
      { type: "develop", from: 12, to: 15 },
      { type: "expand", at: 15 },
      { type: "develop", from: 15, to: 30 },
      { type: "expand", at: 30 },
      { type: "exploit", at: 30 },
      { type: "develop", from: 29, to: 45 },
      { type: "expand", at: 45 },
      { type: "develop", from: 45, to: 50 },
    ]);
  });
});

describe("consolidateSteps", () => {
  it("should return empty array for empty steps", () => {
    const result = consolidateSteps([]);
    expect(result).toEqual([]);
  });

  it("should return single step with empty followedBy if no expand/exploit follows", () => {
    const steps = [
      { type: "develop", from: 5, to: 10 },
    ] satisfies InstitutionStep[];
    const expected = [{ type: "develop", from: 5, to: 10, followedBy: [] }];
    const result = consolidateSteps(steps);
    expect(result).toEqual(expected);
  });

  it("should consolidate a develop step followed by expand", () => {
    const steps = [
      { type: "develop", from: 5, to: 15 },
      { type: "expand", at: 15 },
    ] satisfies InstitutionStep[];
    const expected = [
      {
        type: "develop",
        from: 5,
        to: 15,
        followedBy: [{ type: "expand", at: 15 }],
      },
    ];
    const result = consolidateSteps(steps);
    expect(result).toEqual(expected);
  });

  it("should consolidate a develop step followed by expand and exploit", () => {
    const steps = [
      { type: "develop", from: 5, to: 15 },
      { type: "expand", at: 15 },
      { type: "exploit", at: 15 },
    ] satisfies InstitutionStep[];
    const expected = [
      {
        type: "develop",
        from: 5,
        to: 15,
        followedBy: [
          { type: "expand", at: 15 },
          { type: "exploit", at: 15 },
        ],
      },
    ];
    const result = consolidateSteps(steps);
    expect(result).toEqual(expected);
  });

  it("should handle complex case with multiple develop steps", () => {
    const steps = [
      { type: "develop", from: 12, to: 15 },
      { type: "expand", at: 15 },
      { type: "develop", from: 15, to: 30 },
      { type: "expand", at: 30 },
      { type: "exploit", at: 30 },
      { type: "develop", from: 29, to: 45 },
    ] satisfies InstitutionStep[];
    const expected = [
      {
        type: "develop",
        from: 12,
        to: 15,
        followedBy: [{ type: "expand", at: 15 }],
      },
      {
        type: "develop",
        from: 15,
        to: 30,
        followedBy: [
          { type: "expand", at: 30 },
          { type: "exploit", at: 30 },
        ],
      },
      { type: "develop", from: 29, to: 45, followedBy: [] },
    ];
    const result = consolidateSteps(steps);
    expect(result).toEqual(expected);
  });

  it("should handle immediate expand steps", () => {
    const steps = [
      { type: "expand", at: 15, times: 1 },
      { type: "develop", from: 15, to: 20 },
    ] satisfies InstitutionStep[];
    const expected = [
      {
        type: "develop",
        from: 15,
        to: 15,
        followedBy: [{ type: "expand", at: 15, times: 1 }],
      },
      { type: "develop", from: 15, to: 20, followedBy: [] },
    ];
    const result = consolidateSteps(steps);
    expect(result).toEqual(expected);
  });

  it("should handle consecutive expand/exploit steps", () => {
    const steps = [
      { type: "expand", at: 15 },
      { type: "expand", at: 15 },
      { type: "exploit", at: 15 },
      { type: "develop", from: 14, to: 20 },
    ] satisfies InstitutionStep[];
    const expected = [
      {
        type: "develop",
        from: 15,
        to: 15,
        followedBy: [
          { type: "expand", at: 15 },
          { type: "expand", at: 15 },
          { type: "exploit", at: 15 },
        ],
      },
      { type: "develop", from: 14, to: 20, followedBy: [] },
    ];
    const result = consolidateSteps(steps);
    expect(result).toEqual(expected);
  });

  it("should handle expand, exploit, develop, expand, develop sequence", () => {
    const steps = [
      { type: "expand", at: 25, times: 1 },
      { type: "exploit", at: 25 },
      { type: "develop", from: 24, to: 30 },
      { type: "expand", at: 30 },
      { type: "develop", from: 30, to: 42 },
    ] satisfies InstitutionStep[];

    const expected = [
      {
        type: "develop",
        from: 25,
        to: 25,
        followedBy: [
          { type: "expand", at: 25, times: 1 },
          { type: "exploit", at: 25 },
        ],
      },
      {
        type: "develop",
        from: 24,
        to: 30,
        followedBy: [{ type: "expand", at: 30 }],
      },
      { type: "develop", from: 30, to: 42, followedBy: [] },
    ];

    const result = consolidateSteps(steps);
    expect(result).toEqual(expected);
  });
});
