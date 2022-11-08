import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type Vic3Ui } from "@/features/vic3/vic3Ui";
import { AnalyzeDropZone } from "../components/AnalyzeDropZone";

const DynamicVic3: ComponentType<React.ComponentProps<typeof Vic3Ui>> = dynamic(
  () => import("@/features/vic3/vic3Ui")
);

export const Vic3View = () => {
  return (
    <>
      <AnalyzeDropZone />
      <DynamicVic3 />
    </>
  );
};
