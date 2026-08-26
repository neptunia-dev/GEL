import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GameState,
  type VariableDefinition,
  type VariableValue,
} from "../../src/variables";
import { SqliteSaveStore } from "../../src/saves";

const temporaryRoots: string[] = [];
const openStores: SqliteSaveStore[] = [];

const definitions: readonly VariableDefinition[] = [
  { key: "flag.seen", schema: { type: "boolean" }, defaultValue: false },
  { key: "score", schema: { type: "number", min: 0, max: 100 }, defaultValue: 7 },
  { key: "title", schema: { type: "string", minLength: 1 }, defaultValue: "Prologue" },
  { key: "nullable", schema: { type: "null" }, defaultValue: null },
  {
    key: "inventory",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number", integer: true },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
    defaultValue: [
      { id: 1, tags: ["new", "rare"] },
      { id: 2, tags: [] },
    ],
  },
  {
    key: "profile",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        active: { type: "boolean" },
        history: { type: "array", items: { type: "number" } },
      },
    },
    defaultValue: { name: "Alice", active: true, history: [1, 2] },
  },
];

function makeState(options: {
  readonly packageId?: string;
  readonly schemaVersion?: number;
  readonly sceneId?: string;
  readonly variables?: readonly VariableDefinition[];
  readonly values?: Readonly<Record<string, VariableValue>>;
} = {}): GameState {
  const state = new GameState({
    packageId: options.packageId ?? "example.story",
    schemaVersion: options.schemaVersion ?? 1,
    sceneId: options.sceneId ?? "prologue",
    variables: options.variables ?? definitions,
  });
  for (const [key, value] of Object.entries(options.values ?? {})) {
    state.variables.set(key, value);
  }
  return state;
}

function openStore(): SqliteSaveStore {
  const root = mkdtempSync(join(tmpdir(), "gel-save-test-"));
  temporaryRoots.push(root);
  const store = new SqliteSaveStore(join(root, "saves.sqlite"));
  openStores.push(store);
  return store;
}

function databaseFor(store: SqliteSaveStore): DatabaseSync {
  return (store as unknown as { database: DatabaseSync }).database;
}

function scalar(row: Record<string, unknown>): unknown {
  return Object.values(row)[0];
}

afterEach(() => {
  while (openStores.length > 0) {
    openStores.pop()?.close();
  }
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("SqliteSaveStore schema and slot behavior", () => {
  it("creates normalized tables with SQLite pragmas and no JSON value column", () => {
    const store = openStore();
    const database = databaseFor(store);

    expect(scalar(database.prepare("PRAGMA foreign_keys").get() as Record<string, unknown>)).toBe(1);
    expect(String(scalar(database.prepare("PRAGMA journal_mode").get() as Record<string, unknown>))).toBe("wal");
    expect(scalar(database.prepare("PRAGMA busy_timeout").get() as Record<string, unknown>)).toBe(5000);

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(["save_slots", "save_value_nodes"]);

    const nodeColumns = database
      .prepare("PRAGMA table_info(save_value_nodes)")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(nodeColumns).toEqual([
      "slot_id",
      "variable_key",
      "node_id",
      "parent_node_id",
      "field_key",
      "array_index",
      "value_type",
      "boolean_value",
      "number_value",
      "string_value",
    ]);
    expect(nodeColumns.some((name) => name.toLowerCase().includes("json"))).toBe(false);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'one_auto_slot'").get()).toBeTruthy();
  });

  it("round-trips recursive values through one root tree per variable", () => {
    const store = openStore();
    const source = makeState({
      values: {
        "flag.seen": true,
        score: 42,
        title: "Chapter two",
        inventory: [
          { id: 3, tags: ["equipped", "rare"] },
          { id: 4, tags: [] },
        ],
        profile: { name: "Bob", active: false, history: [3, 5, 8] },
      },
    });

    const slot = store.saveAuto(source);
    const database = databaseFor(store);
    const roots = database
      .prepare("SELECT variable_key, node_id, parent_node_id, value_type FROM save_value_nodes WHERE slot_id = ? AND parent_node_id IS NULL ORDER BY variable_key")
      .all(slot.id);
    expect(roots).toHaveLength(definitions.length);
    expect(roots.every((row) => (row as { node_id: number }).node_id === 1)).toBe(true);
    const nodeCount = (database.prepare("SELECT count(*) AS count FROM save_value_nodes WHERE slot_id = ?").get(slot.id) as { count: number }).count;
    expect(nodeCount).toBeGreaterThan(definitions.length);

    const target = makeState({ values: { score: 99, title: "Before load" } });
    store.load(slot.id, target);
    expect(target.snapshot()).toEqual(source.snapshot());
  });

  it("UPSERTs the automatic slot and exposes manual duplicate labels", () => {
    const store = openStore();
    const source = makeState({ values: { score: 10 } });
    const firstAuto = store.saveAuto(source);
    const firstCreatedAt = firstAuto.createdAt;

    source.variables.set("score", 20);
    const secondAuto = store.saveAuto(source);
    expect(secondAuto.id).toBe("auto");
    expect(secondAuto.createdAt).toBe(firstCreatedAt);
    expect(store.list().filter((slot) => slot.kind === "auto")).toHaveLength(1);

    const firstManual = store.createManual(source, "same label");
    const secondManual = store.createManual(source, "same label");
    expect(firstManual.id).not.toBe(secondManual.id);
    expect(store.list().filter((slot) => slot.label === "same label")).toHaveLength(2);

    const overwriteState = makeState({ values: { score: 77 } });
    const overwritten = store.overwriteManual(firstManual.id, overwriteState, "renamed");
    expect(overwritten.id).toBe(firstManual.id);
    expect(overwritten.createdAt).toBe(firstManual.createdAt);
    expect(overwritten.label).toBe("renamed");

    const target = makeState();
    store.load(firstManual.id, target);
    expect(target.variables.get("score")).toBe(77);
  });

  it("deletes a slot and cascades all normalized value nodes", () => {
    const store = openStore();
    const slot = store.createManual(makeState(), "to delete");
    const database = databaseFor(store);
    const beforeDelete = (database.prepare("SELECT count(*) AS count FROM save_value_nodes WHERE slot_id = ?").get(slot.id) as { count: number }).count;

    expect(beforeDelete).toBeGreaterThan(definitions.length);
    store.delete(slot.id);
    expect(store.list().some((item) => item.id === slot.id)).toBe(false);
    expect(database.prepare("SELECT count(*) AS count FROM save_value_nodes WHERE slot_id = ?").get(slot.id)).toMatchObject({ count: 0 });
    expect(() => store.delete(slot.id)).toThrow(/Unknown save slot/);
  });
});

describe("SqliteSaveStore load validation", () => {
  it("rejects package, schema, scene, schema-definition, and value mismatches", () => {
    const store = openStore();
    const source = makeState({ values: { score: 42 } });
    const slot = store.saveAuto(source);

    for (const options of [
      { packageId: "other.story" },
      { schemaVersion: 2 },
      { sceneId: "chapter-two" },
    ]) {
      const target = makeState();
      Object.assign(target as unknown as Record<string, unknown>, options);
      const before = target.snapshot();
      expect(() => store.load(slot.id, target)).toThrow();
      expect(target.snapshot()).toEqual(before);
    }

    const narrowerSchema = definitions.map((definition) =>
      definition.key === "score"
        ? { ...definition, schema: { type: "number" as const, max: 10 } }
        : definition,
    );
    const schemaTarget = makeState({ variables: narrowerSchema });
    const schemaBefore = schemaTarget.snapshot();
    expect(() => store.load(slot.id, schemaTarget)).toThrow(/at most/);
    expect(schemaTarget.snapshot()).toEqual(schemaBefore);

    const database = databaseFor(store);
    database.prepare("UPDATE save_value_nodes SET number_value = 101 WHERE slot_id = ? AND variable_key = 'score' AND node_id = 1").run(slot.id);
    const valueTarget = makeState();
    const valueBefore = valueTarget.snapshot();
    expect(() => store.load(slot.id, valueTarget)).toThrow(/at most/);
    expect(valueTarget.snapshot()).toEqual(valueBefore);
  });

  const corruptions: readonly {
    readonly name: string;
    readonly mutate: (database: DatabaseSync, slotId: string) => void;
    readonly message: RegExp;
  }[] = [
    {
      name: "malformed scalar columns",
      mutate: (database, slotId) => {
        database.prepare("UPDATE save_value_nodes SET string_value = 'unexpected' WHERE slot_id = ? AND variable_key = 'score' AND node_id = 1").run(slotId);
      },
      message: /scalar columns/,
    },
    {
      name: "scalar parent relationships",
      mutate: (database, slotId) => {
        database.prepare("UPDATE save_value_nodes SET parent_node_id = 3, field_key = NULL, array_index = 0 WHERE slot_id = ? AND variable_key = 'inventory' AND node_id = 3").run(slotId);
      },
      message: /scalar parent|coordinates/,
    },
    {
      name: "missing roots",
      mutate: (database, slotId) => {
        database.prepare("DELETE FROM save_value_nodes WHERE slot_id = ? AND variable_key = 'score' AND node_id = 1").run(slotId);
      },
      message: /exactly one root|complete variable/,
    },
    {
      name: "unknown variables",
      mutate: (database, slotId) => {
        database.prepare("INSERT INTO save_value_nodes (slot_id, variable_key, node_id, parent_node_id, field_key, array_index, value_type, boolean_value, number_value, string_value) VALUES (?, 'unknown.variable', 1, NULL, NULL, NULL, 'null', NULL, NULL, NULL)").run(slotId);
      },
      message: /unknown variable/,
    },
    {
      name: "duplicate object fields",
      mutate: (database, slotId) => {
        database.prepare("UPDATE save_value_nodes SET field_key = 'name' WHERE slot_id = ? AND variable_key = 'profile' AND node_id = 3").run(slotId);
      },
      message: /duplicate object field/,
    },
    {
      name: "non-contiguous array indexes",
      mutate: (database, slotId) => {
        database.prepare("UPDATE save_value_nodes SET array_index = 2 WHERE slot_id = ? AND variable_key = 'inventory' AND node_id = 5").run(slotId);
      },
      message: /non-contiguous array indexes/,
    },
    {
      name: "orphan nodes",
      mutate: (database, slotId) => {
        database.exec("PRAGMA foreign_keys = OFF");
        database.prepare("INSERT INTO save_value_nodes (slot_id, variable_key, node_id, parent_node_id, field_key, array_index, value_type, boolean_value, number_value, string_value) VALUES (?, 'score', 99, 999, 'orphan', NULL, 'number', NULL, 1, NULL)").run(slotId);
        database.exec("PRAGMA foreign_keys = ON");
      },
      message: /orphan parent|orphan or cycle/,
    },
  ];

  it.each(corruptions)("rejects $name without mutating the target state", ({ mutate, message }) => {
    const store = openStore();
    const slot = store.saveAuto(makeState());
    mutate(databaseFor(store), slot.id);
    const target = makeState({ values: { score: 88, title: "untouched" } });
    const before = target.snapshot();

    expect(() => store.load(slot.id, target)).toThrow(message);
    expect(target.snapshot()).toEqual(before);
  });

  it("rolls back the entire save when a node insert fails", () => {
    const store = openStore();
    const database = databaseFor(store);
    const original = makeState({ values: { score: 11 } });
    const slot = store.saveAuto(original);

    database.exec(`
      CREATE TRIGGER forced_save_failure
      BEFORE INSERT ON save_value_nodes
      WHEN NEW.variable_key = 'score'
      BEGIN
        SELECT RAISE(ABORT, 'forced insert failure');
      END;
    `);

    const replacement = makeState({ values: { score: 99 } });
    expect(() => store.saveAuto(replacement)).toThrow(/forced insert failure/);
    database.exec("DROP TRIGGER forced_save_failure");

    const target = makeState({ values: { score: 55 } });
    store.load(slot.id, target);
    expect(target.variables.get("score")).toBe(11);
    expect(database.prepare("SELECT package_id, scene_id FROM save_slots WHERE id = 'auto'").get()).toEqual({
      package_id: "example.story",
      scene_id: "prologue",
    });
  });
});
