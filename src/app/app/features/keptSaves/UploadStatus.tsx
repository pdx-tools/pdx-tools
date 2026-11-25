import { Link } from "@/components/Link";
import type { KeptSave } from "./types";
import { useKeptUi } from "./ui";

/** The upload of a kept save, in its row. */
export function UploadStatus({ save }: { save: KeptSave }) {
  const upload = useKeptUi((state) => state.uploads[save.hash]);
  if (upload?.kind === "uploading") {
    const percent = Math.round(upload.progress);
    return (
      <div>
        <p aria-live="polite">Uploading, {percent}%</p>
        <progress
          aria-label="Upload"
          value={percent}
          max={100}
          className="h-1.5 w-full overflow-hidden rounded-full accent-sky-700"
        />
      </div>
    );
  }
  if (save.uploadedId !== null) {
    return (
      <p>
        <Link href={`/${save.game}/saves/${save.uploadedId}`} target="_blank">
          Uploaded, open permalink
        </Link>
      </p>
    );
  }
  if (upload?.kind === "duplicate") return <p>The server already has this save.</p>;
  if (upload?.kind === "failed")
    return (
      <p className="text-red-700 in-data-game-theme:text-game-err dark:text-red-400">
        {upload.message}
      </p>
    );
  return null;
}
