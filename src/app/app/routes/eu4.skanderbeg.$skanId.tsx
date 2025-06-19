import { WebPage } from "@/components/layout";
import { SkanderbegAlert } from "@/features/eu4/components/SkanderbegAlert";
import { seo } from "@/lib/seo";
import type { Route } from "./+types/eu4.skanderbeg.$skanId";

export const meta: Route.MetaFunction = () =>
  seo({
    title: `Analyze Skanderbeg saves | PDX Tools`,
    description: `Analyze EU4 save files that have been uploaded to Skanderbeg`,
  });

export default function SkanderbegRoute(_props: Route.ComponentProps) {
  return (
    <WebPage>
      <main className="mx-auto mt-8 max-w-screen-md">
        <SkanderbegAlert />
      </main>
    </WebPage>
  );
}
