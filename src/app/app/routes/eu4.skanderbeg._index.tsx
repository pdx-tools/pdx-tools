import { WebPage } from "@/components/layout";
import { SkanderbegAlert } from "@/features/eu4/components/SkanderbegAlert";
import { seo } from "@/lib/seo";
import type { Route } from "./+types/eu4.skanderbeg._index";

export const meta: Route.MetaFunction = () =>
  seo({
    title: `Skanderbeg | PDX Tools`,
    description: `Analyze EU4 save file that have been uploaded to Skanderbeg`,
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
