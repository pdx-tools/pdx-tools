import { Flag } from "@/features/eu4/components/avatars";
import { Eu5Flag } from "@/features/eu5/components/flags/Eu5Flag";
import type { KeptSave } from "./types";

export function KeptFlag({ save }: { save: KeptSave }) {
  if (save.flag === null) return null;
  return save.game === "eu4" ? (
    <Flag tag={save.flag} name={save.countryName ?? save.flag}>
      <Flag.Image size="xs" />
    </Flag>
  ) : (
    <Eu5Flag flag={save.flag} size="sm" />
  );
}
