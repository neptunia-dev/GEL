import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DirectoryFileSystem } from "../../src/filesystem";

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("DirectoryFileSystem", () => {
  it("reads files and recursively lists a development directory", () => {
    const root = mkdtempSync(join(tmpdir(), "gel-filesystem-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "scenes"));
    writeFileSync(join(root, "manifest.json"), "{\"entryScene\":\"start\"}", "utf8");
    writeFileSync(join(root, "scenes", "start.lua"), "return function(ctx) end", "utf8");

    const files = new DirectoryFileSystem(root);

    expect(files.hasFile("manifest.json")).toBe(true);
    expect(files.readText("scenes/start.lua")).toBe("return function(ctx) end");
    expect(files.listFiles().map(String)).toEqual(["manifest.json", "scenes/start.lua"]);
    expect(files.listFiles("scenes").map(String)).toEqual(["scenes/start.lua"]);
    expect(files.listFiles("missing")).toEqual([]);
  });

  it("maps missing paths, directories and invalid roots to filesystem errors", () => {
    const root = mkdtempSync(join(tmpdir(), "gel-filesystem-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "scenes"));
    writeFileSync(join(root, "start.lua"), "start", "utf8");
    const files = new DirectoryFileSystem(root);

    expect(() => files.readFile("missing.lua")).toThrowError(
      expect.objectContaining({ code: "FILE_NOT_FOUND" }),
    );
    expect(() => files.readFile("scenes")).toThrowError(
      expect.objectContaining({ code: "NOT_A_FILE" }),
    );
    expect(() => files.readFile(".")).toThrowError(
      expect.objectContaining({ code: "NOT_A_FILE" }),
    );
    expect(() => new DirectoryFileSystem(join(root, "missing"))).toThrowError(
      expect.objectContaining({ code: "INVALID_ROOT" }),
    );
  });
});
