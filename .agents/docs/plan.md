# 变量与存档系统

对现有临时 `ctx.state` 做**破坏性升级**：改为游戏级、预声明、递归 schema 校验的变量系统，使用 Node.js 22.5+ 内置 `node:sqlite` DatabaseSync 实现规范化关系存储。旧 `LuaRunOptions.variables`、动态键和旧存档不兼容，不提供迁移。

```ts
const state = new GameState({
  packageId: "example.story",
  schemaVersion: 1,
  sceneId: "prologue",
  variables: [
    { key: "flags.met_alice", schema: { type: "boolean" }, defaultValue: false },
    { key: "alice.affection", schema: { type: "number", min: 0, max: 100 }, defaultValue: 0 },
    {
      key: "route.profile",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      defaultValue: { name: "", tags: [] },
    },
  ],
});
```

## 变量

实现于 `engine/src/variables/`：

- `VariableSchema`：递归类型声明，支持 `null`、`boolean`、`number`、`string`、`array`、封闭 `object`
- number 支持整数约束、最小/最大值；string 支持长度、正则、枚举；array 声明元素 schema 与长度范围
- object 仅允许 schema 声明的字段，所有字段必须存在；缺失、额外或类型不符均报错
- `VariableStore`：`get/set/add/has/reset/snapshot/restore`。数组与对象在读写及快照时深复制
- 所有变量必须预声明，键遵循 `^[a-z][a-z0-9_.-]*$`；未知键、只读写入和非法值均失败

```lua
ctx.state:set("route.profile", { name = "Alice", tags = { "friend" } })
ctx.state:add("alice.affection", 2)
ctx.state:reset("flags.met_alice")
```

Lua API 提供 `get/set/add/has/reset`：删除 `remove`，因为每个声明变量始终有默认值，不存在"删除变量"的有效语义。

## 运行时

- `GameState`：持有 `packageId`、`schemaVersion`、可变 `sceneId` 和 `VariableStore`
- `RuntimePackage` 增加稳定包 ID、schema 版本和变量定义
- `LuaApiHost.variables` 持有 `VariableStore` 引用
- `LuaRunOptions.state` 为必需的 `GameState`；删除旧 `variables: Record<string, unknown>` 回写逻辑
- 同一个 `GameState` 可被多个场景运行共享

## 存档

实现于 `engine/src/saves/`：

```ts
const store = new SqliteSaveStore("./saves.db");
store.saveAuto(state);
const slot = store.createManual(state, "第二章前");
const loaded = store.load(slot.id, state);
```

- 使用 Node.js 22.5+ `node:sqlite` DatabaseSync 同步 API
- 规范化关系存储：`save_slots` 表存储元数据，`save_value_nodes` 表以树形节点结构存储变量值
- 每个槽位保存：`packageId`、`schemaVersion`、`sceneId`、完整变量快照、`createdAt`、`updatedAt`
- 一个固定自动存档槽位 id 为 `auto`；手动槽位以引擎生成 UUID 存储，显示名 `label` 作为元数据
- `saveAuto(state)` 原地替换自动槽位，保留原 createdAt
- `createManual(state, label?)` 创建新手动槽位，返回新 UUID
- `overwriteManual(id, state, label?)` 替换现有手动槽位，保留原 createdAt
- `load(id, state)` 严格校验 packageId、schemaVersion、sceneId 必须与目标 state 匹配，通过后仅恢复变量快照（调用 `state.restore(snapshot)`），不修改 sceneId
- `list()` 返回所有槽位元数据，按 updatedAt 降序排列
- `delete(id)` 删除槽位，外键级联自动删除关联节点
- `close()` 关闭 SQLite 连接
- 事务写入：`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` 保证原子性
- 外键约束与级联删除保证引用完整性
- 任意版本/schema 不匹配、损坏数据或校验失败直接拒绝；不提供迁移、降级或宽松恢复
- 场景切换由调用方协调：存档前设置 `state.sceneId` 到当前场景，加载后根据槽位的 sceneId 调度场景执行器

## 验证要求

- 变量：定义/默认值递归校验、对象封闭性、约束范围、只读保护、深复制、reset 行为、未知键拒绝
- Lua：嵌套 table 读写、跨运行共享状态、非法写入错误、`remove` 不再暴露
- 存档：自动/手动槽位创建、覆盖/删除、损坏数据拒绝、事务回滚、包/schema/场景不匹配拒绝、节点树完整性
- 更新 Lua README 和公开导出；运行 `npm run typecheck`、`npm test`、`npm run build`

## 实现假设

- Node.js >= 22.5.0（`node:sqlite` DatabaseSync 可用）
- 旧变量 API 使用方和旧存档均可直接失效
- 数据库文件路径由宿主传入，游戏包保持只读
- 变量定义由 TypeScript 运行时配置提供；外部包格式解析由 `PackageLoader` 负责

## 明确非目标

- **不提供**迁移或兼容旧版本的变量/存档数据
- **不提供**加密或云端同步
- **不提供**多进程/多窗口存档协调
- **不提供**存档 UI 组件（TUI/图形界面自行实现）
- **不依赖** SceneRunner（仅存在接口占位，未实现；场景调度由调用方处理）
- **不使用** JSON 文件存储（纯 SQLite）
