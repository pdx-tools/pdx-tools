import Eu4Ui from "@/features/eu4/Eu4Ui";
import { seo } from "@/lib/seo";
import { MetaFunction } from "@remix-run/cloudflare";
import { useParams } from "@remix-run/react";
import { useMemo } from "react";

export const meta: MetaFunction = () =>
  seo({
    title: `Analyze Skanderbeg saves | PDX Tools`,
    description: `Analyze EU4 save files that have been uploaded to Skanderbeg`,
  });

export default function SkanderbegRoute() {
  const { skanId } = useParams();
  const save = useMemo(
    () => ({ kind: "skanderbeg", skanId: skanId! }) as const,
    [skanId],
  );
  return <Eu4Ui save={save} />;
}
