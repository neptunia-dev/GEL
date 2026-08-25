import { describe, expect, it } from "vitest";
import { FileSystemError, MemoryFileSystem, VirtualPath } from "../../src/filesystem";

describe("MemoryFileSystem", () => {
  it("reads text and bytes without exposing internal storage", () => {
    const source = new Uint8Array([1, 2, 3]);
    const files = new MemoryFileSystem({
      "scenes/start.lua": "return function(ctx) end",
      "assets/data.bin": source,
    });

    source[0] = 9;
    const bytes = files.readFile("assets/data.bin");
    bytes[1] = 8;

    expect([...files.readFile("assets/data.bin")]).toEqual([1, 2, 3]);
    expect(files.readText("scenes\\start.lua")).toBe("return function(ctx) end");
    expect(files.hasFile("scenes/start.lua")).toBe(true);
    expect(files.hasFile("scenes")).toBe(false);
  });

  it("lists only matching files in stable order", () => {
    const files = new MemoryFileSystem({
      "scenes/z.lua": "z",
      "scenes/a.lua": "a",
      "assets/bg.png": "bg",
      scenes: "file named scenes",
    });

    expect(files.listFiles().map(String)).toEqual([
      "assets/bg.png",
      "scenes",
      "scenes/a.lua",
      "scenes/z.lua",
    ]);
    expect(files.listFiles("scenes").map(String)).toEqual(["scenes", "scenes/a.lua", "scenes/z.lua"]);
    expect(files.listFiles(VirtualPath.parse("missing"))).toEqual([]);
  });

  it("reports invalid reads and duplicate normalized paths", () => {
    const files = new MemoryFileSystem({ "start.lua": "start" });

    expect(() => files.readFile("missing.lua")).toThrowError(
      expect.objectContaining({ code: "FILE_NOT_FOUND" }),
    );
    expect(() => files.readFile(VirtualPath.root())).toThrowError(
      expect.objectContaining({ code: "NOT_A_FILE" }),
    );
    expect(() => new MemoryFileSystem([
      ["a/../start.lua", "one"],
      ["start.lua", "two"],
    ])).toThrowError(expect.objectContaining({ code: "INVALID_PATH" }));
  });

  it("rejects invalid UTF-8 text", () => {
    const files = new MemoryFileSystem({ "invalid.txt": new Uint8Array([0xc3, 0x28]) });

    expect(() => files.readText("invalid.txt")).toThrowError(
      expect.objectContaining({ code: "INVALID_TEXT" }),
    );
    expect(files.readFile("invalid.txt")).toBeInstanceOf(Uint8Array);
    expect(FileSystemError).toBeDefined();
  });
});
