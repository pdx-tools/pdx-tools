import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type Hoi4Ui } from "@/features/hoi4/Hoi4Ui";
import { PageDropOverlay } from "../components/PageDropOverlay";

const DynamicHoi4: ComponentType<React.ComponentProps<typeof Hoi4Ui>> = dynamic(
  () => import("@/features/hoi4/Hoi4Ui")
);

export const Hoi4View = () => {
  return (
    <>
      <PageDropOverlay />
      <DynamicHoi4 />
    </>
  );
};
