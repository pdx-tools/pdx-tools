import { pdxApi, sessionSelect } from "@/services/appApi";
import React from "react";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Tooltip } from "@/components/Tooltip";
import { UploadFaq } from "./UploadFaq";
import { FileUploadMutation } from "./hooks";
import { useSession } from "@/features/account";

export const UploadDrawerContent = ({
  fileUpload,
}: {
  fileUpload: FileUploadMutation;
}) => {
  const sideBarContainerRef = useSideBarContainerRef();
  const session = useSession();

  return (
    <div className="flex flex-col gap-2" ref={sideBarContainerRef}>
      {!sessionSelect.isLoggedIn(session) ? (
        <Alert className="px-4 py-2" variant="info">
          <Alert.Description>
            Did you know that all this analysis happens without the save leaving
            your computer? Pretty cool. Except sometimes you want to share a
            save with your friends or the world. If you want to share your save,
            register first. That way you can manage all your uploaded saves in
            one place.
          </Alert.Description>
        </Alert>
      ) : null}

      <Alert.Error className="px-4 py-2" msg={fileUpload.error} />

      <form
        className="flex flex-col gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const values = Object.fromEntries(new FormData(ev.currentTarget));
          fileUpload.upload({ aar: values.aar as string });
        }}
      >
        <label>
          <div>AAR (optional):</div>
          <textarea
            maxLength={5000}
            name="aar"
            rows={8}
            className="w-full border px-2 py-1 dark:border-gray-600"
          />
        </label>
        <div className="flex justify-center">
          <div>
            {sessionSelect.isLoggedIn(session) ? (
              <Button
                type="submit"
                variant="primary"
                className="w-48 justify-center"
                disabled={fileUpload.isPending}
              >
                Upload
              </Button>
            ) : (
              <Tooltip>
                <Tooltip.Trigger asChild>
                  <span tabIndex={0}>
                    <Button
                      type="submit"
                      variant="primary"
                      className="pointer-events-none w-48 justify-center"
                      disabled={true}
                    >
                      Upload
                    </Button>
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content>Register an account to upload</Tooltip.Content>
              </Tooltip>
            )}
          </div>
        </div>

        <details>
          <summary>FAQ</summary>
          <UploadFaq />
        </details>
      </form>
    </div>
  );
};
