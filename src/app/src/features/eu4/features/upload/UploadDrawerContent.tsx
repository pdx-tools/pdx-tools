import { useProfileQuery } from "@/services/appApi";
import { Alert, Collapse } from "antd";
import React from "react";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { useUploadError } from "./uploadContext";
import { UploadFaq } from "./UploadFaq";
import { UploadForm } from "./UploadForm";

export const UploadDrawerContent = () => {
  const uploadError = useUploadError();
  const sideBarContainerRef = useSideBarContainerRef();
  const profileQuery = useProfileQuery();

  return (
    <div className="flex flex-col gap-2" ref={sideBarContainerRef}>
      {profileQuery.data === undefined || profileQuery.data.kind === "guest" ? (
        <Alert
          closable={true}
          type="info"
          showIcon={true}
          message="Did you know that all this analysis happens without the save leaving your computer? Pretty cool. Except sometimes you want to share a save with your friends or the world. If you want to share your save, register first. That way you can manage all your uploaded saves in one place."
        />
      ) : null}

      {uploadError && (
        <Alert
          closable={true}
          type="error"
          showIcon={true}
          message={uploadError}
        />
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
