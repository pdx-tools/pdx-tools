import { createCompressionWorker } from "@/features/compress/compress-hooks";
import { type ContentType } from "../../../wasm-compress/pkg/wasm_compress";

export async function upload({
  data,
  dispatch,
  signal,
  url,
  fileMetadata,
}: {
  data: Uint8Array;
  dispatch: (arg: { kind: "progress"; progress: number }) => void;
  signal?: AbortSignal;
  url: string | URL;
  fileMetadata: (arg: { contentType: ContentType }) => object;
}) {
  const compression = createCompressionWorker();

  try {
    const body = new FormData();

    dispatch({ kind: "progress", progress: 10 });

    const compressProgress = (portion: number) => {
      const progress = 10 + (portion * 100) / (100 / (50 - 10));
      dispatch({ kind: "progress", progress });
    };

    const fileData = await compression.compress(
      new Uint8Array(data),
      compressProgress,
    );
    dispatch({ kind: "progress", progress: 50 });

    const blob = new Blob([fileData.data], {
      type: fileData.contentType,
    });

    const metadata = JSON.stringify(
      fileMetadata({ contentType: fileData.contentType }),
    );

    body.append("file", blob);
    body.append("metadata", metadata);

    return new Promise<unknown>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", url);

      request.upload.addEventListener("progress", function (e) {
        const percent_complete = (e.loaded / e.total) * 100;
        dispatch({
          kind: "progress",
          progress: 50 + percent_complete / 2,
        });
      });

      request.addEventListener("load", function () {
        if (request.status >= 200 && request.status < 300) {
          resolve(request.response as unknown);
        } else {
          try {
            const err = JSON.parse(request.response).msg;
            reject(new Error(err));
          } catch (_ex) {
            reject(new Error(`unknown error: ${request.response}`));
          }
        }
      });

      signal?.addEventListener("abort", () => {
        request.abort();
      });

      const onError = () => {
        reject(new Error("upload request errored"));
      };

      const onAbort = () => {
        reject(new Error("upload request aborted"));
      };

      request.addEventListener("error", onError);
      request.upload.addEventListener("error", onError);
      request.addEventListener("abort", onAbort);
      request.upload.addEventListener("abort", onAbort);

      request.send(body);
    });
  } finally {
    compression.release();
  }
}
