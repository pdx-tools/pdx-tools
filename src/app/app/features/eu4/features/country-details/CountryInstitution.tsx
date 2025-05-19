import { useCallback, useMemo, useState } from "react";
import { CountryDetails } from "../../types/models";
import { Eu4Worker, useEu4Worker } from "../../worker";
import { Alert } from "@/components/Alert";
import { formatFloat, formatInt } from "@/lib/format";
import { InstitutionCost } from "@pdx.tools/wasm-eu4";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { create } from "zustand";
import { IconButton } from "@/components/IconButton";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { useThrottle } from "@/hooks/useThrottle";
import { Divider } from "@/components/Divider";
import { Tooltip } from "@/components/Tooltip";
import { InputNumber } from "@/components/InputNumber";
import { Link } from "@/components/Link";
import { Badge } from "@/components/Badge";
import {
  calculateInstitutionSteps,
  consolidateSteps,
} from "./institutionSteps";
import styles from "./CountryInstitution.module.css";

function ProvinceModifier(props: InstitutionCost) {
  const actions = useInstitutionActions();
  const override = useProvinceModifierOverride(props.province_id);
  const value = Math.round((override ?? props.dev_cost_modifier) * 100);

  return (
    <div className="flex">
      <InputNumber
        className="mr-1 w-14 border-gray-400/25 px-2 text-right"
        value={value}
        onChange={(e) => {
          if (override === undefined && e.value == value) {
            return;
          }

          actions.overrideModifier(props.province_id, e.value / 100);
        }}
      />
      %
      {override !== undefined &&
      override !== props.dev_cost_modifier_heuristic ? (
        <IconButton
          className="pl-2"
          variant="ghost"
          shape="none"
          onClick={() => actions.clearOverride(props.province_id)}
          tooltip={"Reset modified dev cost modifier"}
          icon={
            <XMarkIcon className="h-4 w-4 opacity-50 transition-opacity hover:opacity-100" />
          }
        />
      ) : null}
    </div>
  );
}

function InstructionSteps({ row }: { row: InstitutionCost }) {
  const steps = useMemo(
    () => consolidateSteps(calculateInstitutionSteps(row)),
    [row],
  );

  return (
    <div className="space-y-1 text-xs">
      {steps.map((step, index) => {
        switch (step.type) {
          case "develop":
            return (
              <div key={`dev-${index}`}>
                Dev {step.from}
                {step.to !== step.from ? ` → ${step.to}` : ""}
                {step.followedBy.map((f) =>
                  f.type == "expand" ? (
                    <abbr
                      key={f.type}
                      title="Then expand infrastructure"
                      className="cursor-help text-purple-600 no-underline dark:text-purple-400"
                    >
                      {" "}
                      (expand){(f.times ?? 1) > 1 ? ` (${f.times}x)` : ""}
                    </abbr>
                  ) : (
                    <abbr
                      key={f.type}
                      title="Then exploit development"
                      className="cursor-help text-amber-600 no-underline dark:text-amber-400"
                    >
                      {" "}
                      (exploit)
                    </abbr>
                  ),
                )}
              </div>
            );
        }
      })}
    </div>
  );
}

const columnHelper = createColumnHelper<InstitutionCost>();
const columns = [
  columnHelper.accessor("name", {
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Province" />
    ),
    enableColumnFilter: true,
    cell: ({ row }) => (
      <div className="font-medium">
        {row.original.name}{" "}
        <span className="text-gray-500">({row.original.province_id})</span>
      </div>
    ),
  }),

  columnHelper.accessor("current_institution_progress", {
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Progress" />
    ),
    cell: (info) => (
      <div className="text-right">
        <div className="relative pt-1">
          <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-1.5 rounded-full bg-blue-500"
              style={{ width: `${Math.min(100, info.getValue())}%` }}
            ></div>
          </div>
          <div className="mt-1 text-xs font-medium">
            {formatFloat(info.getValue(), 2)}%
          </div>
        </div>
      </div>
    ),
  }),

  columnHelper.accessor("mana_cost", {
    enableColumnFilter: false,
    header: ({ column }) => (
      <Table.ColumnHeader
        column={column}
        className={styles["header"]}
        title="Mana cost"
      />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("dev_cost_modifier", {
    enableColumnFilter: false,
    header: ({ column }) => (
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Table.ColumnHeader column={column} title="Dev modifier" />
        </Tooltip.Trigger>
        <Tooltip.Content className="max-w-72">
          The calculated development cost modifier from province specific and
          country-wide sources. Can be edited for exactness (exclude base cost
          from development and expand infrastructure)
        </Tooltip.Content>
      </Tooltip>
    ),
    cell: (info) => <ProvinceModifier {...info.row.original} />,
  }),

  columnHelper.display({
    id: "instructions",
    header: ({ column }) => (
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Table.ColumnHeader column={column} title="Instructions" />
        </Tooltip.Trigger>
        <Tooltip.Content className="max-w-72">
          Step-by-step instructions to achieve the optimal mana cost
        </Tooltip.Content>
      </Tooltip>
    ),
    cell: ({ row }) => <InstructionSteps row={row.original} />,
    size: 250, // Make this column wider to accommodate instructions
  }),
];

type CountryInstitutionState = {
  overrides: Map<number, number>;
  actions: {
    overrideModifier: (id: number, modifier: number) => void;
    clearOverride: (id: number) => void;
  };
};

const useInstitutionStore = create<CountryInstitutionState>()((set, get) => ({
  overrides: new Map(),
  actions: {
    overrideModifier: function (id: number, modifier: number): void {
      set({ overrides: new Map(get().overrides).set(id, modifier) });
    },
    clearOverride: function (id: number): void {
      const newMap = new Map(get().overrides);
      newMap.delete(id);
      set({ overrides: newMap });
    },
  },
}));

const useInstitutionActions = () => useInstitutionStore((x) => x.actions);
const useProvinceModifierOverride = (id: number) =>
  useInstitutionStore((x) => x.overrides.get(id));

export const CountryInstitution = ({
  details,
}: {
  details: CountryDetails;
}) => {
  const [modifier, setModifier] = useState(0);
  const [expandCost, setExpandCost] = useState(50);
  const overrides = useInstitutionStore((x) => x.overrides);
  const institutionPush = useThrottle(
    useCallback(
      (worker: Eu4Worker) =>
        worker.eu4GetCountryInstitutionPush(
          details.tag,
          modifier / 100,
          expandCost,
          overrides,
        ),
      [details.tag, modifier, expandCost, overrides],
    ),
    150,
  );

  const { data, error } = useEu4Worker(institutionPush);

  if (error) {
    return <Alert.Error msg={error} />;
  }

  if (data === undefined) {
    return null;
  }

  return (
    <div>
      <Badge
        variant={
          data.institutions_embraced == data.institutions_available
            ? "green"
            : "default"
        }
      >
        {data.institutions_embraced == data.institutions_available
          ? "All"
          : `${formatInt(data.institutions_embraced)}/${formatInt(data.institutions_available)}`}{" "}
        institutions embraced
      </Badge>
      <Divider paddingClassNames="pt-5">
        Dev Push Institution (
        <Link
          target="_blank"
          href="/docs/eu4-guides/optimize-dev-push-institution/"
        >
          guide
        </Link>
        )
      </Divider>
      <div className="flex gap-20">
        <div className="space-y-1 pt-5">
          <Tooltip>
            <Tooltip.Trigger>
              <div>
                <label className="mr-1 inline-flex w-96 justify-between">
                  Country-wide development cost modifier:
                  <InputNumber
                    className="w-14 px-2 py-1 text-right"
                    value={modifier}
                    onChange={(e) => setModifier(e.value)}
                  />
                </label>
                %
              </div>
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-72">
              The development cost modifier that all provinces share (eg:
              renaissance: -5%)
            </Tooltip.Content>
          </Tooltip>
          <div>
            <label className="inline-flex w-96 justify-between">
              Expand infrastructure mana cost:
              <InputNumber
                className="w-14 px-2 py-1 text-right"
                value={expandCost}
                onChange={(e) => setExpandCost(Math.max(e.value, 0))}
              />
            </label>
          </div>
        </div>
        <div>
          <div className="font-semibold">
            Detected province development cost modifiers
          </div>
          <ul className="flex h-20 flex-col flex-wrap gap-x-12 pl-4">
            <li>✔️ Terrain</li>
            <li>✔️ Center of Trade</li>
            <li>✔️ Prosperity</li>
            <li>✔️ Trade Goods</li>
            <li>✔️ Capital</li>
            <li>❌ Everything else is manual</li>
          </ul>
        </div>
      </div>

      <DataTable
        className="pt-6"
        data={data.dev_push}
        columns={columns}
        pagination={true}
        autoResetPageIndex={false}
        enableColumnFilters={true}
      />
    </div>
  );
};
