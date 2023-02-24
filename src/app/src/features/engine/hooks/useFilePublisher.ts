import { extensionType, SaveGameInput, useEngineActions } from "../engineStore";

export type AnalyzeInput =
  | { kind: "local"; file: File }
  | { kind: "server"; saveId: string }
  | { kind: "skanderbeg"; skanId: string };

function inputSaveGame(input: AnalyzeInput): SaveGameInput {
  switch (input.kind) {
    case "local": {
      const game = extensionType(input.file.name);
      if (game === "eu4") {
        return {
          kind: game,
          data: {
            kind: "local",
            file: input.file,
          },
        };
      } else {
        return {
          kind: game,
          file: input.file,
        };
      }
    }
    case "server":
    case "skanderbeg": {
      return { kind: "eu4", data: input };
    }
  }
}

export function useFilePublisher() {
  const { fileInput } = useEngineActions();
  return (input: AnalyzeInput) => fileInput(inputSaveGame(input));
}
