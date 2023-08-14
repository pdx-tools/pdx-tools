import React, { useCallback, useEffect, useRef } from "react";
import { useCompression } from "@/features/compress";
import type { SavePostResponse, UploadMetadaInput } from "@/pages/api/saves";
import { getEu4Worker } from "../../worker";
import { useSaveFilename } from "../../store";
import { invalidateSaves } from "@/services/appApi";

type Action =
  | {
      kind: "progress";
      progress: number;
    }
  | ({
      kind: "success";
    } & SavePostResponse)
  | {
      kind: "error";
      error: string;
    };

type Dispatch = (action: Action) => void;

type UploadState =
  | {
      kind: "initial";
    }
  | {
      kind: "uploading";
      progress: number;
    }
  | {
      kind: "error";
      error: string;
    }
  | ({
      kind: "success";
    } & SavePostResponse);

interface UploadContextData {
  dispatch: Dispatch;
  state: UploadState;
}

const UploadContext = React.createContext<UploadContextData | undefined>(
  undefined,
);

const uploadReducer = (_state: UploadState, action: Action): UploadState => {
  switch (action.kind) {
    case "progress": {
      return { kind: "uploading", progress: action.progress };
    }
    case "error": {
      return { kind: "error", error: action.error };
    }
    case "success": {
      return action;
    }
  }
};

interface UploadProviderProps {
  children: React.ReactNode;
}

export const UploadProvider = ({ children }: UploadProviderProps) => {
  const [state, dispatch] = React.useReducer(uploadReducer, {
    kind: "initial",
  });

  const value = { state, dispatch };
  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = React.useContext(UploadContext);
  if (context === undefined) {
    throw new Error("useUpload must be used within a UploadProvider");
  }
  return context;
};

export const useUploadProgress = () => {
  const { state } = useUpload();
  if (state.kind == "uploading") {
    return state.progress;
  } else {
    return undefined;
  }
};

export const useUploadError = () => {
  const { state } = useUpload();
  if (state.kind == "error") {
    return state.error;
  } else {
    return undefined;
  }
};

export const useUploadResponse = (): SavePostResponse | undefined => {
  const { state } = useUpload();
  if (state.kind == "success") {
    return state;
  } else {
    return undefined;
  }
};

interface UploadFormValues {
  aar?: string;
}

export const useFileUpload = () => {
  const compression = useCompression();
  const { dispatch } = useUpload();
  const uploadRequestRef = useRef<XMLHttpRequest | undefined>(undefined);
  const filename = useSaveFilename();

  useEffect(() => {
    return () => {
      uploadRequestRef.current?.abort();
    };
  }, [uploadRequestRef]);

  return useCallback(
    async (values: UploadFormValues) => {
      const worker = getEu4Worker();
      const data = new FormData();
      dispatch({ kind: "progress", progress: 5 });

      const rawFileData = await worker.getRawData();
      dispatch({ kind: "progress", progress: 10 });

      const compressProgress = (portion: number) => {
        const progress = 10 + (portion * 100) / (100 / (50 - 10));
        dispatch({ kind: "progress", progress });
      };

      const fileData = await compression.compress(
        new Uint8Array(rawFileData),
        compressProgress,
      );
      dispatch({ kind: "progress", progress: 50 });

      const blob = new Blob([fileData.data], {
        type: fileData.contentType,
      });

      const metadata = JSON.stringify({
        aar: values.aar,
        filename,
        content_type: fileData.contentType,
      } satisfies UploadMetadaInput);

      data.append("file", blob);
      data.append("metadata", metadata);

      const request = new XMLHttpRequest();
      uploadRequestRef.current = request;
      request.open("POST", "/api/saves");

      request.upload.addEventListener("progress", function (e) {
        const percent_complete = (e.loaded / e.total) * 100;
        dispatch({ kind: "progress", progress: 50 + percent_complete / 2 });
      });

      const completeRequest = () => {
        uploadRequestRef.current = undefined;
      };

      request.addEventListener("load", function (e) {
        completeRequest();
        if (request.status >= 200 && request.status < 300) {
          const response: SavePostResponse = JSON.parse(request.response);
          dispatch({ kind: "success", ...response });
          invalidateSaves();
        } else {
          try {
            const err = JSON.parse(request.response).msg;
            dispatch({ kind: "error", error: err });
          } catch (ex) {
            dispatch({ kind: "error", error: request.response });
          }
        }
      });

      const onError = () => {
        completeRequest();
        dispatch({ kind: "error", error: "request errored" });
      };

      const onAbort = () => {
        completeRequest();
        dispatch({ kind: "error", error: "request aborted" });
      };

      request.addEventListener("error", onError);
      request.upload.addEventListener("error", onError);
      request.addEventListener("abort", onAbort);
      request.upload.addEventListener("abort", onAbort);

      request.send(data);
    },
    [compression, uploadRequestRef, dispatch, filename],
  );
};
