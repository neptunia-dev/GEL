import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { GameState, VariableValue } from "../variables";

export type SaveSlotKind = "auto" | "manual";

export interface SaveSlot {
  readonly id: string;
  readonly kind: SaveSlotKind;
  readonly label: string | null;
  readonly packageId: string;
  readonly schemaVersion: number;
  readonly sceneId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface SaveNode {
  readonly slotId: string;
  readonly variableKey: string;
  readonly nodeId: number;
  readonly parentNodeId: number | null;
  readonly fieldKey: string | null;
  readonly arrayIndex: number | null;
  readonly valueType: "null" | "boolean" | "number" | "string" | "array" | "object";
  readonly booleanValue: number | null;
  readonly numberValue: number | null;
  readonly stringValue: string | null;
}

interface SaveNodeRow {
  readonly slot_id: unknown;
  readonly variable_key: unknown;
  readonly node_id: unknown;
  readonly parent_node_id: unknown;
  readonly field_key: unknown;
  readonly array_index: unknown;
  readonly value_type: unknown;
  readonly boolean_value: unknown;
  readonly number_value: unknown;
  readonly string_value: unknown;
}

interface SaveSlotRow {
  readonly id: unknown;
  readonly kind: unknown;
  readonly label: unknown;
  readonly package_id: unknown;
  readonly schema_version: unknown;
  readonly scene_id: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

const CREATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS save_slots (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('auto', 'manual')),
  label TEXT,
  package_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  scene_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_auto_slot ON save_slots(kind) WHERE kind = 'auto';
CREATE TABLE IF NOT EXISTS save_value_nodes (
  slot_id TEXT NOT NULL,
  variable_key TEXT NOT NULL,
  node_id INTEGER NOT NULL,
  parent_node_id INTEGER,
  field_key TEXT,
  array_index INTEGER,
  value_type TEXT NOT NULL CHECK (value_type IN ('null', 'boolean', 'number', 'string', 'array', 'object')),
  boolean_value INTEGER CHECK (boolean_value IN (0, 1)),
  number_value REAL,
  string_value TEXT,
  PRIMARY KEY (slot_id, variable_key, node_id),
  FOREIGN KEY (slot_id) REFERENCES save_slots(id) ON DELETE CASCADE,
  FOREIGN KEY (slot_id, variable_key, parent_node_id)
    REFERENCES save_value_nodes(slot_id, variable_key, node_id) ON DELETE CASCADE,
  CHECK ((parent_node_id IS NULL AND field_key IS NULL AND array_index IS NULL)
      OR (parent_node_id IS NOT NULL AND (field_key IS NOT NULL) <> (array_index IS NOT NULL)))
);
`;

const SELECT_SLOT_COLUMNS = `
  id, kind, label, package_id, schema_version, scene_id, created_at, updated_at
`;

/** Synchronous SQLite persistence for complete game states. */
export class SqliteSaveStore {
  private readonly database: DatabaseSync;
  private closed = false;

  public constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec(CREATE_SCHEMA);
  }

  /** Save or replace the single automatic slot with id `auto`. */
  public saveAuto(state: GameState): SaveSlot {
    this.ensureOpen();
    const existing = this.readSlot("auto");
    if (existing !== null && existing.kind !== "auto") {
      throw new Error("The reserved auto save slot has the wrong kind");
    }
    return this.replaceSlot(state, {
      id: "auto",
      kind: "auto",
      label: null,
      createdAt: existing?.createdAt ?? Date.now(),
    });
  }

  /** Create a manual slot; labels are metadata and do not need to be unique. */
  public createManual(state: GameState, label: string | null = null): SaveSlot {
    this.ensureOpen();
    return this.replaceSlot(state, {
      id: randomUUID(),
      kind: "manual",
      label: normalizeLabel(label),
      createdAt: Date.now(),
    });
  }

  /** Replace an existing manual slot while preserving its creation time. */
  public overwriteManual(id: string, state: GameState, label?: string | null): SaveSlot {
    this.ensureOpen();
    const existing = this.requireSlot(id);
    if (existing.kind !== "manual") {
      throw new Error(`Save slot '${id}' is not a manual slot`);
    }
    return this.replaceSlot(state, {
      id,
      kind: "manual",
      label: label === undefined ? existing.label : normalizeLabel(label),
      createdAt: existing.createdAt,
    });
  }

  /** Load a slot after checking all metadata and values against `state`. */
  public load(id: string, state: GameState): SaveSlot {
    this.ensureOpen();
    const slot = this.requireSlot(id);
    if (slot.packageId !== state.packageId) {
      throw new Error(`Save slot '${id}' belongs to package '${slot.packageId}'`);
    }
    if (slot.schemaVersion !== state.schemaVersion) {
      throw new Error(`Save slot '${id}' uses schema version ${slot.schemaVersion}`);
    }
    if (slot.sceneId !== state.sceneId) {
      throw new Error(`Save slot '${id}' belongs to scene '${slot.sceneId}'`);
    }

    const rows = this.readNodes(id);
    const snapshot = reconstructSnapshot(rows, state);
    state.restore(snapshot);
    return slot;
  }

  /** List slots without loading their variable trees. */
  public list(): readonly SaveSlot[] {
    this.ensureOpen();
    const rows = this.database
      .prepare(`SELECT ${SELECT_SLOT_COLUMNS} FROM save_slots ORDER BY updated_at DESC, id ASC`)
      .all();
    return rows.map((row) => parseSlotRow(row as unknown as SaveSlotRow));
  }

  /** Delete a slot; its value nodes are removed by the foreign-key cascade. */
  public delete(id: string): void {
    this.ensureOpen();
    const result = this.database.prepare("DELETE FROM save_slots WHERE id = ?").run(requireId(id));
    if (Number(result.changes) !== 1) {
      throw new Error(`Unknown save slot '${id}'`);
    }
  }

  /** Close the underlying SQLite connection. */
  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.database.close();
  }

  private replaceSlot(
    state: GameState,
    slot: { readonly id: string; readonly kind: SaveSlotKind; readonly label: string | null; readonly createdAt: number },
  ): SaveSlot {
    const snapshot = state.snapshot();
    const nodes = flattenSnapshot(slot.id, state, snapshot);
    const updatedAt = Date.now();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO save_slots
             (id, kind, label, package_id, schema_version, scene_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             kind = excluded.kind,
             label = excluded.label,
             package_id = excluded.package_id,
             schema_version = excluded.schema_version,
             scene_id = excluded.scene_id,
             updated_at = excluded.updated_at`,
        )
        .run(
          slot.id,
          slot.kind,
          slot.label,
          state.packageId,
          state.schemaVersion,
          state.sceneId,
          slot.createdAt,
          updatedAt,
        );
      this.database.prepare("DELETE FROM save_value_nodes WHERE slot_id = ?").run(slot.id);
      const insertNode = this.database.prepare(
        `INSERT INTO save_value_nodes
           (slot_id, variable_key, node_id, parent_node_id, field_key, array_index,
            value_type, boolean_value, number_value, string_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const node of nodes) {
        insertNode.run(
          node.slotId,
          node.variableKey,
          node.nodeId,
          node.parentNodeId,
          node.fieldKey,
          node.arrayIndex,
          node.valueType,
          node.booleanValue,
          node.numberValue,
          node.stringValue,
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }

    return this.requireSlot(slot.id);
  }

  private readSlot(id: string): SaveSlot | null {
    const row = this.database
      .prepare(`SELECT ${SELECT_SLOT_COLUMNS} FROM save_slots WHERE id = ?`)
      .get(requireId(id));
    return row === undefined ? null : parseSlotRow(row as unknown as SaveSlotRow);
  }

  private requireSlot(id: string): SaveSlot {
    const slot = this.readSlot(id);
    if (slot === null) {
      throw new Error(`Unknown save slot '${id}'`);
    }
    return slot;
  }

  private readNodes(slotId: string): SaveNode[] {
    const rows = this.database
      .prepare(
        `SELECT slot_id, variable_key, node_id, parent_node_id, field_key, array_index,
                value_type, boolean_value, number_value, string_value
           FROM save_value_nodes
          WHERE slot_id = ?
          ORDER BY variable_key ASC, node_id ASC`,
      )
      .all(requireId(slotId));
    return rows.map((row) => parseNodeRow(row as unknown as SaveNodeRow));
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("Save store is closed");
    }
  }
}

function normalizeLabel(label: string | null): string | null {
  if (label !== null && typeof label !== "string") {
    throw new TypeError("Save slot label must be a string or null");
  }
  return label;
}

function requireId(id: string): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("Save slot id must be a non-empty string");
  }
  return id;
}

function flattenSnapshot(slotId: string, state: GameState, snapshot: Readonly<Record<string, VariableValue>>): SaveNode[] {
  const nodes: SaveNode[] = [];
  for (const definition of state.variables.definitions) {
    const value = snapshot[definition.key];
    let nextNodeId = 1;
    const append = (nodeValue: VariableValue, parentNodeId: number | null, fieldKey: string | null, arrayIndex: number | null): void => {
      const nodeId = nextNodeId;
      nextNodeId += 1;
      const scalar = encodeScalar(nodeValue);
      nodes.push({
        slotId,
        variableKey: definition.key,
        nodeId,
        parentNodeId,
        fieldKey,
        arrayIndex,
        ...scalar,
      });
      if (Array.isArray(nodeValue)) {
        nodeValue.forEach((item, index) => append(item, nodeId, null, index));
      } else if (nodeValue !== null && typeof nodeValue === "object") {
        for (const [key, item] of Object.entries(nodeValue)) {
          append(item, nodeId, key, null);
        }
      }
    };
    append(value, null, null, null);
  }
  return nodes;
}

function encodeScalar(value: VariableValue): Pick<SaveNode, "valueType" | "booleanValue" | "numberValue" | "stringValue"> {
  if (value === null) {
    return { valueType: "null", booleanValue: null, numberValue: null, stringValue: null };
  }
  if (typeof value === "boolean") {
    return { valueType: "boolean", booleanValue: value ? 1 : 0, numberValue: null, stringValue: null };
  }
  if (typeof value === "number") {
    return { valueType: "number", booleanValue: null, numberValue: value, stringValue: null };
  }
  if (typeof value === "string") {
    return { valueType: "string", booleanValue: null, numberValue: null, stringValue: value };
  }
  if (Array.isArray(value)) {
    return { valueType: "array", booleanValue: null, numberValue: null, stringValue: null };
  }
  return { valueType: "object", booleanValue: null, numberValue: null, stringValue: null };
}

function parseSlotRow(row: SaveSlotRow): SaveSlot {
  const id = requiredString(row.id, "save slot id");
  const kind = requiredString(row.kind, `save slot '${id}' kind`);
  if (kind !== "auto" && kind !== "manual") {
    throw new Error(`Save slot '${id}' has an invalid kind`);
  }
  if ((kind === "auto") !== (id === "auto")) {
    throw new Error(`Save slot '${id}' violates the reserved auto slot invariant`);
  }
  const label = row.label === null ? null : requiredString(row.label, `save slot '${id}' label`);
  const packageId = requiredString(row.package_id, `save slot '${id}' package id`);
  const schemaVersion = requiredInteger(row.schema_version, `save slot '${id}' schema version`);
  const sceneId = requiredString(row.scene_id, `save slot '${id}' scene id`);
  const createdAt = requiredTimestamp(row.created_at, `save slot '${id}' created time`);
  const updatedAt = requiredTimestamp(row.updated_at, `save slot '${id}' updated time`);
  return { id, kind, label, packageId, schemaVersion, sceneId, createdAt, updatedAt };
}

function parseNodeRow(row: SaveNodeRow): SaveNode {
  const slotId = requiredString(row.slot_id, "save node slot id");
  const variableKey = requiredString(row.variable_key, "save node variable key");
  const nodeId = requiredPositiveInteger(row.node_id, "save node id");
  const parentNodeId = row.parent_node_id === null ? null : requiredPositiveInteger(row.parent_node_id, "save node parent id");
  const fieldKey = row.field_key === null ? null : requiredString(row.field_key, "save node field key");
  const arrayIndex = row.array_index === null ? null : requiredNonNegativeInteger(row.array_index, "save node array index");
  const valueType = requiredString(row.value_type, "save node value type");
  if (!isValueType(valueType)) {
    throw new Error(`Save node '${variableKey}/${nodeId}' has an invalid value type`);
  }
  const booleanValue = row.boolean_value === null ? null : requiredNumber(row.boolean_value, "save node boolean value");
  const numberValue = row.number_value === null ? null : requiredNumber(row.number_value, "save node number value");
  const stringValue = row.string_value === null ? null : requiredString(row.string_value, "save node string value");
  const node = {
    slotId,
    variableKey,
    nodeId,
    parentNodeId,
    fieldKey,
    arrayIndex,
    valueType,
    booleanValue,
    numberValue,
    stringValue,
  } satisfies SaveNode;
  validateNodeColumns(node);
  return node;
}

function reconstructSnapshot(rows: readonly SaveNode[], state: GameState): Record<string, VariableValue> {
  const definitions = state.variables.definitions;
  const definitionKeys = new Set(definitions.map((definition) => definition.key));
  const grouped = new Map<string, SaveNode[]>();
  for (const row of rows) {
    if (!definitionKeys.has(row.variableKey)) {
      throw new Error(`Save contains unknown variable '${row.variableKey}'`);
    }
    const variableRows = grouped.get(row.variableKey);
    if (variableRows === undefined) {
      grouped.set(row.variableKey, [row]);
    } else {
      variableRows.push(row);
    }
  }

  const snapshot: Record<string, VariableValue> = {};
  for (const definition of definitions) {
    const variableRows = grouped.get(definition.key) ?? [];
    const nodesById = new Map<number, SaveNode>();
    for (const row of variableRows) {
      if (nodesById.has(row.nodeId)) {
        throw new Error(`Save contains duplicate node '${definition.key}/${row.nodeId}'`);
      }
      nodesById.set(row.nodeId, row);
    }
    const roots = variableRows.filter((row) => row.parentNodeId === null);
    if (roots.length !== 1) {
      throw new Error(`Save must contain exactly one root for variable '${definition.key}'`);
    }
    validateRelationships(variableRows, nodesById, definition.key);
    const visited = new Set<number>();
    snapshot[definition.key] = decodeNode(roots[0], variableRows, visited, definition.key);
    if (visited.size !== variableRows.length) {
      throw new Error(`Save contains an orphan or cycle for variable '${definition.key}'`);
    }
  }
  if (grouped.size !== definitions.length) {
    throw new Error("Save does not contain the complete variable set");
  }
  return snapshot;
}

function validateRelationships(rows: readonly SaveNode[], nodesById: ReadonlyMap<number, SaveNode>, variableKey: string): void {
  for (const row of rows) {
    if (row.parentNodeId === null) {
      if (row.fieldKey !== null || row.arrayIndex !== null) {
        throw new Error(`Root node '${variableKey}/${row.nodeId}' has child coordinates`);
      }
      continue;
    }
    const parent = nodesById.get(row.parentNodeId);
    if (parent === undefined) {
      throw new Error(`Save node '${variableKey}/${row.nodeId}' has an orphan parent`);
    }
    if (parent.valueType !== "array" && parent.valueType !== "object") {
      throw new Error(`Save node '${variableKey}/${row.nodeId}' has a scalar parent`);
    }
    if (parent.valueType === "array" && (row.arrayIndex === null || row.fieldKey !== null)) {
      throw new Error(`Array child '${variableKey}/${row.nodeId}' has invalid coordinates`);
    }
    if (parent.valueType === "object" && (row.fieldKey === null || row.arrayIndex !== null)) {
      throw new Error(`Object child '${variableKey}/${row.nodeId}' has invalid coordinates`);
    }
  }
}

function decodeNode(row: SaveNode, rows: readonly SaveNode[], visited: Set<number>, variableKey: string): VariableValue {
  if (visited.has(row.nodeId)) {
    throw new Error(`Save contains a cycle for variable '${variableKey}'`);
  }
  visited.add(row.nodeId);
  if (row.valueType === "null") {
    return null;
  }
  if (row.valueType === "boolean") {
    return row.booleanValue === 1;
  }
  if (row.valueType === "number") {
    return row.numberValue as number;
  }
  if (row.valueType === "string") {
    return row.stringValue as string;
  }

  const children = rows.filter((child) => child.parentNodeId === row.nodeId);
  if (row.valueType === "array") {
    const indices = new Set<number>();
    for (const child of children) {
      const index = child.arrayIndex as number;
      if (indices.has(index)) {
        throw new Error(`Save contains duplicate array index ${index} for variable '${variableKey}'`);
      }
      indices.add(index);
    }
    children.sort((left, right) => (left.arrayIndex as number) - (right.arrayIndex as number));
    return children.map((child, index) => {
      if (child.arrayIndex !== index) {
        throw new Error(`Save contains non-contiguous array indexes for variable '${variableKey}'`);
      }
      return decodeNode(child, rows, visited, variableKey);
    });
  }

  const objectValue: Record<string, VariableValue> = {};
  const fields = new Set<string>();
  for (const child of children) {
    const field = child.fieldKey as string;
    if (fields.has(field)) {
      throw new Error(`Save contains duplicate object field '${field}' for variable '${variableKey}'`);
    }
    fields.add(field);
    Object.defineProperty(objectValue, field, {
      configurable: true,
      enumerable: true,
      value: decodeNode(child, rows, visited, variableKey),
      writable: true,
    });
  }
  return objectValue;
}

function validateNodeColumns(node: SaveNode): void {
  const scalarCount = [node.booleanValue, node.numberValue, node.stringValue].filter((value) => value !== null).length;
  if (node.valueType === "null" || node.valueType === "array" || node.valueType === "object") {
    if (scalarCount !== 0) {
      throw new Error(`Save node '${node.variableKey}/${node.nodeId}' has invalid scalar columns`);
    }
    return;
  }
  if (scalarCount !== 1) {
    throw new Error(`Save node '${node.variableKey}/${node.nodeId}' has invalid scalar columns`);
  }
  if (node.valueType === "boolean" && (node.booleanValue === null || !Number.isInteger(node.booleanValue) || (node.booleanValue !== 0 && node.booleanValue !== 1))) {
    throw new Error(`Save node '${node.variableKey}/${node.nodeId}' has an invalid boolean value`);
  }
  if (node.valueType === "number" && (node.numberValue === null || !Number.isFinite(node.numberValue))) {
    throw new Error(`Save node '${node.variableKey}/${node.nodeId}' has an invalid number value`);
  }
  if (node.valueType === "string" && node.stringValue === null) {
    throw new Error(`Save node '${node.variableKey}/${node.nodeId}' has an invalid string value`);
  }
}

function isValueType(value: string): value is SaveNode["valueType"] {
  return value === "null" || value === "boolean" || value === "number" || value === "string" || value === "array" || value === "object";
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

function requiredNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, name: string): number {
  const integer = requiredInteger(value, name);
  if (integer < 1) {
    throw new Error(`${name} must be positive`);
  }
  return integer;
}

function requiredNonNegativeInteger(value: unknown, name: string): number {
  const integer = requiredInteger(value, name);
  if (integer < 0) {
    throw new Error(`${name} must be non-negative`);
  }
  return integer;
}

function requiredTimestamp(value: unknown, name: string): number {
  return requiredNonNegativeInteger(value, name);
}
