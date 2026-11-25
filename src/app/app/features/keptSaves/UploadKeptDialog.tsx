import { useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Link } from "@/components/Link";
import { steamLoginHref } from "@/components/layout/auth/SteamButton";
import { useSession } from "@/features/account";
import { hasFeature, hasPermission } from "@/lib/auth";
import { DISCORD_INVITE_URL } from "@/lib/links";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { pdxApi } from "@/services/appApi";
import { keptFile } from "./bytes";
import { useProtectedWork } from "./protectedWork";
import { commitButton } from "./styles";
import { COPY_MISSING, formatBytes, formatPageDate, OVERWRITTEN_FILE } from "./text";
import type { KeptSave } from "./types";
import { beginUpload, returnFocus, setUpload, useKeptUi } from "./ui";
import { useKeptFile } from "./useKeptFile";
import { recordUpload } from "./watchService";

function uploadFailure(error: unknown) {
  const message = getErrorMessage(error);
  if (message === "save already exists") return { kind: "duplicate" } as const;
  const text =
    message === "upload request errored"
      ? "Not uploaded: the server could not be reached. Try again."
      : message;
  return { kind: "failed", message: text } as const;
}

/** Send one kept copy. The row of the save shows the progress. */
function useUploadKept() {
  const eu4 = pdxApi.saves.useAdd();
  const eu5 = pdxApi.eu5Saves.useAdd();
  return async (save: KeptSave, aar: string) => {
    const { hash, game, name: filename } = save;
    const end = beginUpload();
    if (end === null) return;
    let shown = -1;
    const onProgress = (progress: number) => {
      // Render only when the percent changes.
      if (Math.round(progress) === shown) return;
      shown = Math.round(progress);
      setUpload(hash, { kind: "uploading", progress });
    };
    onProgress(0);
    try {
      const file = await keptFile(hash);
      if (file === null) throw new Error(COPY_MISSING);
      const { save_id } =
        game === "eu4"
          ? await eu4.mutateAsync({
              values: { aar, filename },
              source: { file, hash },
              dispatch: ({ progress }) => onProgress(progress),
            })
          : await eu5.mutateAsync({
              save: { kind: "file", file },
              hash,
              filename,
              dispatch: onProgress,
            });
      await recordUpload(hash, save_id);
      setUpload(hash, null);
    } catch (error) {
      setUpload(hash, uploadFailure(error));
    } finally {
      end();
    }
  };
}

export function UploadKept() {
  const save = useKeptUi((state) => state.upload);
  const isUploading = useKeptUi((state) =>
    Object.values(state.uploads).some((x) => x.kind === "uploading"),
  );
  const upload = useUploadKept();
  useProtectedWork(isUploading || save !== null);
  const close = () => useKeptUi.setState({ upload: null });
  if (save === null) return null;
  return (
    <Dialog open onOpenChange={close}>
      <Dialog.Content onCloseAutoFocus={returnFocus}>
        <UploadForm
          key={save.hash}
          save={save}
          onCancel={close}
          onSubmit={(aar) => {
            close();
            void upload(save, aar);
          }}
        />
      </Dialog.Content>
    </Dialog>
  );
}

function UploadForm({
  save,
  onCancel,
  onSubmit,
}: {
  save: KeptSave;
  onCancel: () => void;
  onSubmit: (aar: string) => void;
}) {
  const [aar, setAar] = useState("");
  const session = useSession();
  const file = useKeptFile(save.hash);
  const isLoggedIn = session.id !== undefined;
  const isAllowed =
    save.game === "eu4"
      ? hasPermission(session, "savefile:create")
      : isLoggedIn && hasFeature(session, "eu5-upload");
  const returnTo = `${window.location.pathname}${window.location.search}`;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (isAllowed) onSubmit(aar);
      }}
    >
      <Dialog.Title className="pr-6 break-words">
        Upload {save.countryName && `${save.countryName}, `}
        {formatPageDate(save.date)}
      </Dialog.Title>
      <Dialog.Description className="break-words">
        {save.name}, {formatBytes(save.size)}, from the kept copy.
        {file === "overwritten" && ` ${OVERWRITTEN_FILE}`}
      </Dialog.Description>
      {isAllowed ? (
        <>
          {save.game === "eu4" && (
            <label>
              AAR (optional):
              <textarea
                value={aar}
                onChange={(event) => setAar(event.currentTarget.value)}
                maxLength={5000}
                rows={4}
                className="mt-1 w-full border px-2 py-1 dark:border-gray-600"
              />
            </label>
          )}
          <p className="text-sm">
            {save.game === "eu4"
              ? "Uploaded saves are public, and eligible saves enter achievement leaderboards."
              : "Uploaded saves are public."}
          </p>
        </>
      ) : (
        <p className="border-2 border-sky-200 bg-sky-100 px-4 py-2 text-sm leading-relaxed text-gray-900">
          {isLoggedIn ? (
            <>
              EU5 sharing is switched on per Steam account during the beta.{" "}
              <Link href={DISCORD_INVITE_URL} target="_blank">
                Ask on Discord
              </Link>{" "}
              and an admin enables it.
            </>
          ) : (
            "Log in with Steam to upload. Logging in leaves this page, so watching stops until you come back. Kept saves stay here."
          )}
        </p>
      )}
      <Dialog.Footer>
        <Button onClick={onCancel}>Cancel</Button>
        {isAllowed ? (
          <Button type="submit" variant="primary" className={commitButton}>
            Upload save
          </Button>
        ) : (
          !isLoggedIn && (
            <Button asChild variant="primary" className={commitButton}>
              <a href={steamLoginHref(returnTo)}>Log in with Steam</a>
            </Button>
          )
        )}
      </Dialog.Footer>
    </form>
  );
}
