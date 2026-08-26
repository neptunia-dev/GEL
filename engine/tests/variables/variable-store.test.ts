import { describe, expect, it } from "vitest";
import {
  GameState,
  VariableStore,
  type VariableDefinition,
  type VariableValue,
} from "../../src/variables";

type ProfileValue = {
  name: string;
  status: "new" | "done";
  active: boolean;
  count: number;
  tags: string[];
  missing: null;
};

const profileDefinition: VariableDefinition<ProfileValue> = {
  key: "profile",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 20, pattern: "^[A-Z][a-z]+$" },
      status: { type: "string", enum: ["new", "done"] },
      active: { type: "boolean" },
      count: { type: "number", integer: true, min: 0, max: 10 },
      tags: { type: "array", items: { type: "string", minLength: 1 }, minLength: 1, maxLength: 2 },
      missing: { type: "null" },
    },
  },
  defaultValue: {
    name: "Alice",
    status: "new",
    active: true,
    count: 1,
    tags: ["friend"],
    missing: null,
  },
};

function profileValue(overrides: Partial<ProfileValue> = {}): ProfileValue {
  return {
    name: "Alice",
    status: "new",
    active: true,
    count: 1,
    tags: ["friend"],
    missing: null,
    ...overrides,
  };
}

function createStore(): VariableStore {
  return new VariableStore([
    profileDefinition,
    { key: "counter", schema: { type: "number", integer: true, min: 0, max: 3 }, defaultValue: 2 },
    { key: "unbounded", schema: { type: "number" }, defaultValue: Number.MAX_VALUE },
    { key: "locked", schema: { type: "number" }, defaultValue: 7, readonly: true },
  ]);
}

describe("VariableStore", () => {
  it("accepts recursive schemas and initializes every declared default", () => {
    const store = createStore();

    expect(store.has("profile")).toBe(true);
    expect(store.has("counter")).toBe(true);
    expect(store.get("profile")).toEqual(profileDefinition.defaultValue);
    expect(store.definitions).toHaveLength(4);
    expect(store.getDefinition("profile")).toEqual(profileDefinition);
  });

  it("rejects invalid keys, duplicate declarations, and invalid defaults", () => {
    for (const key of ["", "Profile", "1profile", "profile name"]) {
      expect(
        () =>
          new VariableStore([
            { key, schema: { type: "boolean" }, defaultValue: false },
          ]),
      ).toThrow(/key/);
    }

    expect(
      () =>
        new VariableStore([
          { key: "same", schema: { type: "boolean" }, defaultValue: false },
          { key: "same", schema: { type: "boolean" }, defaultValue: true },
        ]),
    ).toThrow(/Duplicate variable key/);

    expect(
      () =>
        new VariableStore([
          {
            key: "bad-default",
            schema: { type: "number", min: 1, max: 2 },
            defaultValue: "wrong" as unknown as VariableValue,
          },
        ]),
    ).toThrow(/defaultValue/);

    expect(
      () =>
        new VariableStore([
          {
            key: "bad-schema",
            schema: { type: "number", min: 4, max: 2 },
            defaultValue: 3,
          },
        ]),
    ).toThrow(/min/);
  });

  it("validates closed objects, recursive arrays, and scalar constraints", () => {
    const store = createStore();

    expect(() => store.set("profile", { ...profileValue(), extra: true })).toThrow(/undeclared/);
    expect(() => store.set("profile", { ...profileValue(), tags: [] })).toThrow(/at least/);
    expect(() => store.set("profile", { ...profileValue(), tags: ["a", "b", "c"] })).toThrow(/at most/);
    expect(() => store.set("profile", { ...profileValue(), tags: ["a", 4] })).toThrow(/string/);
    expect(() => store.set("profile", { ...profileValue(), name: "alice" })).toThrow(/pattern/);
    expect(() => store.set("profile", { ...profileValue(), status: "other" as "new" })).toThrow(/declared values/);
    expect(() => store.set("profile", { ...profileValue(), count: 1.5 })).toThrow(/integer/);
    expect(() => store.set("profile", { ...profileValue(), count: 11 })).toThrow(/at most/);
    expect(() => store.set("profile", { ...profileValue(), missing: false as unknown as null })).toThrow(/null/);
    expect(() => store.set("profile", { name: "Alice" } as unknown as ProfileValue)).toThrow(/missing required/);
  });

  it("rejects malformed recursive schema declarations", () => {
    expect(
      () =>
        new VariableStore([
          {
            key: "bad-array",
            schema: { type: "array", items: undefined as never },
            defaultValue: [],
          },
        ]),
    ).toThrow(/items/);

    expect(
      () =>
        new VariableStore([
          {
            key: "bad-string",
            schema: { type: "string", minLength: 3, maxLength: 1 },
            defaultValue: "x",
          },
        ]),
    ).toThrow(/minLength/);

    expect(
      () =>
        new VariableStore([
          {
            key: "bad-pattern",
            schema: { type: "string", pattern: "[" },
            defaultValue: "x",
          },
        ]),
    ).toThrow(/pattern/);
  });

  it("supports bounded integer addition and rejects overflow or invalid amounts", () => {
    const store = createStore();

    expect(store.add("counter", 1)).toBe(3);
    expect(() => store.add("counter", 1)).toThrow(/at most/);
    expect(() => store.add("counter", 0.5)).toThrow(/integer/);
    expect(() => store.add("unbounded", Number.MAX_VALUE)).toThrow(/finite/);
    expect(store.get("counter")).toBe(3);
    expect(() => store.add("counter", Number.NaN)).toThrow(/finite number/);
    expect(() => store.add("counter", Number.POSITIVE_INFINITY)).toThrow(/finite number/);
    expect(() => store.add("profile", 1)).toThrow(/not a number/);
  });

  it("rejects unknown keys and all writes to readonly variables", () => {
    const store = createStore();

    expect(() => store.get("unknown")).toThrow(/Unknown variable/);
    expect(() => store.set("unknown", false)).toThrow(/Unknown variable/);
    expect(() => store.add("unknown", 1)).toThrow(/Unknown variable/);
    expect(() => store.reset("unknown")).toThrow(/Unknown variable/);
    expect(() => store.has("unknown")).toThrow(/Unknown variable/);

    expect(() => store.set("locked", 8)).toThrow(/readonly/);
    expect(() => store.add("locked", 1)).toThrow(/readonly/);
    expect(() => store.reset("locked")).toThrow(/readonly/);
    expect(store.get("locked")).toBe(7);
  });

  it("deep-copies values at every store boundary and restores complete snapshots", () => {
    const store = createStore();
    const input = profileValue({ name: "Bob", status: "done", active: false, count: 2, tags: ["friend", "ally"] });

    store.set("profile", input);
    input.tags.push("mutated outside");
    expect(store.get("profile")).toEqual(profileValue({ name: "Bob", status: "done", active: false, count: 2, tags: ["friend", "ally"] }));

    const read = store.get("profile") as ProfileValue;
    read.tags.push("mutated after get");
    expect((store.get("profile") as ProfileValue).tags).toEqual(["friend", "ally"]);

    const snapshotCopy = store.snapshot();
    (snapshotCopy.profile as ProfileValue).tags.push("mutated snapshot");
    expect((store.get("profile") as ProfileValue).tags).toEqual(["friend", "ally"]);

    const snapshot = store.snapshot();
    store.set("counter", 3);
    store.restore(snapshot);
    expect(store.get("profile")).toEqual(profileValue({ name: "Bob", status: "done", active: false, count: 2, tags: ["friend", "ally"] }));
    expect(store.get("counter")).toBe(2);

    store.reset("profile");
    const resetValue = store.get("profile") as ProfileValue;
    resetValue.tags.push("mutated default");
    expect((store.get("profile") as ProfileValue).tags).toEqual(["friend"]);
  });

  it("rejects incomplete or invalid snapshots without partial mutation", () => {
    const store = createStore();
    store.set("counter", 3);
    const before = store.snapshot();

    expect(() => store.restore({ ...before, counter: 4 })).toThrow(/at most/);
    expect(store.snapshot()).toEqual(before);

    const incomplete = { ...before } as Record<string, VariableValue>;
    delete incomplete.profile;
    expect(() => store.restore(incomplete)).toThrow(/missing variable/);
    expect(store.snapshot()).toEqual(before);

    expect(() => store.restore({ ...before, extra: true })).toThrow(/Unknown variable/);
    expect(store.snapshot()).toEqual(before);
  });
});

describe("GameState", () => {
  it("validates metadata and exposes one mutable game-level store", () => {
    const state = new GameState({
      packageId: "example.story",
      schemaVersion: 1,
      sceneId: "prologue",
      variables: [{ key: "score", schema: { type: "number" }, defaultValue: 0 }],
    });

    state.variables.set("score", 4);
    expect(state.packageId).toBe("example.story");
    expect(state.schemaVersion).toBe(1);
    expect(state.sceneId).toBe("prologue");
    expect(state.snapshot()).toEqual({ score: 4 });

    state.sceneId = "chapter-two";
    expect(state.sceneId).toBe("chapter-two");
    expect(() => {
      state.sceneId = " ";
    }).toThrow(/sceneId/);
  });
});
