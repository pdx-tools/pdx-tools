import { FileKind } from "@/hooks/useFileDrop";
import { extensionType, SaveGameInput, useEngineActions } from "../engineStore";

type AnalyzeInput = FileKind;

async function inputSaveGame(input: AnalyzeInput[]): Promise<SaveGameInput> {
  const first = input[0];
  const game = extensionType(first.file.name);
  switch (game) {
    case "eu4": {
      const files = input.map((x) => x.file);
      if (first.kind === "handle") {
        const name = (await first.file.getFile()).name;
        return {
          kind: game,
          data: {
            kind: "handle",
            file: first.file,
            name,
            files,
          },
        };
      } else {
        return {
          kind: game,
          data: {
            ...first,
            files,
          },
        };
      }
    }
    case "vic3": {
      if (first.kind === "handle") {
        const name = (await first.file.getFile()).name;
        return {
          kind: game,
          data: {
            kind: "handle",
            file: first.file,
            name,
          },
        };
      } else {
        return {
          kind: game,
          data: first,
        };
      }
    }
    default: {
      const file =
        first.kind === "handle" ? await first.file.getFile() : first.file;
      return {
        kind: game,
        file,
      };
    }
  }
}

export function useFilePublisher() {
  const { fileInput } = useEngineActions();
  return (input: AnalyzeInput[]) => inputSaveGame(input).then(fileInput);
}
