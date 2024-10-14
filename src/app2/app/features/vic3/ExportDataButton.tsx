import { Button } from "@/components/Button";
import { getVic3Worker } from "./worker";
import { createCsv } from "@/lib/csv";
import { downloadData } from "@/lib/downloadData";
import { useSaveFilename } from "./store";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { LoadingIcon } from "@/components/icons/LoadingIcon";

async function exportData(vic3Filename: string) {
  const data = await getVic3Worker().get_countries_stats();

  const csvFilename = vic3Filename.replace(".v3", "-stats.csv");
  const csvData = createCsv(
    data.data.flatMap((x) =>
      x.stats.map((stats) => ({ country: x.tag, ...stats })),
    ),
    ["country", "date", "gdp", "sol", "pop", "gdpc", "gdpGrowth", "gdpcGrowth"],
  );

  downloadData(new Blob([csvData], { type: "text/csv" }), csvFilename);
}

export function ExportDataButton() {
  const vic3Filename = useSaveFilename();
  const { run, isLoading } = useTriggeredAction({
    action: () => exportData(vic3Filename),
  });

  return (
    <Button onClick={() => run()}>
      {isLoading ? (
        <LoadingIcon className="mr-2 h-4 w-4 text-gray-800" />
      ) : null}
      Export Data
    </Button>
  );
}
