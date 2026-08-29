import { describe, expect, it } from "vitest";
import { RouteTable } from "../../src/package";

describe("RouteTable", () => {
  it("resolves normalized route ports and exposes route queries", () => {
    const routes = new RouteTable({
      prologue: {
        " continue ": "chapter-one",
        retry: "prologue",
      },
      "ending": {},
    });

    expect(routes.resolve("prologue", " continue ")).toBe("chapter-one");
    expect(routes.resolve("prologue", "retry")).toBe("prologue");
    expect(routes.resolve("prologue", "missing")).toBeUndefined();
    expect(routes.resolve("missing", "continue")).toBeUndefined();
    expect(routes.has("prologue", "continue")).toBe(true);
    expect(routes.getPorts("prologue")).toEqual(["continue", "retry"]);
    expect(routes.getPorts("ending")).toEqual([]);
    expect(routes.get("ending")).toEqual({});
    expect(routes.get("missing")).toBeUndefined();
    expect(routes.entries()).toEqual([
      { sourceSceneId: "prologue", port: "continue", targetSceneId: "chapter-one" },
      { sourceSceneId: "prologue", port: "retry", targetSceneId: "prologue" },
    ]);
  });

  it("normalizes and copies the exported definition", () => {
    const routes = new RouteTable({
      prologue: { " continue ": "chapter-one" },
    });

    const definition = routes.toDefinition() as Record<string, Record<string, string>>;
    definition.prologue.continue = "changed";
    definition.prologue.extra = "new-target";
    const sceneRoutes = routes.get("prologue") as Record<string, string>;
    sceneRoutes.continue = "also-changed";

    expect(routes.resolve("prologue", "continue")).toBe("chapter-one");
    expect(routes.toDefinition()).toEqual({
      prologue: { continue: "chapter-one" },
    });
  });

  it("rejects malformed route records and identifiers", () => {
    expect(() => new RouteTable(null as never)).toThrow(/routes must be an object/);
    expect(() => new RouteTable([] as never)).toThrow(/routes must be an object/);
    expect(() => new RouteTable({ "Prologue": { next: "ending" } })).toThrow(/routes\.Prologue/);
    expect(() => new RouteTable({ "prologue ": { next: "ending" } })).toThrow(/routes\.prologue/);
    expect(() => new RouteTable({ prologue: null as never })).toThrow(/routes\.prologue must be an object/);
    expect(() => new RouteTable({ prologue: { "   ": "ending" } })).toThrow(/non-empty port name/);
    expect(() => new RouteTable({ prologue: { next: "Ending" } })).toThrow(/routes\.prologue\.next/);
    expect(() => new RouteTable({ prologue: { next: "ending " } })).toThrow(/routes\.prologue\.next/);
    expect(() => new RouteTable({ prologue: { next: null as never } })).toThrow(/routes\.prologue\.next must match/);
  });

  it("rejects duplicate ports after whitespace normalization", () => {
    expect(() => new RouteTable({
      prologue: {
        next: "ending",
        " next ": "other",
      },
    })).toThrow(/duplicate port 'next'/);
  });

  it("does not allow special keys to mutate the route record prototype", () => {
    const ports = Object.create(null) as Record<string, string>;
    Object.defineProperty(ports, "__proto__", { value: "ending", enumerable: true, writable: true });
    Object.defineProperty(ports, "constructor", { value: "other", enumerable: true, writable: true });

    const routes = new RouteTable({ prologue: ports });

    expect(routes.resolve("prologue", "__proto__")).toBe("ending");
    expect(routes.resolve("prologue", "constructor")).toBe("other");
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects symbol and non-enumerable keys", () => {
    const withSymbol = { prologue: { next: "ending" } } as Record<string, unknown>;
    Object.defineProperty(withSymbol, Symbol("hidden"), { value: "bad" });
    expect(() => new RouteTable(withSymbol as never)).toThrow(/symbol keys/);

    const withHiddenKey = { prologue: { next: "ending" } } as Record<string, unknown>;
    Object.defineProperty(withHiddenKey.prologue as object, "hidden", { value: "bad" });
    expect(() => new RouteTable(withHiddenKey as never)).toThrow(/non-enumerable/);
  });
});
