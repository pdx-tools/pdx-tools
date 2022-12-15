import { ComponentType } from "react";
import dynamic from "next/dynamic";
import { type ImperatorUi } from "@/features/imperator/ImperatorUi";
import { PageDropOverlay } from "../components/PageDropOverlay";

const DynamicImperator: ComponentType<
  React.ComponentProps<typeof ImperatorUi>
> = dynamic(() => import("@/features/imperator/ImperatorUi"));

export const ImperatorView = () => {
  return (
    <>
      <PageDropOverlay />
      <DynamicImperator />
    </>
  );
};
