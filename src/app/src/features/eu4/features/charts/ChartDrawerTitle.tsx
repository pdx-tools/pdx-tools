import { useVisualization } from "@/components/viz";
import { Button } from "@/components/Button";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  ProfileOutlined,
  CaretDownOutlined,
} from "@ant-design/icons";
import { VizModules } from "../../types/visualizations";
import { downloadData } from "@/lib/downloadData";
import { useSaveFilenameWith } from "../../store";
import { IconButton } from "@/components/IconButton";
import { Select } from "@/components/Select";
import { Sheet } from "@/components/Sheet";
import { Help } from "./Help";
import { CountryFilterButton } from "../../components/CountryFilterButton";

const vizModuleDisplayLimit = (module: VizModules) => {
  switch (module) {
    case "owned-development-states":
      return 12;
    case "monthly-income":
    case "score":
    case "nation-size":
    case "inflation":
    case "health":
      return 30;
    default:
      return null;
  }
};

interface ChartDrawerTitleProps {
  selectedViz: VizModules;
  setSelectedViz: (arg: VizModules) => void;
  expanded: boolean;
  setExpanded: (arg: boolean) => void;
}

export const ChartDrawerTitle = ({
  selectedViz,
  setSelectedViz,
  expanded,
  setExpanded,
}: ChartDrawerTitleProps) => {
  const viz = useVisualization();
  const filename = useSaveFilenameWith(`-${selectedViz}.csv`);
  const displayLimit = vizModuleDisplayLimit(selectedViz);

  return (
    <div className="flex items-center gap-2">
      <Sheet.Close />
      <Button
        shape="square"
        onClick={() => setExpanded(!expanded)}
        className="hidden md:flex"
      >
        {expanded ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        <span className="sr-only">{expanded ? "Fold" : "Expand"}</span>
      </Button>

      <Select
        value={selectedViz}
        onValueChange={(e: VizModules) => setSelectedViz(e)}
      >
        <Select.Trigger asChild className="h-10 w-60">
          <Button>
            <Select.Value />
            <Select.Icon asChild>
              <CaretDownOutlined className="h-4 w-4 opacity-50" />
            </Select.Icon>
          </Button>
        </Select.Trigger>
        <Select.Content>
          <Select.Group>
            <Select.Label>Annual Charts</Select.Label>
            <Select.Item value="monthly-income">Monthly Income</Select.Item>
            <Select.Item value="nation-size">Nation Size</Select.Item>
            <Select.Item value="score">Score</Select.Item>
            <Select.Item value="inflation">Inflation</Select.Item>
          </Select.Group>

          <Select.Group>
            <Select.Label>Trees</Select.Label>
            <Select.Item value="geographical-development">
              Geographical Development
            </Select.Item>
            <Select.Item value="owned-development-states">
              Owned Development States
            </Select.Item>
          </Select.Group>

          <Select.Group>
            <Select.Label>Tables</Select.Label>
            <Select.Item value="army-casualties">Army Casualties</Select.Item>
            <Select.Item value="navy-casualties">Navy Casualties</Select.Item>
            <Select.Item value="wars">Wars and Battles</Select.Item>
            <Select.Item value="income-table">Last Month's Income</Select.Item>
            <Select.Item value="expense-table">
              Last Month's Expenses
            </Select.Item>
            <Select.Item value="total-expense-table">
              Accumulated Expenses
            </Select.Item>
          </Select.Group>
          <Select.Group>
            <Select.Label>Other</Select.Label>
            <Select.Item value="idea-group">Idea Groups Picked</Select.Item>
            <Select.Item value="health">Health Heatmap</Select.Item>
          </Select.Group>
        </Select.Content>
      </Select>
      <CountryFilterButton />
      <IconButton
        shape="square"
        icon={<ProfileOutlined />}
        tooltip="Download data as csv"
        onClick={async () => {
          const csvData = await viz.getCsvData();
          downloadData(new Blob([csvData], { type: "text/csv" }), filename);
        }}
      />
      <Sheet modal={true}>
        <Sheet.Trigger asChild>
          <Button shape="square">
            <QuestionCircleOutlined />
            <span className="sr-only">Help</span>
          </Button>
        </Sheet.Trigger>
        <Sheet.Content side="right" className="w-96 bg-white">
          <Sheet.Header className="z-10 p-4 shadow-md">
            <Sheet.Close />
            <Sheet.Title>Help</Sheet.Title>
          </Sheet.Header>
          <Sheet.Body className="flex flex-col gap-2 px-4 pt-6">
            <Help module={selectedViz} />
          </Sheet.Body>
        </Sheet.Content>
      </Sheet>
    </div>
  );
};
