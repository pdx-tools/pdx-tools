import { extensionType, SaveGameInput, useEngineActions } from "../engineStore";

export type AnalyzeInput = { file: File };

function inputSaveGame(input: AnalyzeInput): SaveGameInput {
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

export function useFilePublisher() {
  const { fileInput } = useEngineActions();
  return (input: AnalyzeInput) => fileInput(inputSaveGame(input));
}
