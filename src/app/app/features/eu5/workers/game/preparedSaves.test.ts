import { describe, expect, it, vi } from "vitest";
import { PreparedSaves } from "./preparedSaves";
describe("prepared save cache", () => {
  it("evicts the least recently used inactive save within the byte budget", () => {
    const release = vi.fn();
    const cache = new PreparedSaves<string>(release, 100, 3);
    cache.add("a", "a", 30);
    cache.add("b", "b", 30);
    cache.active = "a";
    cache.add("c", "c", 50);
    expect(release).toHaveBeenCalledWith("b");
    expect(cache.get("a")).toBe("a");
    expect(cache.bytes).toBe(80);
  });
  it("refuses preparation that would evict the active save", () => {
    const release = vi.fn();
    const cache = new PreparedSaves<string>(release, 100, 3);
    cache.add("a", "a", 80);
    cache.active = "a";
    expect(cache.makeRoom(30)).toBe(false);
    expect(release).not.toHaveBeenCalled();
  });
  it("bounds the count and refreshes recency on a cache hit", () => {
    const release = vi.fn();
    const cache = new PreparedSaves<string>(release, 100, 2);
    cache.add("a", "a", 1);
    cache.add("b", "b", 1);
    cache.get("a");
    cache.add("c", "c", 1);
    expect(release).toHaveBeenCalledWith("b");
    expect(cache.get("b")).toBeUndefined();
  });
  it("releases the old active save once a larger save must load", () => {
    const release = vi.fn();
    const cache = new PreparedSaves<string>(release, 100, 3);
    cache.add("a", "a", 80);
    cache.active = "a";
    cache.active = null;
    expect(cache.makeRoom(120)).toBe(false);
    expect(release).toHaveBeenCalledWith("a");
    expect(cache.bytes).toBe(0);
  });
});
