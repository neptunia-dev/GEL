import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../src/filesystem";
import { LoadedRuntimePackage, PackageLoadError, PackageLoader } from "../../src/package";

const validManifest = {
  formatVersion: 1,
  packageId: "example.story",
  packageVersion: "1.0.0",
  saveSchemaVersion: 1,
  entryScene: "prologue",
  metadata: { title: "Example", cover: "asset.cover" },
  assets: [
    { id: "asset.cover", kind: "image", path: "assets/cover.png" },
    { id: "portrait.alice", kind: "image", path: "assets/alice.png" },
  ],
  characters: [
    {
      id: "alice",
      name: "Alice",
      portraits: [{ id: "normal", asset: "portrait.alice" }],
      defaultPortraitId: "normal",
    },
  ],
  variables: [{ key: "flags.met", schema: { type: "boolean" }, defaultValue: false }],
  scenes: [
    {
      id: "prologue",
      mainScript: "scenes/prologue/main.lua",
      cast: [{ characterId: "alice" }],
      exits: ["continue"],
    },
    { id: "ending", mainScript: "scenes/ending/main.lua", exits: [] },
  ],
  routes: { prologue: { continue: "ending" } },
} as const;

function packageFiles(
  manifest: unknown = validManifest,
  extra: Record<string, string | Uint8Array> = {},
  omitted: readonly string[] = [],
) {
  const files: Record<string, string | Uint8Array> = {
    "manifest.json": JSON.stringify(manifest),
    "assets/cover.png": "cover",
    "assets/alice.png": "portrait",
    "scenes/prologue/main.lua": "return function(ctx) end",
    "scenes/ending/main.lua": "return function(ctx) end",
    ...extra,
  };
  for (const path of omitted) {
    delete files[path];
  }
  return new MemoryFileSystem(files);
}

function load(
  manifest: unknown = validManifest,
  extra: Record<string, string | Uint8Array> = {},
  omitted: readonly string[] = [],
) {
  return new PackageLoader(packageFiles(manifest, extra, omitted)).load();
}

function expectLoadError(action: () => unknown, code: PackageLoadError["code"], path: string) {
  expect(action).toThrowError(expect.objectContaining({ name: "PackageLoadError", code, path }));
}

describe("PackageLoader", () => {
  it("loads registries, scripts, assets, variables, and routes", () => {
    const loaded = load();

    expect(loaded).toBeInstanceOf(LoadedRuntimePackage);
    expect(loaded.packageId).toBe("example.story");
    expect(loaded.entryScene).toBe("prologue");
    expect(loaded.assets.require("asset.cover").path).toBe("assets/cover.png");
    expect(loaded.scenes.require("prologue").getCharacterIds()).toEqual(["alice"]);
    expect(loaded.routes.resolve("prologue", "continue")).toBe("ending");
    expect(loaded.readSceneScript("prologue")).toBe("return function(ctx) end");
    expect(loaded.variables).toEqual([
      { key: "flags.met", schema: { type: "boolean" }, defaultValue: false },
    ]);
  });

  it("keeps definition data detached and creates session-owned character registries", () => {
    const loaded = load();
    const first = loaded.createCharacterRegistry();
    const second = loaded.createCharacterRegistry();
    first.require("alice").setDisplayName("Changed");
    first.require("alice").setPortrait(null);

    expect(second.require("alice").displayName).toBe("Alice");
    expect(second.require("alice").portraitId).toBe("normal");

    const definition = loaded.toDefinition() as any;
    definition.characters[0].portraits[0].asset = "changed";
    definition.scenes[0].cast[0].characterId = "changed";
    expect(loaded.characters[0].portraits?.[0].asset).toBe("portrait.alice");
    expect(loaded.scenes.require("prologue").getCharacterIds()).toEqual(["alice"]);
  });

  it("does not execute scene code during syntax validation", () => {
    const manifest = {
      ...validManifest,
      scenes: [{ ...validManifest.scenes[0], exits: [] }],
      routes: {},
    };
    const loaded = load(manifest, {
      "scenes/prologue/main.lua": "_G.package_loader_executed = true\nreturn function(ctx) end",
    });

    expect(loaded.scenes.has("prologue")).toBe(true);
  });

  it("rejects missing or malformed manifest files", () => {
    expectLoadError(
      () => new PackageLoader(new MemoryFileSystem()).load(),
      "FILE_NOT_FOUND",
      "manifest.json",
    );
    expectLoadError(
      () => new PackageLoader(new MemoryFileSystem({ "manifest.json": "{" })).load(),
      "INVALID_MANIFEST",
      "manifest.json",
    );
    expectLoadError(
      () => load({ ...validManifest, formatVersion: 2 }),
      "UNSUPPORTED_FORMAT",
      "formatVersion",
    );
  });

  it("rejects invalid package fields and engine requirements", () => {
    expectLoadError(() => load({ ...validManifest, packageId: "Bad" }), "INVALID_MANIFEST", "packageId");
    expectLoadError(() => load({ ...validManifest, packageVersion: "1" }), "INVALID_MANIFEST", "packageVersion");
    expectLoadError(() => load({ ...validManifest, saveSchemaVersion: -1 }), "INVALID_MANIFEST", "saveSchemaVersion");
    expectLoadError(
      () => load({ ...validManifest, engine: { minVersion: "9.0.0" } }),
      "INCOMPATIBLE_ENGINE",
      "engine.minVersion",
    );
    expectLoadError(
      () => load({ ...validManifest, metadata: { cover: "missing.asset" } }),
      "INVALID_REFERENCE",
      "metadata.cover",
    );
    expectLoadError(
      () => load({ ...validManifest, variables: [{ key: "x", schema: { type: "boolean" }, defaultValue: "bad" }] }),
      "INVALID_MANIFEST",
      "variables[0]",
    );
  });

  it("rejects missing asset files, character asset references, and cast references", () => {
    expectLoadError(
      () => load(validManifest, {}, ["assets/alice.png"]),
      "FILE_NOT_FOUND",
      "assets[1].path",
    );
    expectLoadError(
      () => load({
        ...validManifest,
        characters: [{ ...validManifest.characters[0], portraits: [{ id: "normal", asset: "missing.asset" }] }],
      }),
      "INVALID_REFERENCE",
      "characters[0].portraits[0].asset",
    );
    expectLoadError(
      () => load({
        ...validManifest,
        scenes: [{ ...validManifest.scenes[0], cast: [{ characterId: "missing" }] }, validManifest.scenes[1]],
      }),
      "INVALID_REFERENCE",
      "scenes[0].cast[0].characterId",
    );
  });

  it("rejects missing, invalid, or duplicate scene scripts", () => {
    expectLoadError(
      () => load(validManifest, {}, ["scenes/prologue/main.lua"]),
      "FILE_NOT_FOUND",
      "scenes[0].mainScript",
    );
    expectLoadError(
      () => load(validManifest, { "scenes/prologue/main.lua": "return function(ctx)" }),
      "INVALID_SCRIPT",
      "scenes[0].mainScript",
    );
    expectLoadError(
      () => load({
        ...validManifest,
        scenes: [
          validManifest.scenes[0],
          { ...validManifest.scenes[1], mainScript: validManifest.scenes[0].mainScript },
        ],
      }),
      "INVALID_MANIFEST",
      "scenes[1].mainScript",
    );
  });

  it("requires a route for every exit and rejects undeclared routes and unknown scenes", () => {
    expectLoadError(
      () => load({ ...validManifest, routes: {} }),
      "INVALID_REFERENCE",
      "routes.prologue.continue",
    );
    expectLoadError(
      () => load({ ...validManifest, scenes: [{ ...validManifest.scenes[0], exits: [] }, validManifest.scenes[1]] }),
      "INVALID_REFERENCE",
      "routes.prologue.continue",
    );
    expectLoadError(
      () => load({ ...validManifest, routes: { prologue: { continue: "missing" } } }),
      "INVALID_REFERENCE",
      "routes.prologue.continue",
    );
    expectLoadError(
      () => load({ ...validManifest, entryScene: "missing" }),
      "INVALID_REFERENCE",
      "entryScene",
    );
    expectLoadError(
      () => load({ ...validManifest, routes: { missing: { continue: "ending" } } }),
      "INVALID_REFERENCE",
      "routes.missing",
    );
  });

  it("validates optional asset integrity metadata", () => {
    const digest = createHash("sha256").update("portrait").digest("hex");
    expect(load({
      ...validManifest,
      assets: [
        validManifest.assets[0],
        { ...validManifest.assets[1], integrity: { algorithm: "sha256", digest: digest.toUpperCase() } },
      ],
    }).assets.require("portrait.alice").integrity?.digest).toBe(digest);

    expectLoadError(
      () => load({
        ...validManifest,
        assets: [
          validManifest.assets[0],
          { ...validManifest.assets[1], integrity: { algorithm: "sha256", digest: "0".repeat(64) } },
        ],
      }),
      "INTEGRITY_MISMATCH",
      "assets[1].integrity.digest",
    );
  });

  it("rejects invalid UTF-8 in the manifest or a scene script", () => {
    expectLoadError(
      () => new PackageLoader(new MemoryFileSystem({ "manifest.json": new Uint8Array([0xc3, 0x28]) })).load(),
      "INVALID_MANIFEST",
      "manifest.json",
    );
    expectLoadError(
      () => load(validManifest, { "scenes/prologue/main.lua": new Uint8Array([0xc3, 0x28]) }),
      "INVALID_SCRIPT",
      "scenes[0].mainScript",
    );
  });
});
