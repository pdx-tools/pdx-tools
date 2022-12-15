import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type Vic3Ui } from "@/features/vic3/vic3Ui";
import { PageDropOverlay } from "../components/PageDropOverlay";

const DynamicVic3: ComponentType<React.ComponentProps<typeof Vic3Ui>> = dynamic(
  () => import("@/features/vic3/vic3Ui")
);

export const Vic3View = () => {
  return (
    <>
      <PageDropOverlay />
      <DynamicVic3 />
    </>
  );
};
