import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { useAddCampaignSaves } from "@/features/campaign/useAddCampaignSaves";
import type { CampaignSaveFiles } from "@/features/campaign/useAddCampaignSaves";
import { useEu4History } from "@/features/eu4/analysis/store";

const EU4_SAVES: CampaignSaveFiles = {
  pattern: /\.eu4$/i,
  accept: ".eu4",
  picker: { description: "EU4 saves", accept: { "application/pdx": [".eu4"] } },
};

/** Add saves: a bordered button where it is the one action, a quiet one elsewhere. */
export function AddSaves({
  quiet = false,
  primary = false,
  children = "Add saves",
}: {
  quiet?: boolean;
  /** The one action of its state. */
  primary?: boolean;
  children?: React.ReactNode;
}) {
  const { busy, chooseFiles, fileInput } = useAddCampaignSaves(EU4_SAVES, (issue) =>
    useEu4History.setState({ issues: [issue] }),
  );
  return (
    <>
      <Button
        className={cx("self-start", quiet && "underline underline-offset-2")}
        {...(quiet && { variant: "ghost", shape: "none" })}
        {...(primary && { variant: "primary" })}
        disabled={busy}
        onClick={() => void chooseFiles()}
      >
        {children}
      </Button>
      <input {...fileInput} tabIndex={-1} aria-label="Add campaign saves" className="sr-only" />
    </>
  );
}
