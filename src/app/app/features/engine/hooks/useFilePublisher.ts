import type { FileKind } from "@/hooks/useFileDrop";
import { extensionType, useEngineActions } from "../engineStore";
import type { SaveGameInput } from "../engineStore";
import { localSaveInput, registerLocalSaves } from "@/features/campaign/localSaves";
import { localSaveName } from "@/features/campaign/types";
import type { LocalSaveRef } from "@/features/campaign/types";

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
    case "eu5": {
      if (input.kind === "handle") {
        const name = (await input.file.getFile()).name;
        return {
          kind: "eu5",
          data: {
            kind: "handle",
            file: input.file,
            name,
          },
        };
      } else {
        return {
          kind: "eu5",
          data: input,
        };
      }
    }
    case "ck3":
    case "hoi4":
    case "imperator": {
      const file = input.kind === "handle" ? await input.file.getFile() : input.file;
      return {
        kind: game,
        file,
      };
    }
    default: {
      const file = input.kind === "handle" ? await input.file.getFile() : input.file;
      return {
        kind: game,
        file,
      };
    }
  }
}

type ResolvedFile = { input: AnalyzeInput; ref: LocalSaveRef; lastModified: number };

async function resolveFile(input: AnalyzeInput): Promise<ResolvedFile> {
  if (input.kind === "file") {
    return { input, ref: input, lastModified: input.file.lastModified };
  }
  const file = await input.file.getFile();
  const ref: LocalSaveRef = { kind: "handle", file: input.file, name: file.name };
  return { input, ref, lastModified: file.lastModified };
}

/**
 * Open the save the player gave the page. Of several files, the file that
 * the game wrote last opens. The saves of its game join the campaign. The
 * timeline can step to them when the page has read their headers.
 */
async function publishFiles(inputs: AnalyzeInput[]): Promise<SaveGameInput | null> {
  // A file that the page cannot read does not stop the other files.
  const results = await Promise.allSettled(inputs.map(resolveFile));
  const files = results.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
  if (files.length === 0) {
    const failure = results.find((x) => x.status === "rejected");
    if (failure !== undefined) throw failure.reason;
  }
  const latest = files.reduce<ResolvedFile | null>(
    (best, file) => (best === null || file.lastModified > best.lastModified ? file : best),
    null,
  );
  if (latest === null) return null;

  const game = extensionType(localSaveName(latest.ref));
  if (game !== "eu4" && game !== "eu5") {
    return inputSaveGame(latest.input);
  }

  const ofGame = files.filter((file) => extensionType(localSaveName(file.ref)) === game);
  const entries = await registerLocalSaves(
    game,
    ofGame.map((file) => file.ref),
  );
  // Open through the entry's reference, so the campaign knows which of its
  // files is open.
  const opened = entries[ofGame.indexOf(latest)];
  return localSaveInput(game, opened.ref);
}

export function useFilePublisher() {
  const { fileInput } = useEngineActions();
  return async (input: AnalyzeInput | AnalyzeInput[]) => {
    const save = await publishFiles(Array.isArray(input) ? input : [input]);
    if (save !== null) fileInput(save);
  };
}
