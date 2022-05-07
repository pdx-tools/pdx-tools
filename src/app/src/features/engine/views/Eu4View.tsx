import React, { ComponentType, useEffect } from "react";
import dynamic from "next/dynamic";
import { type Eu4Ui } from "@/features/eu4/Eu4Ui";
import { AnalyzeDropZone } from "../components/AnalyzeDropZone";

const DynamicEu4: ComponentType<React.ComponentProps<typeof Eu4Ui>> = dynamic(
  () => import("@/features/eu4/Eu4Ui")
);

export const Eu4View = ({}: {}) => {
  return (
    <>
      <AnalyzeDropZone />
      <DynamicEu4 />
    </>
  );
};
