import { cx } from "class-variance-authority";
import QuestionMarkCircleIcon from "@heroicons/react/24/outline/QuestionMarkCircleIcon";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { VisualizationProvider } from "@/components/viz";
import { useIsCampaignAnalysisEnabled } from "@/features/campaign/analysis/useIsCampaignAnalysisEnabled";
import { SideBarButton } from "../../components/SideBarButton";
import type { SideBarButtonProps } from "../../components/SideBarButton";
import {
  SideBarContainerProvider,
  useSideBarContainerRef,
} from "../../components/SideBarContainer";
import { useCampaignFigure, useCampaignSheet, useEu4Actions } from "../../store";
import { useEu4Watch } from "../../campaignWatch";
import { CampaignHelp } from "./CampaignHelp";
import { CampaignHistory } from "./CampaignHistory";
import type { FigureId } from "./figures";
import { useEu4Campaign } from "./useEu4Campaign";
import { LiveStatus } from "./LiveStatus";
import { WatchStep } from "./NextStep";
import { CAMPAIGN_SHEET_NAME } from "./name";

/** The sidebar entry of the campaign sheet. Its icon has a dot while a file is watched. */
export const CampaignSideBarButton = ({ children, ...props }: SideBarButtonProps) => {
  const { open } = useCampaignSheet();
  const { setCampaignSheet } = useEu4Actions();
  const watching = useEu4Watch((state) => state.watching);
  return (
    <Sheet modal={false} open={open} onOpenChange={(open) => setCampaignSheet({ open })}>
      <Sheet.Trigger asChild>
        <SideBarButton
          {...props}
          className={cx(props.className, "relative")}
          aria-label={
            watching ? `${CAMPAIGN_SHEET_NAME}, watching ${watching.name}` : CAMPAIGN_SHEET_NAME
          }
        >
          {children}
          <span
            aria-hidden
            className={cx(
              "absolute top-1.5 right-2.5 size-2 rounded-full bg-sky-400",
              !watching && "hidden",
            )}
          />
        </SideBarButton>
      </Sheet.Trigger>

      <VisualizationProvider>
        <SideBarContainerProvider>
          <CampaignSheetContent />
        </SideBarContainerProvider>
      </VisualizationProvider>
    </Sheet>
  );
};

function CampaignSheetContent() {
  const sideBarContainerRef = useSideBarContainerRef();
  const figures = useIsCampaignAnalysisEnabled();
  // Inside the content, so a closed sheet does no campaign work.
  return (
    <Sheet.Content
      ref={sideBarContainerRef}
      side="right"
      onInteractOutside={(e) => e.preventDefault()}
      className="bg-white dark:bg-slate-900"
    >
      {figures ? <FiguresSheet /> : <WatchSheet />}
    </Sheet.Content>
  );
}

/** The sheet with the campaign's figures: 480 px until two known saves make a chart. */
function FiguresSheet() {
  const { expanded } = useCampaignSheet();
  const figure = useCampaignFigure();
  const campaign = useEu4Campaign();
  // Known saves, read or not, so the width changes only when a save is added.
  const chart = campaign.saves.length >= 2;
  return (
    <SheetFrame
      className={!chart ? "w-[480px]" : expanded ? "w-screen" : "w-[800px]"}
      status={<LiveStatus chart={chart} />}
      help={<CampaignHelpSheet figure={figure} />}
    >
      <CampaignHistory figure={figure} campaign={campaign} />
    </SheetFrame>
  );
}

/** Without the campaign's figures, the sheet only watches the open file. */
function WatchSheet() {
  return (
    <SheetFrame className="w-[480px]" status={<LiveStatus chart={false} />}>
      <WatchStep />
    </SheetFrame>
  );
}

function SheetFrame({
  className,
  status,
  help,
  children,
}: {
  className: string;
  status: React.ReactNode;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex h-full max-w-[100vw] flex-col pt-4 transition-[width] duration-200",
        className,
      )}
    >
      <Sheet.Header className="z-10 items-center gap-3 px-4 pb-3 shadow-md">
        <Sheet.Close />
        <Sheet.Title>{CAMPAIGN_SHEET_NAME}</Sheet.Title>
        <span className="flex min-w-0 grow">{status}</span>
        {help}
      </Sheet.Header>
      <Sheet.Body className="flex flex-1 flex-col px-4 pt-4">
        <div className="flex-1 basis-0">{children}</div>
      </Sheet.Body>
    </div>
  );
}

function CampaignHelpSheet({ figure }: { figure: FigureId }) {
  return (
    <Sheet modal={true}>
      <Sheet.Trigger asChild>
        <Button shape="square">
          <QuestionMarkCircleIcon className="h-4 w-4" />
          <span className="sr-only">Help</span>
        </Button>
      </Sheet.Trigger>
      <Sheet.Content side="right" className="w-96 bg-white dark:bg-slate-900">
        <Sheet.Header className="z-10 items-center p-4 shadow-md">
          <Sheet.Close />
          <Sheet.Title>Help</Sheet.Title>
        </Sheet.Header>
        <Sheet.Body className="flex flex-col gap-2 px-4 pt-6">
          <CampaignHelp figure={figure} />
        </Sheet.Body>
      </Sheet.Content>
    </Sheet>
  );
}
