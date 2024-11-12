import { CountryExpenseLedger, CountryIncomeLedger } from "../../types/models";

function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

function sumValues(...obj: { [key: string]: any }[]): number {
  return obj.reduce(
    (acc, x) => acc + Object.values(x).reduce((sum, value) => sum + value, 0),
    0,
  );
}

type Income = ReturnType<typeof incomeBudget>;
export function incomeBudget(income: CountryIncomeLedger) {
  return {
    "Core Income": pick(income, ["taxation", "production", "trade", "gold"]),
    "Subject Income": pick(income, [
      "siphoning_income",
      "tariffs",
      "treasure_fleet",
      "vassals",
    ]),
    "Diplomatic Income": pick(income, [
      "condottieri",
      "harbor_fees",
      "knowledge_sharing",
      "subsidies",
      "war_reparations",
    ]),
    "One-time Income": pick(income, [
      "blockading_foreign_ports",
      "events",
      "gifts",
      "looting_foreign_cities",
      "spoils_of_war",
      "other",
    ]),
  };
}

type Expenses = ReturnType<typeof expenseBudget>;
export function expenseBudget(expenses: CountryExpenseLedger) {
  return {
    Maintenance: {
      Army: expenses.army_maintenance,
      Fleet: expenses.fleet_maintenance,
      Advisor: expenses.advisor_maintenance,
      Colonist: expenses.colonists,
      Missionary: expenses.missionaries,
      Fort: expenses.fort_maintenance,
      State: expenses.state_maintenance,
      "Root out Corruption": expenses.root_out_corruption,
    },

    "Interest Payments": {
      Interest: expenses.interest,
    },

    "Diplomatic Expenses": {
      Condottieri: expenses.condottieri,
      "Knowledge Sharing": expenses.knowledge_sharing,
      Subsidies: expenses.subsidies,
      Tariffs: expenses.tariffs,
      "Vassal Fee": expenses.vassal_fee,
      "War Reparations": expenses.war_reparations,
    },

    "One-time Expenses": {
      "Cities Looted": expenses.cities_looted,
      "Colony Changes": expenses.colony_changes,
      Events: expenses.events,
      Gifts: expenses.gifts,
      Peace: expenses.peace,
      Other: expenses.other,
      "Ports Blockaded": expenses.ports_blockaded,
      // "Repaid Loans": expenses.repaid_loans, // Not really an expense
      "Support Loyalists": expenses.support_loyalists,
    },

    "Capital Expenditure": {
      "Advisor Turnover": expenses.advisors,
      Buildings: expenses.buildings,
      "Center of Trades": expenses.cot_upgrades,
      "Embrace Institution": expenses.embrace_institution,
      "Fleet Construction": expenses.building_fleets,
      "Fort Construction": expenses.building_fortresses,
      Monuments: expenses.monuments,
      "Raising Armies": expenses.raising_armies,
      "Trade Companies": expenses.trade_company_investments,
    },
  } as const;
}

export type Budget = ReturnType<typeof createBudget>;

export function createBudget({
  income: incomeLedger,
  expenses: expenseLedger,
}: {
  income: CountryIncomeLedger;
  expenses: CountryExpenseLedger;
}) {
  const income = incomeBudget(incomeLedger);
  const expenses = expenseBudget(expenseLedger);

  return {
    "Core Income": income["Core Income"],
    "Subject Income": income["Subject Income"],
    "Diplomatic Income": income["Diplomatic Income"],
    Maintenance: expenses.Maintenance,
    "Interest Payments": expenses["Interest Payments"],
    "Diplomatic Expenses": expenses["Diplomatic Expenses"],
    "One-time Income": income["One-time Income"],
    "One-time Expenses": expenses["One-time Expenses"],
    "Capital Expenditure": expenses["Capital Expenditure"],
  };
}

export const budgetSelect = {
  recurringRevenue: (budget: Income) =>
    sumValues(
      budget["Core Income"],
      budget["Subject Income"],
      budget["Diplomatic Income"],
    ),
  operatingExpenses: (budget: Expenses) =>
    sumValues(
      budget.Maintenance,
      budget["Interest Payments"],
      budget["Diplomatic Expenses"],
    ),
  operatingProfit: (budget: Budget) =>
    budgetSelect.recurringRevenue(budget) -
    budgetSelect.operatingExpenses(budget),

  nonOperatingExpenses: (budget: Expenses) =>
    sumValues(budget["One-time Expenses"], budget["Capital Expenditure"]),

  totalRevenue: (budget: Income) =>
    budgetSelect.recurringRevenue(budget) +
    sumValues(budget["One-time Income"]),

  totalExpenses: (budget: Expenses) =>
    budgetSelect.operatingExpenses(budget) +
    budgetSelect.nonOperatingExpenses(budget),

  netProfit: (budget: Budget) =>
    budgetSelect.totalRevenue(budget) - budgetSelect.totalExpenses(budget),

  capexRatio: (budget: Expenses) =>
    sumValues(budget["Capital Expenditure"]) /
    budgetSelect.totalExpenses(budget),

  keys: <T extends object>(obj: T): (keyof T)[] =>
    Object.keys(obj) as (keyof T)[],

  divide: (budget: Budget, divisor: number): Budget => {
    return Object.fromEntries(
      budgetSelect
        .keys(budget)
        .map((kind) => [
          kind,
          Object.fromEntries(
            budgetSelect
              .keys(budget[kind])
              .map((key) => [key, budget[kind][key] / divisor]),
          ),
        ]),
    ) as Budget;
  },
};
