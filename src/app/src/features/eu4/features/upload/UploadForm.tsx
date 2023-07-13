import { useProfileQuery } from "@/services/appApi";
import { Button, Input, Tooltip } from "antd";
import { useFileUpload, useUploadProgress } from "./uploadContext";
const { TextArea } = Input;

export const UploadForm = () => {
  const fileUpload = useFileUpload();
  const progress = useUploadProgress();
  const profileQuery = useProfileQuery();

  return (
    <form
      className="flex flex-col"
      onSubmit={(ev) => {
        ev.preventDefault();
        const values = Object.fromEntries(new FormData(ev.currentTarget));
        fileUpload({ aar: values.aar as string });
      }}
    >
      <label>
        <div>AAR (optional):</div>
        <TextArea
          name="aar"
          autoSize={{ minRows: 8 }}
          maxLength={5000}
          showCount={true}
        />
      </label>
      <div className="text-center">
        {/* The workaround to display a tooltip on a disabled button:
              https://github.com/react-component/tooltip/issues/18#issuecomment-650864750
          */}
        {profileQuery.data && profileQuery.data.kind == "user" ? (
          <Button
            htmlType="submit"
            type="primary"
            className="w-48"
            disabled={progress != undefined}
          >
            Upload
          </Button>
        ) : (
          <Tooltip title="Register an account to upload">
            <span className="cursor-not-allowed">
              <Button
                htmlType="submit"
                type="primary"
                className="pointer-events-none w-48"
                disabled={true}
              >
                Upload
              </Button>
            </span>
          </Tooltip>
        )}
      </div>
    </form>
  );
};
