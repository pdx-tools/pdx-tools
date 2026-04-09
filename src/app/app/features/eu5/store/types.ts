export type Eu5SaveInput =
  | { kind: "file"; file: File }
  | { kind: "handle"; file: FileSystemFileHandle; name: string };
