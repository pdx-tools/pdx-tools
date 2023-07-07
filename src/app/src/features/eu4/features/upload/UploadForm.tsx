import { useProfileQuery } from "@/services/appApi";
import { useFileUpload, useUploadProgress } from "./uploadContext";
import { Button } from "@/components/Button";
import { Tooltip } from "@/components/Tooltip";
import { UploadFaq } from "./UploadFaq";

export const UploadForm = () => {
  const fileUpload = useFileUpload();
  const progress = useUploadProgress();
  const profileQuery = useProfileQuery();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        const values = Object.fromEntries(new FormData(ev.currentTarget));
        fileUpload({ aar: values.aar as string });
      }}
    >
      <label>
        <div>AAR (optional):</div>
        <textarea
          maxLength={5000}
          name="aar"
          rows={8}
          className="w-full border"
        />
      </label>
      <div className="flex justify-center">
        <div>
          {profileQuery.data && profileQuery.data.kind == "user" ? (
            <Button
              type="submit"
              variant="primary"
              className="w-48 justify-center"
              disabled={progress != undefined}
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
  );
};
