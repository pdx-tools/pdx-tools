import { useProfileQuery } from "@/services/appApi";
import { Button, Form, Input, Tooltip } from "antd";
import { useFileUpload, useUploadProgress } from "./uploadContext";
const { TextArea } = Input;

export const UploadForm = () => {
  const [form] = Form.useForm();
  const fileUpload = useFileUpload();
  const progress = useUploadProgress();
  const profileQuery = useProfileQuery();

  return (
    <Form form={form} layout="vertical" onFinish={fileUpload}>
      <Form.Item
        name="aar"
        label="AAR (optional)"
        tooltip="Share any plain text notes that you want preserved (eg: strategy, lucky breaks, AI did something). Or give a link to reddit for further discussion."
        rules={[
          { max: 5000, message: "Please keep AAR under 5000 characters" },
        ]}
      >
        <TextArea autoSize={{ minRows: 8 }} maxLength={5000} showCount={true} />
      </Form.Item>
      <Form.Item className="text-center">
        {/* The workaround to display a tooltip on a disabled button:
              https://github.com/react-component/tooltip/issues/18#issuecomment-650864750
          */}
        {profileQuery.data && profileQuery.data.kind == "user" ? (
          <Button
            htmlType="submit"
            type="primary"
            style={{ width: "300px" }}
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
                style={{ width: "300px", pointerEvents: "none" }}
                disabled={true}
              >
                Upload
              </Button>
            </span>
          </Tooltip>
        )}
      </Form.Item>
    </Form>
  );
};
