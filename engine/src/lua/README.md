# GEL Lua 场景语言

GEL 不重新设计 Lua 语法，而是定义一套面向 Galgame 场景的宿主 API。
Lua 代码负责剧情逻辑，宿主负责状态、输入和表现适配。Lua 脚本不依赖
TUI、Blessed 或任何图形渲染器。

## 目录职责

```text
src/lua/
├─ api/
│  ├─ implementations/ # 各命名空间 API 类
│  └─ registry/        # API 注册器和 API 清单
├─ protocol/  # 请求、响应、表现命令和校验
├─ runtime/   # VM、协程和脚本加载
├─ values/    # Lua 可序列化值及转换
├─ sandbox/   # 标准库和指令限制
└─ errors/    # Lua 错误和 traceback
```

`api/` 的开发约定：一个 Lua 命名空间对应一个 `LuaApi` 子类。类的构造
函数用 `expose()` 自注册方法；不要在 `context.ts` 里重复维护方法列表。
核心类只在 `registry/core-api-catalog.ts` 集中列出一次，开发期扩展类则由
`registry/development-api-catalog.ts` 统一组装。

## 开发期新增 API

每个命名空间使用一个 `LuaApi` 子类。API 方法在构造函数里通过
`expose()` 自注册，错误包装和 Lua 函数挂载由基类与注册器统一完成：

```ts
class DebugApi extends LuaApi {
  public readonly namespace = "debug";
  public readonly capability = "debug";

  public constructor(host: LuaApiHost) {
    super(host);
    this.expose("mark", "sync", this.mark);
  }

  private mark(state: LuaState): number {
    // 参数解析和业务逻辑只写在这里
    return 0;
  }
}
```

开发期扩展只需要写这个类并提供一个 factory，不需要修改 `context.ts` 或
注册器：

```ts
const runtime = new LuaRuntime();
runtime.run(source, handler, {
  state: gameState,
  apiFactories: [(host) => new DebugApi(host)]
});
```

所有 API 错误都会统一带上调用路径、错误码和可读消息，例如：

```text
ctx.stage.show: options.side must be 'left' or 'right' [E_ARGUMENT]
```

## 脚本入口

每个场景脚本返回一个接收 `ctx` 的函数：

```lua
return function(ctx)
  -- 场景逻辑
  return ctx.flow:exit("next")
end
```

场景 ID、角色表和出口表属于 `SceneDefinition`，由引擎在创建 runtime
时传入并校验。

## 上下文 API

### `ctx.stage`

舞台变化是显式的。台词不会自动让角色登场，也不会自动改变角色位置。

```lua
ctx.stage:show("alice", {
  side = "left",
  expression = "smile",
  role = "同班同学"
})
ctx.stage:move("alice", "right")
ctx.stage:focus("alice")
ctx.stage:focus(nil) -- 取消聚焦
ctx.stage:hide("alice")
```

`show` 的 `side` 只能是 `left` 或 `right`。如果 runtime 提供了场景角色
表，未声明的角色会在 Lua 边界被拒绝。

### `ctx.dialogue`

台词请求会暂停 Lua 协程，宿主显示内容后再恢复协程。

```lua
ctx.dialogue:say("alice", "今天一起回家吗？")
ctx.dialogue:monologue("我该怎么回答？")
ctx.dialogue:narrate("走廊重新安静下来。")
ctx.dialogue:offscreen("bob", "我在这里。")

local answer = ctx.dialogue:choice({
  { id = "accept", text = "一起回家" },
  { id = "decline", text = "还有事情", enabled = false }
})
```

台词协议中的 `mode` 有四种：`character`、`monologue`、`narration` 和
`offscreen`。选项 ID 必须非空且不能重复；宿主只能回复一个启用中的
选项 ID。

### `ctx.state`

游戏级变量系统，所有变量必须在创建 `GameState` 时预声明并提供 schema 和默认值。
变量通过 `VariableStore` 管理，支持递归 schema 校验和封闭对象。

```lua
ctx.state:set("route.alice.seen", true)
ctx.state:add("affection.alice", 1)
local score = ctx.state:get("score")
if ctx.state:has("flags.intro") then
  ctx.state:reset("flags.intro")
end
```

可用方法：
- `get(key)` - 读取变量值（深复制）
- `set(key, value)` - 写入变量值（校验 + 深复制）
- `add(key, amount)` - 数字变量累加，返回新值
- `has(key)` - 检查变量是否存在（预声明变量总是返回 true）
- `reset(key)` - 重置为默认值

不再提供 `remove` 方法：每个变量始终有默认值，不存在"删除变量"的有效语义。

变量值类型：`nil`、布尔值、有限数字、字符串、数组和对象表。对象必须包含
schema 声明的所有字段，不允许额外字段。数组与对象在读写时深复制。

### `ctx.time`

等待请求会暂停协程，由宿主决定真实时间或开发模式下的立即确认：

```lua
ctx.time:wait(0.5)
```

### `ctx.flow`

场景只返回出口结果，不直接跳转其他场景。实际路线由场景路由表解析：

```lua
return ctx.flow:exit("accept")
-- 或
return ctx.flow:end_story()
```

## 运行时配置

`LuaRuntime.run` 的 `LuaRunOptions` 必需参数：

- `state: GameState` - 游戏状态，持有 packageId、saveSchemaVersion、sceneId 和变量定义

可选参数：

- `characterIds?: string[]` - 场景角色表，用于校验 `ctx.stage` 调用
- `exits?: string[]` - 场景出口表，用于校验 `ctx.flow` 调用
- `onPresentation?: (event) => void` - 接收非阻塞表现命令（舞台变化）
- `apiFactories?: LuaApiFactory[]` - 开发期扩展 API

同一个 `GameState` 可被多个场景运行共享，变量在场景间自动传递。

## 宿主协议

`stage` 方法产生非阻塞的 `LuaPresentationCommand`，由宿主通过
`onPresentation` 接收。`dialogue`、`choice` 和 `wait` 产生 `LuaRequest`，
由 `LuaRuntime.run` 的 handler 回复：

```ts
const runtime = new LuaRuntime();
const result = await runtime.run(source, async (request) => {
  // TUI 或图形渲染器处理 request
  return request.type === "choice" ? selectedOptionId : undefined;
}, {
  state: gameState,
  characterIds: ["alice", "bob"],
  exits: ["accept", "decline"],
  onPresentation: (event) => presentation.apply(event.command)
});
```

对话和等待请求只能收到 `undefined` 或 `null`；选项请求必须收到当前
启用选项的字符串 ID。runtime 会在恢复 Lua 前校验回复。

## RuntimePackage 元数据

`RuntimePackage` 接口定义游戏包的完整运行时描述：

```ts
interface RuntimePackage {
  formatVersion: number;      // manifest 格式版本
  packageId: string;          // 稳定包标识符
  packageVersion: string;     // 游戏内容版本
  saveSchemaVersion: number;  // 存档/运行时状态版本
  entryScene: string;         // 入口场景 ID
  assets: AssetDefinition[];  // 资源声明
  characters: CharacterDefinition[]; // 角色声明
  variables: VariableDefinition[]; // 变量声明
  scenes: SceneDefinition[];  // 场景定义数组
  routes: Record<string, Record<string, string>>; // 场景路由表
}
```

变量定义由 `RuntimePackage` 传入 `GameState` 构造函数，确保游戏包的
变量声明、版本号与运行时状态一致。

## 存档与恢复

使用 `SqliteSaveStore` 存储完整游戏状态到 SQLite 数据库：

```ts
import { SqliteSaveStore } from "@gel/engine";

const store = new SqliteSaveStore("./saves.db");
store.saveAuto(gameState); // 替换自动存档槽位
const slot = store.createManual(gameState, "第二章开始"); // 创建手动槽位
const slots = store.list(); // 列出所有槽位
store.load(slot.id, gameState); // 加载槽位到 gameState
store.delete(slot.id); // 删除槽位
store.close(); // 关闭数据库连接
```

方法说明：

- `saveAuto(state)` - 保存或替换自动存档槽位（id 为 `auto`），返回 `SaveSlot`
- `createManual(state, label?)` - 创建新手动存档，返回包含 UUID 的 `SaveSlot`
- `overwriteManual(id, state, label?)` - 覆盖现有手动存档，返回 `SaveSlot`
- `load(id, state)` - 验证槽位的 packageId、saveSchemaVersion、sceneId 与目标 state 匹配，通过后恢复变量快照到 state，返回 `SaveSlot`
- `list()` - 返回所有槽位元数据（按 updatedAt 降序）
- `delete(id)` - 删除指定槽位
- `close()` - 关闭 SQLite 连接

存档内容：

- 元数据：packageId、saveSchemaVersion、sceneId、label、createdAt、updatedAt
- 变量快照：所有声明变量的完整树形值（规范化存储在 save_value_nodes 表）

加载行为：

- `load(id, state)` 验证槽位的 packageId、saveSchemaVersion、sceneId 必须与目标 state 当前值匹配
- 验证通过后调用 `state.restore(snapshot)` 恢复所有变量值
- **不修改** `state.sceneId`：调用方需在加载前将 state.sceneId 设置为槽位记录的场景 ID
- **不恢复**：Lua 协程状态、局部变量、TUI 渲染帧、回滚历史

场景切换协调：

- 存档前：确保 `state.sceneId` 已设置为当前场景 ID
- 加载后：读取返回的 `SaveSlot.sceneId`，调度场景执行器从该场景重新开始
- 场景调度由调用方实现（`SceneExecutor` 只定义单场景执行契约，尚未实现；路由与跨场景循环不属于 Lua runtime）

存档校验：

- packageId 必须匹配
- saveSchemaVersion 必须匹配
- sceneId 必须匹配
- 所有变量值必须通过 schema 校验
- 损坏数据或版本不匹配直接拒绝，不提供迁移或宽松恢复

存储实现：

- 使用 Node.js >= 22.5.0 `node:sqlite` DatabaseSync 同步 API
- 规范化关系存储：save_slots + save_value_nodes 表
- 事务写入保证原子性（BEGIN IMMEDIATE / COMMIT / ROLLBACK）
- 外键级联删除保证引用完整性

## 沙箱

默认保留 `table`、`string`、`math` 和 `utf8` 库。文件、进程、模块加载、
调试和动态代码加载相关的全局对象会被移除。可以通过
`sandbox.instructionLimit` 设置每个协程的指令上限。

后续如果需要公共 Lua 库，应由游戏包提供受控模块解析器，而不是重新开放
任意文件系统访问。
