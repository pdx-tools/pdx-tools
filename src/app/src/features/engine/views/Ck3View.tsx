import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type Ck3Ui } from "@/features/ck3/Ck3Ui";
import { AnalyzeDropZone } from "../components/AnalyzeDropZone";

const DynamicCk3: ComponentType<React.ComponentProps<typeof Ck3Ui>> = dynamic(
  () => import("@/features/ck3/Ck3Ui")
);

export const Ck3View = () => {
  return (
    <>
      <AnalyzeDropZone />
      <DynamicCk3 />
    </>
  );
};
