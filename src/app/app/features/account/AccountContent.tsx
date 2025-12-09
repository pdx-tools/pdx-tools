import { Alert } from "@/components/Alert";
import { pdxApi } from "@/services/appApi";
import { Button } from "@/components/Button";
import { useState } from "react";
import { toast } from "sonner";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Input } from "@/components/Input";
import { useSession } from "./SessionProvider";
import { hasPermission } from "@/lib/auth";
import { Card } from "@/components/Card";

export const AccountContent = () => {
  const [key, setKey] = useState<string | undefined>();
  const newKey = pdxApi.apiKey.useGenerateKey();
  const session = useSession();
  const rebalance = pdxApi.saves.useRebalance();
  const reprocess = pdxApi.saves.useReprocess();
  const og = pdxApi.save.useOgMutation();
  const [saveIdValue, setSaveIdValue] = useState("");

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <Card className="space-y-4 p-6">
        <h2 className="text-xl font-medium">API Key Management</h2>
        <p className="">
          Generate a new API key for 3rd party apps. Previous API key is
          overwritten
        </p>
        <Button
          className=""
          onClick={() =>
            newKey.mutate(undefined, {
              onSuccess: (data) => setKey(data.api_key),
              onError: (e) =>
                toast.error("Failed to generate API key", {
                  description: e.message,
                  duration: 5000,
                }),
            })
          }
        >
          {newKey.isPending ? <LoadingIcon className="mr-2 h-4 w-4" /> : null}
          Generate API Key
        </Button>

        {key ? (
          <Alert key={key} variant="info" className="p-4">
            <Alert.Description>
              Your new API Key:{" "}
              <pre className="inline rounded p-1 font-mono">{key}</pre>
            </Alert.Description>
          </Alert>
        ) : null}
      </Card>

      {hasPermission(session, "leaderboard:rebalance") &&
      hasPermission(session, "savefile:reprocess") ? (
        <Card className="space-y-4 p-6">
          <h2 className="text-xl font-medium">Admin Tools</h2>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button
              variant="primary"
              disabled={rebalance.isPending}
              className="w-full sm:w-auto"
              onClick={() =>
                rebalance.mutate(undefined, {
                  onSuccess: () => toast.success("Rebalanced successfully"),
                  onError: (e) =>
                    toast.error("Rebalance failed", {
                      description: e.message,
                      duration: Infinity,
                      closeButton: true,
                    }),
                })
              }
            >
              {rebalance.isPending && <LoadingIcon className="mr-2 h-4 w-4" />}
              Rebalance saves
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <label className="flex cursor-pointer items-center justify-center">
                {reprocess.isPending && (
                  <LoadingIcon className="mr-2 h-4 w-4" />
                )}
                Reprocess file
                <input
                  className="absolute opacity-0"
                  type="file"
                  accept=".json"
                  disabled={reprocess.isPending}
                  onChange={async (e) => {
                    if (!e.currentTarget.files?.[0]) {
                      return;
                    }

                    const target = e.currentTarget;
                    const file = e.currentTarget.files[0];
                    const data = JSON.parse(await file.text());
                    reprocess.mutate(data, {
                      onSuccess: () =>
                        toast.success("Reprocessed successfully"),
                      onError: (e) =>
                        toast.error("Reprocess failed", {
                          description: e.message,
                          duration: Infinity,
                          closeButton: true,
                        }),
                    });
                    target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>
        </Card>
      ) : null}

      {hasPermission(session, "savefile:og-request") ? (
        <Card className="space-y-4 p-6">
          <h2 className="text-xl font-medium">Update OG Metadata</h2>
          <form
            className="flex flex-col gap-4 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              og.mutate({ id: saveIdValue });
            }}
          >
            <Input
              name="save-id"
              placeholder="Enter save ID"
              className="grow px-2"
              required
              value={saveIdValue}
              onChange={(e) => setSaveIdValue(e.target.value)}
            />
            <Button
              type="submit"
              disabled={og.isPending || !saveIdValue.trim()}
            >
              {og.isPending && <LoadingIcon className="mr-2 h-4 w-4" />}
              Update OG
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
};
