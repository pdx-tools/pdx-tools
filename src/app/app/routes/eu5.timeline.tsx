import { SaveHistory } from "@/features/eu5/history/SaveHistory";

export const meta = () => [{ title: "EU5 campaign history · PDX Tools" }];

export default function SaveTimeline() {
  return <SaveHistory />;
}
