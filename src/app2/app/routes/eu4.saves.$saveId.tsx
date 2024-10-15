import Eu4Ui from "@/features/eu4/Eu4Ui";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

export const Route = createFileRoute("/eu4/saves/$saveId")({
  component: SaveComponent,
  meta({ params: { saveId } }) {
    return [
      { name: "twitter:image", content: `/eu4/saves/${saveId}/og.webp` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "og:image", content: `/eu4/saves/${saveId}/og.webp` },
    ];
  },
});

function SaveComponent() {
  const { saveId } = Route.useParams();
  return <SavePage saveId={saveId} />;
}

type SaveProps = {
  saveId: string;
};

const SavePage = ({ saveId }: SaveProps) => {
  const save = useMemo(() => ({ kind: "server", saveId }) as const, [saveId]);
  return <Eu4Ui save={save} />;
};
