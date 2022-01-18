import { selectSession } from "@/features/account";
import { WorkerClient, useComputeOnSave } from "@/features/engine";
import { checkSave } from "@/services/rakalyApi";
import { Alert, Collapse } from "antd";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { useEu4Achievements, useEu4Meta } from "../../eu4Slice";
import { useUploadError } from "./uploadContext";
import { UploadFaq } from "./UploadFaq";
import { UploadForm } from "./UploadForm";

const saveHash = (worker: WorkerClient) => worker.eu4SaveHash();
export const UploadDrawerContent: React.FC<{}> = () => {
  const session = useSelector(selectSession);
  const uploadError = useUploadError();
  const sideBarContainerRef = useSideBarContainerRef();
  const [alreadyExistingSave, setAlreadyExistingSave] = useState<string>();
  // const { data: hash } = useComputeOnSave(saveHash);
  // const meta = useEu4Meta();
  // const achievements = useEu4Achievements();

  // useEffect(() => {
  //   async function effect() {
  //     if (hash === undefined) {
  //       return;
  //     }

  //     const response = await checkSave({
  //       hash,
  //       patch: meta.savegame_version,
  //       campaign_id: meta.campaign_id,
  //       score: achievements.score,
  //       achievement_ids: achievements.achievements.map((x) => x.id),
  //       playthrough_id: meta.playthroughId,
  //     })

  //     setAlreadyExistingSave(response.saves[0]?.id);
  //   }

  //   effect();
  // }, [hash, meta, achievements])

  return (
    <div className="flex-col gap" ref={sideBarContainerRef}>
      {session.kind !== "guest" ? null : (
        <Alert
          closable={true}
          type="info"
          showIcon={true}
          message="Did you know that all this analysis happens without the save leaving your computer? Pretty cool. Except sometimes you want to share a save with your friends or the world. If you want to share your save, register first. That way you can manage all your uploaded saves in one place."
        />
      )}

      {uploadError && (
        <Alert
          closable={true}
          type="error"
          showIcon={true}
          message={uploadError}
        />
      )}

      {alreadyExistingSave && (
        <Alert
          closable={true}
          type="info"
          showIcon={true}
          message={
            <Link href={`/eu4/saves/${alreadyExistingSave}`}>
              <a>This save has already been uploaded</a>
            </Link>
          }
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
