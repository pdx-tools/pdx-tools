import { useProfileQuery } from "@/services/appApi";
import { Collapse } from "antd";
import React from "react";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { useUploadError } from "./uploadContext";
import { UploadFaq } from "./UploadFaq";
import { UploadForm } from "./UploadForm";
import { Alert, AlertDescription } from "@/components/Alert";

export const UploadDrawerContent = () => {
  const uploadError = useUploadError();
  const sideBarContainerRef = useSideBarContainerRef();
  const profileQuery = useProfileQuery();

  return (
    <div className="flex flex-col gap-2" ref={sideBarContainerRef}>
      {profileQuery.data === undefined || profileQuery.data.kind === "guest" ? (
        <Alert className="px-4 py-2" variant="info">
          <AlertDescription>
            Did you know that all this analysis happens without the save leaving
            your computer? Pretty cool. Except sometimes you want to share a
            save with your friends or the world. If you want to share your save,
            register first. That way you can manage all your uploaded saves in
            one place.
          </AlertDescription>
        </Alert>
      ) : null}

      {uploadError && (
        <Alert className="px-4 py-2" variant="error">
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}

      <UploadForm />
      <Collapse defaultActiveKey={[]} ghost>
        <Collapse.Panel header="FAQ" key="1">
          <UploadFaq />
        </Collapse.Panel>
      </Collapse>
    </div>
  );
};
