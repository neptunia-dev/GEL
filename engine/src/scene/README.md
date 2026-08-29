# Scene 领域模型

`src/scene` 定义剧情图中的单个节点。一个场景描述一段可独立执行的剧情：

```text
场景 ID + 显式 main.lua 主入口 + 局部角色表 + 命名出口
```

场景不是完整故事控制器。它不会直接执行其他 Lua 文件，也不会保存 UI、Lua
协程或跨场景变量。

## 职责

`Scene` 负责以下静态信息：

- `id`：稳定场景标识，用于包清单、路由、存档和日志。
- `mainScriptPath`：场景显式声明的游戏包内 `main.lua` 主入口路径。
- `cast`：本场景允许执行舞台操作的角色局部绑定。
- `exits`：Lua 可以返回的命名出口。

运行时对象 `Scene` 通过构造函数校验并规范化这些数据，随后保持不可变。调用
`cast`、`exits`、`getCastMember()` 和 `toDefinition()` 得到的都是独立副本，调用方
不能修改内部场景数据。

## 非职责

以下职责不属于 `Scene`：

| 事项 | 所属模块 |
| --- | --- |
| `exit("accept")` 指向哪个场景 | `RouteTable` |
| 路由循环、进入下一个场景 | 后续的 `StoryRunner` |
| 从文件系统读取 Lua 文本 | `LoadedRuntimePackage` / `ReadonlyFileSystem` |
| 创建 Lua VM 或 coroutine | `SceneExecutor` 的具体实现 |
| 剧情变量和当前可恢复场景 | `GameState` |
| 存档与读档策略 | `SaveCoordinator` |
| 台词、输入、舞台画面 | TUI、GUI 或其他展示适配器 |
| 角色当前立绘选择 | `Character` 会话状态 |
| 角色当前的位置、可见状态和焦点 | 表现层会话状态 |

因此，Lua 只返回出口名：

```lua
return function(ctx)
  -- 当前场景逻辑
  return ctx.flow:exit("accept")
end
```

而不是按文件路径跳转：

```lua
-- 不支持这种场景切换方式
-- dofile("scenes/chapter-one.lua")
```

未来的故事调度器负责：

```text
Scene "prologue"
  + exit "accept"
  -> RouteTable
  -> Scene "chapter-one"
  -> 新建 Lua coroutine 并运行该场景
```

## 主入口约定

每个场景只有一个显式声明的 Lua 主入口。`main.lua` 文件属于**游戏包内容**，
不属于引擎源码目录 `engine/src/scene/`。推荐游戏包布局：

```text
game-package/
├─ manifest.json
└─ scenes/
   ├─ prologue/
   │  ├─ main.lua       # scene "prologue" 的入口
   │  └─ helpers.lua    # 未来允许的场景局部模块
   └─ chapter-one/
      └─ main.lua       # scene "chapter-one" 的入口
```

包清单必须显式保存入口，而不是由场景 ID 推导路径：

```ts
{
  id: "prologue",
  mainScript: "scenes/prologue/main.lua",
  exits: ["continue"]
}
```

显式声明有三个作用：

- 场景 ID 可以保持稳定，目录重命名或重组时只需更新包清单。
- 每个场景的可执行入口一目了然，其他 `.lua` 文件不会被误当作剧情入口。
- 场景目录可容纳未来的局部 Lua 模块、资源或编译产物，而不改变执行契约。

`Scene` 只校验 `mainScript` 是包内非根目录的 `main.lua`。文件是否存在、能否读取、
是否为 UTF-8、能否编译，仍由后续 package 加载阶段负责。

## 数据模型

### `SceneDefinition`

`SceneDefinition` 是编辑器、JSON 清单和包加载器使用的原始 DTO：

```ts
interface SceneDefinition {
  id: string;
  mainScript: string; // 例如 "scenes/prologue/main.lua"
  title?: string;
  cast?: readonly SceneCastMember[];
  exits?: readonly string[];
}
```

它可以来自外部数据，因此不能直接作为可信运行时对象使用。

### `Scene`

`Scene` 是由 `new Scene(definition)` 创建的已验证运行时值对象：

```ts
class Scene {
  readonly id: SceneId;
  readonly mainScriptPath: VirtualPath;

  get cast(): readonly SceneCastMember[];
  get exits(): readonly string[];
  hasCharacter(characterId: string): boolean;
  getCastMember(characterId: string): SceneCastMember | undefined;
  getCharacterIds(): readonly string[];
  hasExit(port: string): boolean;
  toDefinition(): SceneDefinition;
}
```

包加载阶段应完成如下转换：

```text
untrusted manifest / JSON
  -> SceneDefinition
  -> Scene
  -> SceneRegistry
  -> LuaSceneExecutor / StoryRunner
```

运行期代码应优先使用 `Scene`，不要重新读取未校验的 `SceneDefinition` 字段。

## Static Invariants

构造 `Scene` 时必须满足：

- `id` 匹配 `^[a-z][a-z0-9_.-]*$`。
- `mainScript` 是没有首尾空白的游戏包内相对路径。
- `mainScript` 规范化后必须是非根目录内的 `main.lua`，不能是绝对路径或越出包根目录。
- 缺失的 `cast` 和 `exits` 统一变为 `[]`。
- 每个 `cast` 成员都有非空 `characterId`；角色在同一场景中不能重复。
- `role` 和 `displayName` 若出现，必须是非空文本。
- 每个出口是非空文本；同一场景中出口不能重复。

`Scene` 只校验自身可以确定的约束。以下跨对象校验应由包加载阶段完成：

- `mainScript` 文件是否存在、是否是合法 UTF-8、是否能编译。
- `cast.characterId` 是否存在于全局 `CharacterRegistry`。
- 场景出口是否都在 `RouteTable` 中有目标。
- 路由源场景、路由目标场景和入口场景是否存在。
- 不可达场景、没有结局的路由循环等图诊断。

## 局部角色表

`cast` 表示这个场景可以让哪些角色执行 `ctx.stage:*` 操作：

```ts
{
  characterId: "alice",
  role: "club-president",
  displayName: "Alice"
}
```

它不是当前画面中已经登场的角色列表。角色是否显示、在左还是右以及当前焦点
属于表现层；角色当前选择的立绘属于会话中的 `Character` 状态，同一个角色可以
在场景开始时尚未登场。

角色是否允许用作普通台词说话人是另一项未来的包级规则。V1 中 `cast` 只定义
舞台操作范围，不把画外音或旁白强行限制在其中。

## 出口

`exits` 表示场景可合法返回的命名出口：

```ts
exits: ["accept", "decline"]
```

Lua runtime 在收到对应集合后会拒绝未声明的出口：

```lua
return ctx.flow:exit("accept")  -- allowed
return ctx.flow:exit("missing") -- rejected
```

空出口集合具有明确语义：该场景只能调用 `ctx.flow:end_story()`，不能调用
`ctx.flow:exit(...)`。未传入出口集合仅适用于旧的单文件调试场景；正式的
`SceneExecutor` 的具体实现必须总是传入 `scene.exits`。

出口只是一种本场景的语义名称，不是下一个场景 ID，也不是 Lua 文件路径。
路由关系属于包级 `RouteTable`：

```text
routes["prologue"]["accept"] = "chapter-one"
```

## 执行边界

`SceneExecutor` 是单场景执行的接口：

```ts
interface SceneExecutor {
  execute(scene: Scene): Promise<SceneResult>;
}
```

具体实现将由 Lua 执行层完成：读取 `scene.mainScriptPath` 指向的 `main.lua`，
把 `scene.getCharacterIds()` 和 `scene.exits` 传入 `LuaRuntime`，并返回：

```ts
{ type: "exit", port: "accept" }
// or
{ type: "end" }
```

它不解析出口路由，也不进入下一个场景。包级 `StoryRunner` 会在后续实现中用循环
协调 `SceneExecutor` 和 `RouteTable`，从而避免 Lua 场景之间形成嵌套调用栈。

## 模块结构

```text
src/scene/
├─ README.md            领域边界与不变量说明
├─ index.ts             稳定公共导出
├─ scene.ts             已验证、不可变的运行时 Scene
├─ scene-definition.ts  原始可序列化 DTO 与局部角色绑定
├─ scene-id.ts          Scene ID 类型与校验
├─ scene-result.ts      Lua 场景完成结果
└─ scene-executor.ts    单场景执行契约
```

`scene/` 只描述单个剧情节点及其执行契约。场景集合、清单解码和脚本源码访问
属于 package 层：

```text
src/package/
├─ runtime-package.ts   含 SceneDefinition[] 的原始包 DTO
├─ scene-registry.ts    已验证 Scene 实例的查询接口
├─ route-table.ts       (场景 ID, 出口) -> 下一个场景 ID
└─ package-loader.ts    清单与包来源的加载边界
```

`PackageLoader` 会把 `SceneDefinition` 转换为 `Scene`，并与资源、角色、路由
一起组装为 `LoadedRuntimePackage`。已加载包持有 `ReadonlyFileSystem`，提供经过
校验的场景和脚本查询；每个游戏会话再创建自己的可变角色注册表。这里刻意不保留
独立的 `SceneLoader`：若单独存在，它会把同一份游戏包的加载职责拆散到两个模块，
导致清单校验、脚本读取和场景注册的失败语义难以保持一致。

## 测试要求

场景测试应至少验证：

- DTO 到 `Scene` 的 `main.lua` 入口路径与文本规范化。
- 非法 ID、非法 `mainScript` 路径、重复角色和重复出口被拒绝。
- 缺失 `cast`、`exits` 时得到空集合。
- 修改输入 DTO、getter 返回值或 `toDefinition()` 结果不会改写 `Scene`。
- 当执行器传入空出口集合时，Lua runtime 拒绝 `ctx.flow:exit(...)`。
