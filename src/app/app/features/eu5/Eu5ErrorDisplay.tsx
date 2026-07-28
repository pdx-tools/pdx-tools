import { Link } from "react-router";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { DiscordIcon, GithubIcon } from "@/components/icons";
import { useEngineActions } from "@/features/engine";
import { GameButton } from "./components";

interface Eu5ErrorDisplayProps {
  error: unknown;
}

const SUPPORT_LINKS = [
  { href: "https://discord.gg/rCpNWQW", label: "Ask on Discord", icon: DiscordIcon },
  {
    href: "https://github.com/pdx-tools/pdx-tools/issues/new",
    label: "Report it",
    icon: GithubIcon,
  },
];

function isWebGPUError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("webgpu");
}

export const Eu5ErrorDisplay = ({ error }: Eu5ErrorDisplayProps) => {
  const { resetSaveAnalysis } = useEngineActions();
  const isWebGPU = isWebGPUError(error);
  const detail = getErrorMessage(error);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-game-page px-6 font-game-ui">
      <div className="w-full max-w-[520px] pb-[8vh]">
        <div className="flex items-start gap-2.5">
          <ExclamationTriangleIcon
            className="mt-px h-4 w-4 shrink-0 text-game-err"
            aria-hidden="true"
          />
          <h2 className="text-[17px] leading-tight font-medium text-game-ink-100">
            {isWebGPU ? "This browser can't render the map" : "This save didn't load"}
          </h2>
        </div>

        <p className="mt-3 text-[12.5px] leading-[1.5] text-game-ink-300">
          {isWebGPU
            ? "The EU5 map is drawn with WebGPU, and this browser could not start it."
            : "The save could not be parsed."}
        </p>

        {isWebGPU ? (
          <ul className="mt-3 flex flex-col gap-1 text-[12.5px] leading-[1.5] text-game-ink-500">
            <li>Turn on hardware acceleration in your browser settings.</li>
            <li>Try Chrome, Edge, or Brave — WebGPU ships there first.</li>
          </ul>
        ) : null}

        {detail ? (
          <p className="mt-4 border-t border-game-line pt-3 font-game-num text-[10.5px] leading-[1.5] break-words text-game-ink-500">
            {detail}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <GameButton variant="commit" asChild>
            <Link to="/" onClick={resetSaveAnalysis}>
              Load another save
            </Link>
          </GameButton>
          {SUPPORT_LINKS.map(({ href, label, icon: Icon }) => (
            <GameButton key={href} variant="ghost" asChild>
              <a href={href} target="_blank" rel="noreferrer">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </a>
            </GameButton>
          ))}
        </div>
      </div>
    </div>
  );
};
