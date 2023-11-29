import { Alert } from "@/components/Alert";
import { pdxApi, sessionSelect } from "@/services/appApi";
import { Button } from "@/components/Button";
import React, { useState } from "react";

export const AccountContent = () => {
  const [key, setKey] = useState<string | undefined>();
  const newKey = pdxApi.apiKey.useGenerateKey(setKey);
  const session = pdxApi.session.useCurrent();
  const rebalance = pdxApi.saves.useRebalance();
  const reprocess = pdxApi.saves.useReprocess();

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
        <Button className="mt-2" onClick={() => newKey.mutate()}>
          Generate
        </Button>
      </div>
      {sessionSelect.isAdmin(session) ? (
        <div className="flex flex-col w-60">
          <Button
            variant="primary"
            onClick={() =>
              rebalance.mutate(undefined, {
                onSuccess: () => alert("success"),
                onError: () => alert("failure"),
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
                onChange={async (e) => {
                  if (e.currentTarget.files && e.currentTarget.files[0]) {
                    const target = e.currentTarget;
                    const file = e.currentTarget.files[0];
                    let data = JSON.parse(await file.text());
                    reprocess.mutate(data, {
                      onSuccess: () => alert("success"),
                      onError: () => alert("failure"),
                    });
                    target.value = "";
                  }
                }}
              />
            </label>
          </Button>
        </div>
      ) : null}
    </>
  );
};
