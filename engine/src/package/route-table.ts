/** 编辑器图编译后写入 manifest.json 的路由 DTO。 */
export type RouteTableDefinition = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** 一条已经规范化的场景出口路由。 */
export interface RouteEntry {
  readonly sourceSceneId: string;
  readonly port: string;
  readonly targetSceneId: string;
}

/**
 * 已验证、不可变的场景出口路由表。
 *
 * RouteTable 只负责保存和查询路由自身的数据完整性：场景 ID 必须合法，
 * 出口名必须是非空文本，目标必须是合法场景 ID。源场景是否存在、出口是否
 * 在源 Scene 中声明，属于 package 加载阶段的跨对象校验。
 */
export class RouteTable {
  private readonly routes = new Map<string, Map<string, string>>();

  public constructor(definition: RouteTableDefinition = {}) {
    const routes = asRecord(definition, "routes");
    for (const sourceKey of Object.keys(routes)) {
      const sourceSceneId = requireSceneId(sourceKey, `routes.${sourceKey}`);
      const ports = asRecord(routes[sourceKey], `routes.${sourceSceneId}`);
      const normalizedPorts = new Map<string, string>();

      for (const portKey of Object.keys(ports)) {
        const port = normalizePort(portKey, `routes.${sourceSceneId}`);
        if (normalizedPorts.has(port)) {
          throw new TypeError(
            `Route table contains duplicate port '${port}' for scene '${sourceSceneId}'`,
          );
        }
        const targetSceneId = requireSceneId(
          ports[portKey],
          `routes.${sourceSceneId}.${port}`,
        );
        normalizedPorts.set(port, targetSceneId);
      }

      this.routes.set(sourceSceneId, normalizedPorts);
    }
  }

  /**
   * 解析一条路由；没有对应源场景或出口时返回 undefined。
   *
   * 查询参数仍会经过同一套边界校验，避免无效 ID 在日志或调用方中静默传播。
   */
  public resolve(sceneId: string, port: string): string | undefined {
    const sourceSceneId = requireSceneId(sceneId, "source scene ID");
    const normalizedPort = normalizePort(port, "route port");
    return this.routes.get(sourceSceneId)?.get(normalizedPort);
  }

  /** 判断路由表中是否存在指定的源场景和出口。 */
  public has(sceneId: string, port: string): boolean {
    return this.resolve(sceneId, port) !== undefined;
  }

  /**
   * 返回一个源场景的所有出口映射副本。
   *
   * 未登记的源场景返回 undefined；已登记但没有出口的场景返回空对象。
   */
  public get(sceneId: string): Readonly<Record<string, string>> | undefined {
    const sourceSceneId = requireSceneId(sceneId, "source scene ID");
    const ports = this.routes.get(sourceSceneId);
    return ports === undefined ? undefined : copyPorts(ports);
  }

  /** 返回源场景的出口名副本，未知场景返回空数组。 */
  public getPorts(sceneId: string): readonly string[] {
    const sourceSceneId = requireSceneId(sceneId, "source scene ID");
    return [...(this.routes.get(sourceSceneId)?.keys() ?? [])];
  }

  /** 返回所有路由条目的独立数组副本。 */
  public entries(): readonly RouteEntry[] {
    const entries: RouteEntry[] = [];
    for (const [sourceSceneId, ports] of this.routes) {
      for (const [port, targetSceneId] of ports) {
        entries.push({ sourceSceneId, port, targetSceneId });
      }
    }
    return entries;
  }

  /** 导出规范化后的清单 DTO 副本。 */
  public toDefinition(): RouteTableDefinition {
    const definition: Record<string, Record<string, string>> = {};
    for (const [sourceSceneId, ports] of this.routes) {
      Object.defineProperty(definition, sourceSceneId, {
        configurable: true,
        enumerable: true,
        value: copyPorts(ports),
        writable: true,
      });
    }
    return definition;
  }
}

/** 只接受 JSON/DTO 风格的对象记录，并拒绝隐藏的不可枚举和 symbol 字段。 */
function asRecord(value: unknown, path: string): Record<string, any> {
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
  return value as Record<string, any>;
}

/** 场景 ID 不允许静默 trim；它会出现在路由和存档中，必须保持稳定。 */
function requireSceneId(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]*$/.test(value)) {
    throw new TypeError(`${path} must match /^[a-z][a-z0-9_.-]*$/`);
  }
  return value;
}

/** 出口名与 Scene 的规范化规则一致：去除首尾空白，但拒绝空值。 */
function normalizePort(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${path} must contain a non-empty port name`);
  }
  return normalized;
}

/** 通过 defineProperty 写入，避免特殊字符串触发普通对象的原型访问器。 */
function copyPorts(ports: ReadonlyMap<string, string>): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const [port, targetSceneId] of ports) {
    Object.defineProperty(copy, port, {
      configurable: true,
      enumerable: true,
      value: targetSceneId,
      writable: true,
    });
  }
  return copy;
}
