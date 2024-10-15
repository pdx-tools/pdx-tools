import { WebPage } from "@/components/layout/WebPage";
import { Eu4GamePage } from "@/features/eu4/Eu4GamePage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/eu4/")({
  component: Eu4Route,
});

function Eu4Route() {
  return (
    <WebPage>
      <Eu4GamePage />
    </WebPage>
  );
}
