import Eu4Ui from "@/features/eu4/Eu4Ui";
import { seo } from "@/lib/seo";
import type { Route } from "./+types/eu4.saves.$saveId";
import { useParams } from "react-router";
import { useMemo } from "react";

export const meta: Route.MetaFunction = ({ params: { saveId } }) =>
  seo({
    title: `EU4 Save: ${saveId}`,
    description: `View EU4 maps, charts, timelapses, and data`,
    image: `/eu4/saves/${saveId}/og`,
  });

export default function SaveRoute(_props: Route.ComponentProps) {
  const { saveId } = useParams();
  return <SavePage saveId={saveId!} />;
}

type SaveProps = {
  saveId: string;
};

const SavePage = ({ saveId }: SaveProps) => {
  const save = useMemo(() => (({
    kind: "server",
    saveId
  }) as const), [saveId]);
  return <Eu4Ui save={save} />;
};
