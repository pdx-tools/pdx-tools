import { Alert } from "@/components/Alert";
import { pdxApi, sessionSelect } from "@/services/appApi";
import { Button } from "@/components/Button";
import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { Input } from "@/components/Input";
import { check } from "@/lib/isPresent";
import { useSession } from "./SessionProvider";

export const AccountContent = () => {
  const [key, setKey] = useState<string | undefined>();
  const newKey = pdxApi.apiKey.useGenerateKey();
  const session = useSession();
  const rebalance = pdxApi.saves.useRebalance();
  const reprocess = pdxApi.saves.useReprocess();
  const og = pdxApi.save.useOgMutation();
  const saveIdRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {key ? (
        <Alert key={key} variant="info" className="p-4">
          <Alert.Description>
            Your new API Key: <pre className="inline">{key}</pre>. Keep it safe
          </Alert.Description>
        </Alert>
      ) : null}
      <div>
        <p>
          Generate a new API key for 3rd party apps. Previous API key is
          overwritten
        </p>
        <Button
          className="mt-2"
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
          {newKey.isPending ? (
            <LoadingIcon className="h-4 w-4 text-gray-800" />
          ) : null}{" "}
          Generate
        </Button>
      </div>
      {sessionSelect.isAdmin(session) ? (
        <div className="flex w-60 flex-col">
          <Button
            variant="primary"
            disabled={rebalance.isPending}
            onClick={() =>
              rebalance.mutate(undefined, {
                onSuccess: () => toast.success("Rebalanced successfully"),
                onError: (e) =>
                  toast.success("Rebalanced failed", {
                    description: e.message,
                    duration: Infinity,
                    closeButton: true,
                  }),
              })
            }
          >
            Rebalance saves
          </Button>
          <Button asChild>
            <label>
              Reprocess file
              <input
                className="absolute opacity-0"
                type="file"
                accept=".json"
                disabled={reprocess.isPending}
                onChange={async (e) => {
                  if (e.currentTarget.files && e.currentTarget.files[0]) {
                    const target = e.currentTarget;
                    const file = e.currentTarget.files[0];
                    let data = JSON.parse(await file.text());
                    reprocess.mutate(data, {
                      onSuccess: () => toast.success("Reprocess successfully"),
                      onError: (e) =>
                        toast.success("Reprocess failed", {
                          description: e.message,
                          duration: Infinity,
                          closeButton: true,
                        }),
                    });
                    target.value = "";
                  }
                }}
              />
            </label>
          </Button>
        </div>
      ) : null}

      {sessionSelect.isAdmin(session) ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            og.mutate({ id: check(saveIdRef.current).value });
          }}
        >
          <Input name="save-id" ref={saveIdRef} />
          <Button type="submit">Update OG</Button>
        </form>
      ) : null}
    </>
  );
};
