import { SteamButton } from "./SteamButton";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { emitEvent } from "@/lib/events";

export const SteamRegister = () => {
  return (
    <Sheet modal={true}>
      <Sheet.Trigger asChild>
        <Button
          variant="primary"
          onClick={() => {
            emitEvent({ kind: "Register click" });
          }}
        >
          Register
        </Button>
      </Sheet.Trigger>
      <Sheet.Content
        side="right"
        className="w-96 bg-white p-6 dark:bg-slate-900"
      >
        <Sheet.Header className="mb-6">
          <Sheet.Close />
          <Sheet.Title className="pl-4 text-2xl font-bold text-balance">
            Register an account with PDX Tools
          </Sheet.Title>
        </Sheet.Header>

        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              To sign up for a PDX Tools account, login through Steam. You don't
              need to have bought EU4 through Steam — only a Steam account is
              needed.
            </p>

            <div className="flex justify-center py-2">
              <SteamButton />
            </div>
          </div>

          <div className="space-y-3 border-t pt-5 dark:border-gray-700">
            <h3 className="text-xl font-semibold">Why create an account?</h3>
            <ul className="ml-5 list-disc space-y-1 text-gray-700 dark:text-gray-300">
              <li>Ability to upload saves</li>
              <li>Achievement leaderboard participation</li>
            </ul>
          </div>

          <div className="space-y-3 border-t pt-5 dark:border-gray-700">
            <h3 className="text-xl font-semibold">Why Steam?</h3>
            <p className="text-gray-700 dark:text-gray-300">
              EU4 is mainly distributed through Steam, so the majority of PDX
              Tools users should already have a Steam account. This allows us to
              offload the bureaucracy of managing accounts to Steam.
            </p>
          </div>

          <div className="space-y-3 border-t pt-5 dark:border-gray-700">
            <h3 className="text-xl font-semibold">
              What Steam information does PDX Tools use?
            </h3>
            <p className="text-gray-700 dark:text-gray-300">
              PDX Tools only records the user id returned by Steam and the
              associated persona name.
            </p>
            <p className="font-bold text-amber-600 dark:text-amber-400">
              Your Steam password is never shared with or accessible by PDX
              Tools
            </p>
          </div>
        </div>
      </Sheet.Content>
    </Sheet>
  );
};
