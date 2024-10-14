import { WebPage } from "@/components/layout";
import { SkanderbegPage } from "@/features/skanderbeg/SkanderbegPage";
import { seo } from "@/lib/seo";
import { MetaFunction } from "@remix-run/cloudflare";

export const meta: MetaFunction = () =>
  seo({
    title: `Skanderbeg | PDX Tools`,
    description: `Analyze EU4 save file that have been uploaded to Skanderbeg`,
  });

export default function SkanderbegRoute() {
  return (
    <WebPage>
      <SkanderbegPage />
    </WebPage>
  );
}
