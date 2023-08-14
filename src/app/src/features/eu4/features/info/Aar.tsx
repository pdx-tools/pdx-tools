import React, { useCallback, useState } from "react";
import { EditOutlined } from "@ant-design/icons";
import { useServerSaveFile } from "../../store";
import { useSavePatch } from "@/services/appApi";
import { Button } from "@/components/Button";
import { cx } from "class-variance-authority";

interface AarProps {
  defaultValue?: string;
  editMode: "always" | "privileged" | "never";
}

export const Aar = ({ defaultValue, editMode }: AarProps) => {
  const [isEditing, setIsEditing] = useState(
    editMode == "always" || !defaultValue,
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
    [serverFile, patchSave],
  );

  return (
    <form className="flex flex-col gap-y-2" onSubmit={handleSubmit}>
      <div className="flex items-center">
        <textarea
          name="aar"
          defaultValue={defaultValue}
          rows={8}
          maxLength={5000}
          readOnly={!isEditing}
          className={cx("grow", isEditing ? "border" : "")}
        />

        {editMode == "privileged" && (
          <Button variant="ghost" onClick={() => setIsEditing(!isEditing)}>
            <EditOutlined />
            <span className="sr-only">Toggle AAR edit</span>
          </Button>
        )}
      </div>

      {isEditing && (
        <Button
          type="submit"
          variant="primary"
          className="w-48 justify-center self-center"
        >
          Update
        </Button>
      )}
    </form>
  );
};
