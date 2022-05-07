import React, { useCallback, useState } from "react";
import { Button, Form, Input } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { appApi } from "@/services/appApi";
import { useAppSelector } from "@/lib/store";

const { TextArea } = Input;

interface AarProps {
  defaultValue?: string;
  editMode: "always" | "privileged" | "never";
}

export const Aar = ({ defaultValue, editMode }: AarProps) => {
  const [isEditing, setIsEditing] = useState(
    editMode == "always" || !defaultValue
  );
  const [triggerPatchSave] = appApi.endpoints.patchSave.useMutation();
  const serverFile = useAppSelector((state) => state.eu4.serverSaveFile);

  const handleSubmit = useCallback(
    (values: { aar: string }) => {
      setIsEditing(false);
      const id = serverFile?.id;
      if (id === undefined) {
        throw new Error("server file id can't be undefined");
      }
      triggerPatchSave({ id, aar: values.aar });
    },
    [serverFile, triggerPatchSave]
  );

  return (
    <Form
      layout="vertical"
      style={{ display: "flex", flexFlow: "column" }}
      initialValues={{ aar: defaultValue }}
      onFinish={handleSubmit}
    >
      <div className="flex-row">
        <Form.Item name="aar" noStyle>
          <TextArea
            autoSize={{ minRows: 8 }}
            maxLength={5000}
            showCount={isEditing}
            bordered={isEditing}
            readOnly={!isEditing}
            className="grow"
          />
        </Form.Item>

        {editMode == "privileged" && (
          <Button
            type="text"
            onClick={() => setIsEditing(!isEditing)}
            icon={<EditOutlined />}
          />
        )}
      </div>

      {isEditing && (
        <Button htmlType="submit" type="primary">
          Update
        </Button>
      )}
    </Form>
  );
};
