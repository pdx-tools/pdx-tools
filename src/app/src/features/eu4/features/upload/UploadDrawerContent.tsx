import { useProfileQuery } from "@/services/appApi";
import React from "react";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { useUploadError } from "./uploadContext";
import { UploadForm } from "./UploadForm";
import { Alert } from "@/components/Alert";

export const UploadDrawerContent = () => {
  const uploadError = useUploadError();
  const sideBarContainerRef = useSideBarContainerRef();
  const profileQuery = useProfileQuery();

  return (
    <div className="flex flex-col gap-2" ref={sideBarContainerRef}>
      {profileQuery.data === undefined || profileQuery.data.kind === "guest" ? (
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

      {uploadError && (
        <Alert className="px-4 py-2" variant="error">
          <Alert.Description>{uploadError}</Alert.Description>
        </Alert>
      )}

      <UploadForm />
    </div>
  );
};
