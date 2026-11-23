import TableCellsIcon from "@heroicons/react/24/outline/TableCellsIcon";
import PlayIcon from "@heroicons/react/20/solid/PlayIcon";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import ArrowsPointingInIcon from "@heroicons/react/24/outline/ArrowsPointingInIcon";
import ArrowsPointingOutIcon from "@heroicons/react/24/outline/ArrowsPointingOutIcon";
import { Select } from "@/components/Select";
import { useVisualization } from "@/components/viz";
import { downloadData } from "@/lib/downloadData";
import { toast } from "@/lib/toast";
import { CountryFilterButton } from "@/features/eu4/components/CountryFilterButton";
import { ToggleGroup } from "@/components/ToggleGroup";
import {
  useEu4Meta,
  useCampaignFigure,
  useCampaignSheet,
  useEu4Actions,
  useSaveFilenameWith,
} from "@/features/eu4/store";
import { campaignFigures, csvSuffix, familyHint, familyOf, families } from "./figures";
import type { FamilyId, FigureId } from "./figures";
import { setColorMode, useCampaignView, useColorMode } from "./view";
import type { ColorGroup } from "./view";
import type { ColorMode } from "./history";

/** The chart's tools, which exist only with a chart: the figure, its countries, CSV and expand. */
export function ChartRow() {
  const { family, expanded } = useCampaignSheet();
  const figure = useCampaignFigure();
  const { setCampaignSheet } = useEu4Actions();
  const viz = useVisualization();
  const filename = useSaveFilenameWith(csvSuffix(family, figure));
  const colorRule = useCampaignView((state) => state.colorRule);
  const world = campaignFigures[figure].kind === "world";
  const multiplayer = useEu4Meta().multiplayer;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={family} onValueChange={(x: FamilyId) => setCampaignSheet({ family: x })}>
        <Select.Trigger asChild className="h-10 min-w-40">
          <Button aria-label="Figure" className="text-lg font-semibold">
            <Select.Value />
            <Select.Icon asChild>
              <PlayIcon className="h-3 w-3 rotate-90 self-center opacity-50" />
            </Select.Icon>
          </Button>
        </Select.Trigger>
        <Select.Content>
          {families.map((x) => (
            <Select.Item key={x.id} value={x.id} hint={familyHint(x)}>
              {x.title}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      <FigureOptions family={family} figure={figure} />
      <span className="grow" />
      {colorRule && !world && (
        <ColorChip
          text={colorRule}
          group={campaignFigures[figure].kind === "mana" ? "mana" : "line"}
          // In multiplayer the players stay in color, so there is no choice.
          choice={!multiplayer && figure !== "mana-use"}
        />
      )}
      {!world && <CountryFilterButton />}
      <IconButton
        shape="square"
        icon={<TableCellsIcon className="h-4 w-4" />}
        tooltip="Download every figure as CSV"
        aria-label="Download every figure as CSV"
        onClick={async () => {
          try {
            const csvData = await viz.getCsvData();
            downloadData(new Blob([csvData], { type: "text/csv" }), filename);
          } catch (error) {
            toast.error("Could not make the CSV", {
              description: error instanceof Error ? error.message : String(error),
            });
          }
        }}
      />
      <Button
        shape="square"
        onClick={() => setCampaignSheet({ expanded: !expanded })}
        className="hidden md:flex"
      >
        {expanded ? (
          <ArrowsPointingInIcon className="h-4 w-4" />
        ) : (
          <ArrowsPointingOutIcon className="h-4 w-4" />
        )}
        <span className="sr-only">{expanded ? "Fold" : "Expand"}</span>
      </Button>
    </div>
  );
}

/** The figures of a family as a segment, absent when it has one. */
function FigureOptions({ family, figure }: { family: FamilyId; figure: FigureId }) {
  const { setCampaignSheet } = useEu4Actions();
  const figures = useCampaignSheet().figures;
  const options = familyOf(family).figures;
  if (options.length < 2) return null;
  return (
    <ToggleGroup
      type="single"
      aria-label={`${familyOf(family).title} figure`}
      className="inline-flex rounded-md border border-solid border-gray-300 bg-white p-0.5 dark:border-gray-600 dark:bg-slate-900"
      value={figure}
      onValueChange={(x: FigureId | "") => {
        if (x) setCampaignSheet({ figures: { ...figures, [family]: x } });
      }}
    >
      {options.map((x) => (
        <ToggleGroup.Item key={x} value={x} variant="segment">
          {campaignFigures[x].option}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  );
}

/**
 * What the chart draws in color, in words. In single player a press switches
 * the rule between the top five and the followed country with its rivals.
 */
function ColorChip({ text, group, choice }: { text: string; group: ColorGroup; choice: boolean }) {
  const mode = useColorMode(group);
  const blocked = useCampaignView((state) => state.rivalsBlocked);
  const labels = useCampaignView((state) => state.colorLabels);
  // The text color of the app's controls, so the rule reads as clearly as its buttons.
  const chip =
    "h-6 gap-1 rounded-full border border-solid border-gray-400 px-2.5 text-xs font-normal whitespace-nowrap text-black/80 dark:border-gray-600 dark:text-white";
  if (!choice || blocked)
    return (
      <Badge
        title={
          blocked ??
          "What the chart draws in front: the color rule at rest, or the followed and compared countries."
        }
        variant="ghost"
        className={chip}
      >
        {text}
      </Badge>
    );
  return (
    <Select value={mode} onValueChange={(x: ColorMode) => setColorMode(group, x)}>
      <Select.Trigger asChild>
        <Button className={chip} aria-label={`${text}. Choose which countries are in color`}>
          {text}
          <Select.Icon asChild>
            <PlayIcon className="h-2.5 w-2.5 rotate-90 opacity-60" />
          </Select.Icon>
        </Button>
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="top">{labels.top}</Select.Item>
        <Select.Item value="rivals">{labels.rivals}</Select.Item>
      </Select.Content>
    </Select>
  );
}
