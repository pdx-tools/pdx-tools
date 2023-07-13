import React, { useCallback, useState } from "react";
import { Button, Input } from "antd";
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
    (ev: React.FormEvent<HTMLFormElement>) => {
      ev.preventDefault();
      const values = Object.fromEntries(new FormData(ev.currentTarget));
      setIsEditing(false);
      const id = serverFile?.id;
      if (id === undefined) {
        throw new Error("server file id can't be undefined");
      }
      patchSave.mutate({ id, aar: values.aar as string });
    },
    [serverFile, patchSave]
  );

  return (
    <form className="flex flex-col" onSubmit={handleSubmit}>
      <div className="flex items-center">
        <TextArea
          name="aar"
          defaultValue={defaultValue}
          autoSize={{ minRows: 8 }}
          maxLength={5000}
          showCount={isEditing}
          bordered={isEditing}
          readOnly={!isEditing}
          className="grow"
        />

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
    </form>
  );
};
