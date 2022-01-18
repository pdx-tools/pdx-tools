import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type Hoi4Ui } from "@/features/hoi4/Hoi4Ui";
import { AnalyzeDropZone } from "../components/AnalyzeDropZone";

const DynamicHoi4: ComponentType<React.ComponentProps<typeof Hoi4Ui>> = dynamic(
  () => import("@/features/hoi4/Hoi4Ui")
);

export const Hoi4View: React.FC<{}> = () => {
  return (
    <>
      <AnalyzeDropZone />
      <DynamicHoi4 />
    </>
  );
};
