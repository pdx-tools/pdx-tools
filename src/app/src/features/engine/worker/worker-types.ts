import { DetectedDataType } from "../engineSlice";

type ProgressEvent = {
  percent: number;
  elapsedMs: number;
};

type AnalyzeKind =
  | { kind: "bytes read"; amount: number }
  | { kind: "detected"; type: DetectedDataType }
  | { kind: "progress"; msg: string }
  | { kind: "incremental progress"; msg: string }
  | { kind: "start poll"; endPercent: number }
  | { kind: "end poll" };

export type AnalyzeEvent = AnalyzeKind & ProgressEvent;

export interface AnalyzeOptions {
  progress: (event: AnalyzeEvent) => void;
}
