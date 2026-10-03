import type { FileKind } from "@/hooks/useFileDrop";
import { extensionType, useEngineActions } from "../engineStore";
import type { SaveGameInput } from "../engineStore";
import { registerLocalSaves } from "@/features/campaign/localSaves";
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

type ResolvedFile = { input: AnalyzeInput; name: string; lastModified: number };

async function resolveFile(input: AnalyzeInput): Promise<ResolvedFile> {
  const file = input.kind === "handle" ? await input.file.getFile() : input.file;
  return { input, name: file.name, lastModified: file.lastModified };
}

function toLocalRef({ input, name }: ResolvedFile): LocalSaveRef {
  return input.kind === "handle"
    ? { kind: "handle", handle: input.file, name }
    : { kind: "file", file: input.file };
}

function fromLocalRef(ref: LocalSaveRef): AnalyzeInput {
  return ref.kind === "handle" ? { kind: "handle", file: ref.handle } : ref;
}

/**
 * Open the save the player gave the page. Of several files, the one that
 * the game wrote last opens; the saves of its game join the campaign, so
 * that the timeline can step to them once their headers are read.
 */
async function publishFiles(inputs: AnalyzeInput[]): Promise<SaveGameInput | null> {
  const files = await Promise.all(inputs.map(resolveFile));
  const latest = files.reduce<ResolvedFile | null>(
    (best, file) => (best === null || file.lastModified > best.lastModified ? file : best),
    null,
  );
  if (latest === null) return null;

  const game = extensionType(latest.name);
  if (game !== "eu4" && game !== "eu5") {
    return inputSaveGame(latest.input);
  }

  const ofGame = files.filter((file) => extensionType(file.name) === game);
  const entries = await registerLocalSaves(game, ofGame.map(toLocalRef));
  // Open through the entry's reference, so the campaign knows which of its
  // files is open.
  const opened = entries[ofGame.indexOf(latest)];
  return inputSaveGame(fromLocalRef(opened.ref));
}

export function useFilePublisher() {
  const { fileInput } = useEngineActions();
  return async (input: AnalyzeInput | AnalyzeInput[]) => {
    const save = await publishFiles(Array.isArray(input) ? input : [input]);
    if (save !== null) fileInput(save);
  };
}
