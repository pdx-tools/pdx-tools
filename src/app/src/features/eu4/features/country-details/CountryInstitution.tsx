import React, {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CountryDetails } from "../../types/models";
import { Eu4Worker, useEu4Worker } from "../../worker";
import { Alert } from "@/components/Alert";
import { formatFloat, formatInt } from "@/lib/format";
import { cx } from "class-variance-authority";
import { InstitutionCost } from "../../../../../../wasm-eu4/pkg/wasm_eu4";
import { createColumnHelper } from "@tanstack/react-table";
import { Table } from "@/components/Table";
import { DataTable } from "@/components/DataTable";
import { create } from "zustand";
import { IconButton } from "@/components/IconButton";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { useThrottle } from "@/hooks/useThrottle";
import { Divider } from "@/components/Divider";
import { Input } from "@/components/Input";
import { Tooltip } from "@/components/Tooltip";
import { keyboardTrigger } from "@/lib/keyboardTrigger";

type InputEvent = React.SyntheticEvent<ElementRef<typeof Input>>;
type InputNumberEvent = InputEvent & { value: number };
const InputNumber = forwardRef<
  ElementRef<typeof Input>,
  Omit<ComponentPropsWithoutRef<typeof Input>, "onChange"> & {
    onChange: (e: InputNumberEvent) => void;
  }
>(function InputNumber({ value, onChange, ...props }, ref) {
  const [backing, setBacking] = useState(value);

  useEffect(() => {
    setBacking(value);
  }, [value]);

  const changeCb = (e: InputEvent) => {
    const result = Number(e.currentTarget.value);
    if (isNaN(result)) {
      return;
    }

    onChange({
      value: result,
      ...e,
    });
  };

  return (
    <Input
      ref={ref}
      {...props}
      inputMode="numeric"
      type="text"
      value={backing}
      onKeyDown={keyboardTrigger(changeCb, "Enter")}
      onBlur={changeCb}
      onChange={(e) => setBacking(e.currentTarget.value)}
    />
  );
});

function ProvinceModifier(props: InstitutionCost) {
  const actions = useInstitutionActions();
  const override = useProvinceModifierOverride(props.province_id);
  const value = Math.round((override ?? props.dev_cost_modifier) * 100);

  return (
    <div className="flex">
      <InputNumber
        className="w-14 text-right border-gray-400/25 mr-1 px-2"
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
            <XMarkIcon className="h-4 w-4 hover:opacity-100 transition-opacity opacity-50" />
          }
        />
      ) : null}
    </div>
  );
}

const columnHelper = createColumnHelper<InstitutionCost>();
const columns = [
  columnHelper.accessor("name", {
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Province" />
    ),
    cell: ({ row }) => (
      <div>
        {row.original.name} ({row.original.province_id})
      </div>
    ),
  }),

  columnHelper.accessor("current_institution_progress", {
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Progress" />
    ),
    cell: (info) => (
      <div className="text-right">{formatFloat(info.getValue(), 3)}%</div>
    ),
  }),

  columnHelper.accessor("mana_cost", {
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Mana cost" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("current_dev", {
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Current dev" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("dev_cost_modifier", {
    header: ({ column }) => (
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Table.ColumnHeader column={column} title="Dev modifier" />
        </Tooltip.Trigger>
        <Tooltip.Content className="max-w-72">
          The calculated development cost modifier from province specific and
          country-wide sources. Can be edited for exactness.
        </Tooltip.Content>
      </Tooltip>
    ),
    cell: (info) => <ProvinceModifier {...info.row.original} />,
  }),

  columnHelper.accessor("final_dev", {
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Final dev" />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
  }),

  columnHelper.accessor("exploit_at", {
    header: ({ column }) => (
      <Table.ColumnHeader column={column} title="Exploit at" />
    ),
    cell: (info) => {
      const value = info.getValue();
      return (
        <div className="text-right">
          {value === undefined ? "---" : formatInt(value)}
        </div>
      );
    },
  }),

  columnHelper.accessor("additional_expand_infrastructure", {
    header: ({ column }) => (
      <Table.ColumnHeader
        className="w-28"
        column={column}
        title="Additional expand infra."
      />
    ),
    cell: (info) => (
      <div className="text-right">{formatInt(info.getValue())}</div>
    ),
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
          modifier,
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
      <div
        className={cx(
          data.institutions_embraced == data.institutions_available &&
            "font-semibold text-green-600",
        )}
      >
        {formatInt(data.institutions_embraced)}/
        {formatInt(data.institutions_available)} institutions embraced
      </div>
      <Divider>Dev Push Institution</Divider>
      <div className="flex gap-20">
        <div className="space-y-1">
          <Tooltip>
            <Tooltip.Trigger>
              <div>
                <label className="w-96 inline-flex justify-between mr-1">
                  Country-wide development cost modifier:
                  <InputNumber
                    className="px-2 py-1 w-14 text-right"
                    value={modifier * 100}
                    onChange={(e) => setModifier(e.value / 100)}
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
            <label className="w-96 inline-flex justify-between">
              Expand infrastructure mana cost:
              <InputNumber
                className="px-2 py-1 w-14 text-right"
                value={expandCost}
                onChange={(e) => setExpandCost(Math.max(e.value, 0))}
              />
            </label>
          </div>
        </div>
        <div>
          <div className="font-semibold">
            Detected Province development cost modifiers
          </div>
          <ul className="pl-4 flex flex-col flex-wrap h-20 gap-x-12">
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
      />
    </div>
  );
};
