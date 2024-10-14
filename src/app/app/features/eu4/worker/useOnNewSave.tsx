import { EffectCallback, useEffect } from "react";
import { useEu4Meta } from "../store";

export function useOnNewSave(cb: EffectCallback) {
  const meta = useEu4Meta();
  useEffect(cb, [meta, cb]);
}
