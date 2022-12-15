import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type Ck3Ui } from "@/features/ck3/Ck3Ui";
import { PageDropOverlay } from "../components/PageDropOverlay";

const DynamicCk3: ComponentType<React.ComponentProps<typeof Ck3Ui>> = dynamic(
  () => import("@/features/ck3/Ck3Ui")
);

export const Ck3View = () => {
  return (
    <>
      <PageDropOverlay />
      <DynamicCk3 />
    </>
  );
};
