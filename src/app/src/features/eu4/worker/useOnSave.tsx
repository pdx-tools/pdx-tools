import { EffectCallback, useEffect } from "react";
import { useEu4Meta } from "../Eu4SaveProvider";

export function useOnNewSave(cb: EffectCallback) {
  const meta = useEu4Meta();
  useEffect(cb, [meta, cb]);
}
