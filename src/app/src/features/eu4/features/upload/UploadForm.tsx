import { selectSession } from "@/features/account";
import { Button, Form, Input, Tooltip } from "antd";
import { useSelector } from "react-redux";
import { useFileUpload, useUploadProgress } from "./uploadContext";
const { TextArea } = Input;

export const UploadForm: React.FC<{}> = () => {
  const [form] = Form.useForm();
  const fileUpload = useFileUpload();
  const session = useSelector(selectSession);
  const progress = useUploadProgress();

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
      <Form.Item style={{ textAlign: "center" }}>
        {/* The workaround to display a tooltip on a disabled button:
              https://github.com/react-component/tooltip/issues/18#issuecomment-650864750
          */}
        {session.kind != "guest" ? (
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
            <span style={{ cursor: "not-allowed" }}>
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
