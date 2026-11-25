import { DeleteKeptDialog } from "./DeleteKeptDialog";
import { useKeptUi } from "./ui";
import { UploadKept } from "./UploadKeptDialog";

/** Dialogs at the root, so that an upload continues when its list closes. */
export default function KeptDialogs() {
  const remove = useKeptUi((state) => state.remove);
  return (
    <>
      <UploadKept />
      {remove !== null && <DeleteKeptDialog saves={remove} />}
    </>
  );
}
