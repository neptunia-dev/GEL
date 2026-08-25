import { describe, expect, it } from "vitest";
import { FileSystemError, VirtualPath } from "../../src/filesystem";

describe("VirtualPath", () => {
  it("normalizes separators and dot segments", () => {
    const path = VirtualPath.parse(".\\scenes/./chapter/../prologue.lua");

    expect(path.value).toBe("scenes/prologue.lua");
    expect(path.parent()?.value).toBe("scenes");
    expect(path.basename()).toBe("prologue.lua");
    expect(path.extension()).toBe(".lua");
  });

  it("supports root and relative joins", () => {
    expect(VirtualPath.root().isRoot).toBe(true);
    expect(VirtualPath.root().join("assets", "bg.png").value).toBe("assets/bg.png");
    expect(VirtualPath.parse("scenes").join("chapter", "..", "start.lua").value).toBe(
      "scenes/start.lua",
    );
    expect(VirtualPath.root().parent()).toBeNull();
  });

  it("rejects absolute paths, NUL bytes and root escape", () => {
    for (const input of ["/start.lua", "C:\\game\\start.lua", "../start.lua", "a\0b.lua", ""]) {
      expect(() => VirtualPath.parse(input)).toThrowError(
        expect.objectContaining({ code: "INVALID_PATH" }),
      );
    }
    expect(() => VirtualPath.root().join("/absolute.lua")).toThrow(FileSystemError);
    expect(() => VirtualPath.root().join("..", "outside.lua")).toThrow(FileSystemError);
  });

  it("compares normalized values and serializes as a string", () => {
    const first = VirtualPath.parse("scenes\\start.lua");
    const second = VirtualPath.parse("./scenes/start.lua");

    expect(first.equals(second)).toBe(true);
    expect(JSON.stringify(first)).toBe('"scenes/start.lua"');
  });
});
