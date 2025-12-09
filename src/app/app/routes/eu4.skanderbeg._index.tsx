import { WebPage } from "@/components/layout";
import { SkanderbegAlert } from "@/features/eu4/components/SkanderbegAlert";
import { seo } from "@/lib/seo";

export const meta = () =>
  seo({
    title: `Skanderbeg | PDX Tools`,
    description: `Analyze EU4 save file that have been uploaded to Skanderbeg`,
  });

export default function SkanderbegRoute() {
  return (
    <WebPage>
      <main className="mx-auto mt-8 max-w-screen-md">
        <SkanderbegAlert />
      </main>
    </WebPage>
  );
}
