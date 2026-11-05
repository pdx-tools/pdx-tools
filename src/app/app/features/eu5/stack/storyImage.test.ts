import { describe, expect, it } from "vitest";
import { wrapWords } from "./storyImage";

describe("wrapWords", () => {
  it("breaks at words, within the width", () => {
    const measure = (text: string) => text.length;
    expect(wrapWords(measure, "one two three four", 8)).toEqual(["one two", "three", "four"]);
  });
});
