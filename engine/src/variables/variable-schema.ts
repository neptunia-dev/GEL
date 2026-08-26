/** Values accepted by a declared game variable. */
export type VariableValue =
  | null
  | boolean
  | number
  | string
  | VariableValue[]
  | { [key: string]: VariableValue };

export interface NullVariableSchema {
  readonly type: "null";
}

export interface BooleanVariableSchema {
  readonly type: "boolean";
}

export interface NumberVariableSchema {
  readonly type: "number";
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface StringVariableSchema {
  readonly type: "string";
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string | RegExp;
  readonly enum?: readonly string[];
}

export interface ArrayVariableSchema {
  readonly type: "array";
  readonly items: VariableSchema;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface ObjectVariableSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, VariableSchema>>;
}

/** Recursive, closed schema for a game variable. */
export type VariableSchema =
  | NullVariableSchema
  | BooleanVariableSchema
  | NumberVariableSchema
  | StringVariableSchema
  | ArrayVariableSchema
  | ObjectVariableSchema;

export interface VariableDefinition<T extends VariableValue = VariableValue> {
  readonly key: string;
  readonly schema: VariableSchema;
  readonly defaultValue: T;
  readonly readonly?: boolean;
}

export const VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_.-]*$/;

export function validateVariableSchema(schema: VariableSchema, path = "schema"): void {
  validateSchema(schema, path, new Set<object>());
}

export function validateVariableDefinition(definition: VariableDefinition, path = "definition"): void {
  if (definition === null || typeof definition !== "object") {
    throw new TypeError(`${path} must be an object`);
  }
  if (typeof definition.key !== "string" || !VARIABLE_KEY_PATTERN.test(definition.key)) {
    throw new TypeError(`${path}.key must match ${VARIABLE_KEY_PATTERN.source}`);
  }
  validateVariableSchema(definition.schema, `${path}.schema`);
  if (definition.readonly !== undefined && typeof definition.readonly !== "boolean") {
    throw new TypeError(`${path}.readonly must be a boolean`);
  }
  validateVariableValue(definition.defaultValue, definition.schema, `${path}.defaultValue`);
}

export function validateVariableValue(value: unknown, schema: VariableSchema, path = "value"): asserts value is VariableValue {
  switch (schema.type) {
    case "null":
      if (value !== null) {
        throw new TypeError(`${path} must be null`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new TypeError(`${path} must be a boolean`);
      }
      return;
    case "number":
      validateNumber(value, schema, path);
      return;
    case "string":
      validateString(value, schema, path);
      return;
    case "array":
      validateArray(value, schema, path);
      return;
    case "object":
      validateObject(value, schema, path);
      return;
    default:
      throw new TypeError(`${path} has an unsupported schema type`);
  }
}

export function cloneVariableValue(value: VariableValue): VariableValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneVariableValue(item));
  }
  const clone: { [key: string]: VariableValue } = {};
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: cloneVariableValue(item),
      writable: true,
    });
  }
  return clone;
}

export function cloneVariableSchema(schema: VariableSchema): VariableSchema {
  switch (schema.type) {
    case "null":
    case "boolean":
      return { type: schema.type };
    case "number":
      return {
        type: "number",
        ...(schema.integer === undefined ? {} : { integer: schema.integer }),
        ...(schema.min === undefined ? {} : { min: schema.min }),
        ...(schema.max === undefined ? {} : { max: schema.max }),
      };
    case "string":
      return {
        type: "string",
        ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }),
        ...(schema.maxLength === undefined ? {} : { maxLength: schema.maxLength }),
        ...(schema.pattern === undefined
          ? {}
          : { pattern: typeof schema.pattern === "string" ? schema.pattern : clonePattern(schema.pattern) }),
        ...(schema.enum === undefined ? {} : { enum: [...schema.enum] }),
      };
    case "array":
      return {
        type: "array",
        items: cloneVariableSchema(schema.items),
        ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }),
        ...(schema.maxLength === undefined ? {} : { maxLength: schema.maxLength }),
      };
    case "object": {
      const properties: Record<string, VariableSchema> = {};
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        Object.defineProperty(properties, key, {
          configurable: true,
          enumerable: true,
          value: cloneVariableSchema(propertySchema),
          writable: true,
        });
      }
      return { type: "object", properties };
    }
  }
}

export function cloneVariableDefinition(definition: VariableDefinition): VariableDefinition {
  return {
    key: definition.key,
    schema: cloneVariableSchema(definition.schema),
    defaultValue: cloneVariableValue(definition.defaultValue),
    ...(definition.readonly === undefined ? {} : { readonly: definition.readonly }),
  };
}

function validateSchema(schema: VariableSchema, path: string, ancestors: Set<object>): void {
  if (schema === null || typeof schema !== "object") {
    throw new TypeError(`${path} must be an object`);
  }
  if (ancestors.has(schema)) {
    throw new TypeError(`${path} must not be cyclic`);
  }
  ancestors.add(schema);
  try {
    switch (schema.type) {
      case "null":
      case "boolean":
        return;
      case "number":
        validateOptionalBoolean(schema.integer, `${path}.integer`);
        validateNumberBound(schema.min, `${path}.min`);
        validateNumberBound(schema.max, `${path}.max`);
        if (schema.min !== undefined && schema.max !== undefined && schema.min > schema.max) {
          throw new RangeError(`${path}.min must not exceed ${path}.max`);
        }
        return;
      case "string":
        validateLength(schema.minLength, `${path}.minLength`);
        validateLength(schema.maxLength, `${path}.maxLength`);
        if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) {
          throw new RangeError(`${path}.minLength must not exceed ${path}.maxLength`);
        }
        if (schema.pattern !== undefined) {
          try {
            clonePattern(schema.pattern);
          } catch {
            throw new TypeError(`${path}.pattern must be a valid regular expression`);
          }
        }
        if (schema.enum !== undefined) {
          if (!Array.isArray(schema.enum)) {
            throw new TypeError(`${path}.enum must be an array`);
          }
          for (const value of schema.enum) {
            if (typeof value !== "string") {
              throw new TypeError(`${path}.enum must contain only strings`);
            }
          }
        }
        return;
      case "array":
        validateLength(schema.minLength, `${path}.minLength`);
        validateLength(schema.maxLength, `${path}.maxLength`);
        if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) {
          throw new RangeError(`${path}.minLength must not exceed ${path}.maxLength`);
        }
        validateSchema(schema.items, `${path}.items`, ancestors);
        return;
      case "object":
        if (schema.properties === null || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
          throw new TypeError(`${path}.properties must be an object`);
        }
        if (Object.getOwnPropertySymbols(schema.properties).length > 0) {
          throw new TypeError(`${path}.properties must not contain symbol keys`);
        }
        for (const key of Object.getOwnPropertyNames(schema.properties)) {
          if (!Object.prototype.propertyIsEnumerable.call(schema.properties, key)) {
            throw new TypeError(`${path}.properties must not contain non-enumerable keys`);
          }
        }
        for (const [key, propertySchema] of Object.entries(schema.properties)) {
          validateSchema(propertySchema, `${path}.properties.${key}`, ancestors);
        }
        return;
      default:
        throw new TypeError(`${path}.type is unsupported`);
    }
  } finally {
    ancestors.delete(schema);
  }
}

function validateNumber(value: unknown, schema: NumberVariableSchema, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  if (schema.integer === true && !Number.isInteger(value)) {
    throw new TypeError(`${path} must be an integer`);
  }
  if (schema.min !== undefined && value < schema.min) {
    throw new RangeError(`${path} must be at least ${schema.min}`);
  }
  if (schema.max !== undefined && value > schema.max) {
    throw new RangeError(`${path} must be at most ${schema.max}`);
  }
}

function validateString(value: unknown, schema: StringVariableSchema, path: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    throw new RangeError(`${path} must contain at least ${schema.minLength} characters`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw new RangeError(`${path} must contain at most ${schema.maxLength} characters`);
  }
  if (schema.pattern !== undefined && !clonePattern(schema.pattern).test(value)) {
    throw new TypeError(`${path} does not match the required pattern`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    throw new TypeError(`${path} must be one of the declared values`);
  }
}

function validateArray(value: unknown, schema: ArrayVariableSchema, path: string): asserts value is VariableValue[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    throw new RangeError(`${path} must contain at least ${schema.minLength} items`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw new RangeError(`${path} must contain at most ${schema.maxLength} items`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new TypeError(`${path} must not contain sparse holes`);
    }
    validateVariableValue(value[index], schema.items, `${path}[${index}]`);
  }
}

function validateObject(value: unknown, schema: ObjectVariableSchema, path: string): asserts value is { [key: string]: VariableValue } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${path} must not contain symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      throw new TypeError(`${path} must not contain non-enumerable keys`);
    }
  }
  const valueKeys = Object.keys(value);
  const schemaKeys = Object.keys(schema.properties);
  for (const key of valueKeys) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
      throw new TypeError(`${path} must not contain undeclared field '${key}'`);
    }
  }
  for (const key of schemaKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new TypeError(`${path} is missing required field '${key}'`);
    }
    validateVariableValue((value as { [key: string]: unknown })[key], schema.properties[key], `${path}.${key}`);
  }
}

function validateOptionalBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean`);
  }
}

function validateNumberBound(value: unknown, path: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new TypeError(`${path} must be a finite number`);
  }
}

function validateLength(value: unknown, path: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
    throw new TypeError(`${path} must be a non-negative integer`);
  }
}

function clonePattern(pattern: string | RegExp): RegExp {
  return pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(pattern);
}
