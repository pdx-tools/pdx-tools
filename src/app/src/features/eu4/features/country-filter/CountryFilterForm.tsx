import React, { useEffect, useRef } from "react";
import { Form, Radio, Switch, Checkbox, Button } from "antd";
import {
  useCountryFilterDispatch,
  useCountryFilterState,
} from "./countryFilterContext";
import { CountrySelect } from "../../components/country-select";
import { CountryMatcher } from "../../types/models";

interface CountryFilterFormProps {
  initialValues: CountryMatcher;
  onChange: (filter: CountryMatcher) => void;
}

const superregions = [
  "india",
  "east_indies",
  "oceania",
  "china",
  "europe",
  "eastern_europe",
  "tartary",
  "far_east",
  "africa",
  "southern_africa",
  "south_america",
  "andes",
  "north_america",
  "central_america",
  "near_east",
  "persia_superregion",
];

const superregionOptions = () =>
  superregions.map((x) => {
    let value = `${x}_superregion`;
    let upper = x.charAt(0).toUpperCase() + x.slice(1);
    let label = upper.replace(/_/g, " ");
    return { label, value };
  });

export const CountryFilterForm = ({
  initialValues,
  onChange,
}: CountryFilterFormProps) => {
  const initVals = useRef(initialValues);
  const filter = useCountryFilterState();
  const dispatch = useCountryFilterDispatch();
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFields([
      {
        name: ["exclude"],
        value: filter.matcher.exclude,
      },
      {
        name: ["include"],
        value: filter.matcher.include,
      },
    ]);
  }, [form, filter.matcher]);

  const resetForm = () => {
    form.resetFields();
    dispatch({ kind: "set-matcher", matcher: initVals.current });
  };

  const onFormFinish = (x: CountryMatcher) => {
    initVals.current = x;
    onChange(x);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFormFinish}
      onFieldsChange={(_e, x) => {
        const find = (field: string) =>
          x.find((prop) => Array.isArray(prop.name) && prop.name[0] == field)
            ?.value;

        const matcher = {
          players: find("players"),
          ai: find("ai"),
          subcontinents: find("subcontinents"),
          include: find("include"),
          exclude: find("exclude"),
          includeSubjects: find("includeSubjects"),
        };

        dispatch({ kind: "set-matcher", matcher });
      }}
      initialValues={initVals.current}
    >
      <Form.Item label="Humans" name="players">
        <Radio.Group
          options={[
            {
              label: "All",
              value: "all",
            },
            {
              label: "Alive",
              value: "alive",
            },
            {
              label: "Dead",
              value: "dead",
            },
            {
              label: "None",
              value: "none",
            },
          ]}
          optionType="button"
        />
      </Form.Item>

      <Form.Item label="AI" name="ai">
        <Radio.Group
          options={[
            {
              label: "All",
              value: "all",
            },
            {
              label: "Alive",
              value: "alive",
            },
            {
              label: "Greats",
              value: "great",
            },
            {
              label: "Dead",
              value: "dead",
            },
            {
              label: "None",
              value: "none",
            },
          ]}
          optionType="button"
        />
      </Form.Item>

      <Form.Item
        label="Subcontinent"
        name="subcontinents"
        tooltip="Restrict selection to countries with their capital on the given subcontinent (super region)"
      >
        <Checkbox.Group options={superregionOptions()}></Checkbox.Group>
      </Form.Item>

      <Form.Item label="Include" name="include">
        <CountrySelect ai="all" mode="multiple" className="w-full" />
      </Form.Item>

      <Form.Item label="Exclude" name="exclude">
        <CountrySelect ai="all" mode="multiple" className="w-full" />
      </Form.Item>
      <Form.Item
        label="Include Subjects"
        name="includeSubjects"
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>
      <Form.Item>
        <div className="flex items-center gap-2">
          <Button htmlType="submit" type="primary" className="w-full">
            Apply
          </Button>
          <Button className="w-full" onClick={resetForm}>
            Reset
          </Button>
        </div>
      </Form.Item>
    </Form>
  );
};
