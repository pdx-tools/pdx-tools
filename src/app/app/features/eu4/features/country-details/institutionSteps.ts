import { InstitutionCost } from "../../../../../../wasm-eu4/pkg/wasm_eu4";

export type InstitutionStep =
  | { type: "develop"; from: number; to: number }
  | { type: "expand"; at: number; times?: number }
  | { type: "exploit"; at: number };

/**
 * Calculate the development steps needed to optimally get an institution
 */
export function calculateInstitutionSteps({
  current_dev,
  final_dev,
  exploit_at,
  additional_expand_infrastructure,
  current_expand_infrastructure,
  current_institution_progress,
}: InstitutionCost): InstitutionStep[] {
  // If province already has institution, no steps needed
  if (current_institution_progress >= 100) {
    return [];
  }

  // Calculate expansion points
  const expandPoints = Array.from(
    { length: additional_expand_infrastructure },
    (_, i) => 15 * (current_expand_infrastructure + i + 1),
  );

  const steps: InstitutionStep[] = [];
  let currentDevTracker = current_dev;

  // Handle immediate expansions - consolidate into a single step with times count
  const immediateExpands = expandPoints.filter((p) => p <= currentDevTracker);
  if (immediateExpands.length > 0) {
    steps.push({
      type: "expand",
      at: current_dev,
      times: immediateExpands.length,
    });
  }

  // Create steps in sequential order
  if (exploit_at !== undefined) {
    // Dev points between current and exploit
    const devsBeforeExpand = expandPoints
      .filter((p) => p > currentDevTracker && p <= exploit_at)
      .filter((p) => !immediateExpands.includes(p));

    // For each expansion point before the exploit point
    for (const expandPoint of devsBeforeExpand) {
      if (currentDevTracker < expandPoint) {
        // Add dev step up to expansion point
        steps.push({
          type: "develop",
          from: currentDevTracker,
          to: expandPoint,
        });
        currentDevTracker = expandPoint;
      }

      // Add expansion step
      steps.push({
        type: "expand",
        at: expandPoint,
      });
    }

    // Dev to exploit point if needed
    if (currentDevTracker < exploit_at) {
      steps.push({
        type: "develop",
        from: currentDevTracker,
        to: exploit_at,
      });
      currentDevTracker = exploit_at;
    }

    // Exploit step
    steps.push({
      type: "exploit",
      at: exploit_at,
    });
    currentDevTracker -= 1; // Account for exploitation
  }

  // Handle development after exploit
  const remainingExpands = expandPoints
    .filter((p) => p > (exploit_at ?? -1) && p <= final_dev)
    .filter((p) => !immediateExpands.includes(p));

  // For each expansion point after exploit
  for (const expandPoint of remainingExpands) {
    if (currentDevTracker < expandPoint) {
      // Add dev step up to expansion point
      steps.push({
        type: "develop",
        from: currentDevTracker,
        to: expandPoint,
      });
      currentDevTracker = expandPoint;
    }

    // Add expansion step
    steps.push({
      type: "expand",
      at: expandPoint,
    });
  }

  // Final development if needed
  if (currentDevTracker < final_dev) {
    steps.push({
      type: "develop",
      from: currentDevTracker,
      to: final_dev,
    });
  }

  return steps;
}

export type ConsolidatedInstitutionStep = InstitutionStep & {
  followedBy: InstitutionStep[];
};

/**
 * Consolidate steps into a more concentrated format, as one often "devs to" a
 * point and then expands / exploits the province, so we group them together as
 * a form of tag system when developing.
 */
export function consolidateSteps(
  steps: InstitutionStep[],
): ConsolidatedInstitutionStep[] {
  const result = [];
  let stepIdx = 0;
  while (stepIdx < steps.length) {
    const currentStep = steps[stepIdx];
    const followedBy = [];
    stepIdx++;
    while (
      steps[stepIdx]?.type === "expand" ||
      steps[stepIdx]?.type === "exploit"
    ) {
      followedBy.push(steps[stepIdx]);
      stepIdx++;
    }
    result.push({
      ...currentStep,
      followedBy,
    });
  }
  return result;
}
