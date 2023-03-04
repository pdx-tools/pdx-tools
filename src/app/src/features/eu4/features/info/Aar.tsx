import React, { useCallback, useState } from "react";
import { Button, Form, Input } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useServerSaveFile } from "../../store";
import { useSavePatch } from "@/services/appApi";

const { TextArea } = Input;

interface AarProps {
  defaultValue?: string;
  editMode: "always" | "privileged" | "never";
}

export const Aar = ({ defaultValue, editMode }: AarProps) => {
  const [isEditing, setIsEditing] = useState(
    editMode == "always" || !defaultValue
  );
  const patchSave = useSavePatch();
  const serverFile = useServerSaveFile();

  const handleSubmit = useCallback(
    (values: { aar: string }) => {
      setIsEditing(false);
      const id = serverFile?.id;
      if (id === undefined) {
        throw new Error("server file id can't be undefined");
      }
      patchSave.mutate({ id, aar: values.aar });
    },
    [serverFile, patchSave]
  );

  return (
    <Form
      layout="vertical"
      className="flex flex-col"
      initialValues={{ aar: defaultValue }}
      onFinish={handleSubmit}
    >
      <div className="flex items-center">
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
