import { FileKind } from "@/hooks/useFileDrop";
import { extensionType, SaveGameInput, useEngineActions } from "../engineStore";

type AnalyzeInput = FileKind;

async function inputSaveGame(input: AnalyzeInput): Promise<SaveGameInput> {
  const game = extensionType(input.file.name);
  switch (game) {
    case "vic3":
    case "eu4": {
      if (input.kind === "handle") {
        const name = (await input.file.getFile()).name;
        return {
          kind: game,
          data: {
            kind: "handle",
            file: input.file,
            name,
          },
        };
      } else {
        return {
          kind: game,
          data: input,
        };
      }
    }
    default: {
      const file =
        input.kind === "handle" ? await input.file.getFile() : input.file;
      return {
        kind: game,
        file,
      };
    }
  }
}

export function useFilePublisher() {
  const { fileInput } = useEngineActions();
  return (input: AnalyzeInput) => inputSaveGame(input).then(fileInput);
}
