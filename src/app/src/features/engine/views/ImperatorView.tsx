import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type ImperatorUi } from "@/features/imperator/ImperatorUi";
import { AnalyzeDropZone } from "../components/AnalyzeDropZone";

const DynamicImperator: ComponentType<
  React.ComponentProps<typeof ImperatorUi>
> = dynamic(() => import("@/features/imperator/ImperatorUi"));

export const ImperatorView: React.FC<{}> = () => {
  return (
    <>
      <AnalyzeDropZone />
      <DynamicImperator />
    </>
  );
};
