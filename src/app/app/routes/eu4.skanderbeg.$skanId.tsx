import { WebPage } from "@/components/layout";
import { seo } from "@/lib/seo";
import { MetaFunction } from "@remix-run/cloudflare";

export const meta: MetaFunction = () =>
  seo({
    title: `Analyze Skanderbeg saves | PDX Tools`,
    description: `Analyze EU4 save files that have been uploaded to Skanderbeg`,
  });

export default function SkanderbegRoute() {
  return (
    <WebPage>
      <main className="mx-auto mt-8 max-w-screen-md">
        <SkanderbegRoute />
      </main>
    </WebPage>
  );
}
