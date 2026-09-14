import { useState } from "react";
import { CameraIcon } from "@heroicons/react/24/solid";
import { IMG_WIDTH } from "@pdx.tools/map";
import { DropdownMenu } from "@/components/DropdownMenu";
import { Button } from "@/components/Button";
import { compatibilityReport } from "@/lib/compatibility";
import { downloadData } from "@/lib/downloadData";
import { emitEvent } from "@/lib/events";
import { toast } from "@/lib/toast";
import { useTriggeredAction } from "@/hooks/useTriggeredAction";
import { useEu4Map, useEu4MapMode, useEu4Meta, useSelectedDate } from "../../../store";
import { GameButton } from "@/components/game/Button";

export function CameraControl() {
  const map = useEu4Map();
  const meta = useEu4Meta();
  const mode = useEu4MapMode();
  const date = useSelectedDate();
  const [textureSize] = useState(() => {
    const report = compatibilityReport();
    return report.webgl2.enabled ? report.webgl2.textureSize.actual : 0;
  });

  const { isLoading, run } = useTriggeredAction({
    action: async (kind: "view" | 1 | 2) => {
      const blob = await map.screenshot(
        kind === "view"
          ? {
              kind: "viewport",
              date: date.text,
              fontFamily: getComputedStyle(document.body).fontFamily,
            }
          : {
              kind: "world",
              scale: kind,
              date: date.text,
              fontFamily: getComputedStyle(document.body).fontFamily,
            },
      );
      const suffix = kind === "view" ? "view" : kind === 1 ? "map" : `map-${kind}x`;
      downloadData(
        blob,
        `${meta.save_game.replace(".eu4", "")}-${meta.date}-${mode}-${suffix}.png`,
      );
      emitEvent({
        kind: "Screenshot taken",
        view: kind === "view" ? "Viewport" : `World (${kind}:1)`,
      });
      toast.success("Screenshot downloaded", { duration: 2000 });
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <GameButton variant="icon" aria-label="Take screenshot" disabled={isLoading}>
          <CameraIcon className="h-4 w-4" />
        </GameButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content side="top" sideOffset={10} className="w-40">
        <DropdownMenu.Item asChild>
          <Button variant="ghost" className="w-full" onClick={() => run("view")}>
            Current view
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild disabled={textureSize < IMG_WIDTH}>
          <Button variant="ghost" className="w-full" onClick={() => run(1)}>
            Whole world
          </Button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild disabled={textureSize < IMG_WIDTH * 2}>
          <Button variant="ghost" className="w-full" onClick={() => run(2)}>
            Whole world 2x
          </Button>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
