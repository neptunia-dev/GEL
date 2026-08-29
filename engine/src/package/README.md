# GEL Runtime Package v1

GEL Runtime Package 是编辑器编译后交给引擎运行的游戏包格式。

它只描述运行时需要的内容，不保存编辑器画布坐标、节点选中状态、注释、撤销历史等编辑器数据。
目录包和压缩包可以使用同一份逻辑结构；引擎通过 `ReadonlyFileSystem` 访问包内文件，不依赖宿主操作系统路径。

## 设计目标

Runtime Package v1 必须满足：

- 编辑器可以稳定、确定地生成。
- 引擎可以在加载阶段一次性完成结构和引用校验。
- 运行时不使用宿主绝对路径或隐式文件推断。
- 一个 `Scene` 只有一个明确的 `main.lua` 入口。
- 资源通过稳定 ID 引用，而不是在脚本或清单中散落文件路径。
- 包定义与游戏会话状态分离。
- 目录包、内存包和未来的压缩包使用相同的上层契约。

## 包目录

推荐的目录结构如下：

```text
example-story/
├─ manifest.json
├─ scenes/
│  ├─ prologue/
│  │  └─ main.lua
│  ├─ chapter-one/
│  │  └─ main.lua
│  └─ ending/
│     └─ main.lua
└─ assets/
   ├─ ui/
   │  └─ cover.png
   ├─ characters/
   │  └─ alice/
   │     ├─ normal.png
   │     └─ smile.png
   └─ backgrounds/
      └─ classroom.png
```

同一目录可以发布为 `.gelpkg` 压缩包。压缩格式属于包来源层，不改变
`manifest.json` 和包内逻辑路径的规则。

### 保留路径

- `manifest.json`：包的唯一运行时清单，必须位于包根目录。
- `scenes/`：场景入口脚本和场景局部文件。
- `assets/`：由清单声明的游戏资源。

v1 不允许使用包根目录的 `main.lua` 作为故事入口。

## manifest.json

完整示例：

```json
{
  "formatVersion": 1,
  "packageId": "example.story",
  "packageVersion": "1.0.0",
  "saveSchemaVersion": 1,
  "entryScene": "prologue",

  "engine": {
    "minVersion": "0.1.0"
  },

  "metadata": {
    "title": "Example Story",
    "author": "GEL",
    "language": "zh-CN",
    "cover": "asset.cover"
  },

  "assets": [
    {
      "id": "asset.cover",
      "kind": "image",
      "path": "assets/ui/cover.png"
    },
    {
      "id": "portrait.alice.normal",
      "kind": "image",
      "path": "assets/characters/alice/normal.png"
    },
    {
      "id": "portrait.alice.smile",
      "kind": "image",
      "path": "assets/characters/alice/smile.png"
    }
  ],

  "characters": [
    {
      "id": "alice",
      "name": "爱丽丝",
      "aliases": ["Alice"],
      "tags": ["heroine"],
      "portraits": [
        {
          "id": "normal",
          "asset": "portrait.alice.normal"
        },
        {
          "id": "smile",
          "asset": "portrait.alice.smile"
        }
      ],
      "defaultPortraitId": "normal"
    }
  ],

  "variables": [
    {
      "key": "flags.met_alice",
      "schema": {
        "type": "boolean"
      },
      "defaultValue": false
    }
  ],

  "scenes": [
    {
      "id": "prologue",
      "title": "序章",
      "mainScript": "scenes/prologue/main.lua",
      "cast": [
        {
          "characterId": "alice",
          "role": "女主角"
        }
      ],
      "exits": ["continue"]
    },
    {
      "id": "ending",
      "title": "结局",
      "mainScript": "scenes/ending/main.lua",
      "cast": [],
      "exits": []
    }
  ],

  "routes": {
    "prologue": {
      "continue": "ending"
    }
  }
}
```

## 顶层字段

### formatVersion

清单格式版本。它决定引擎应该如何解析 `manifest.json`。

- v1 必须为整数 `1`。
- 不兼容的未来版本必须拒绝加载。
- `formatVersion` 不表示游戏内容版本，也不表示存档版本。

### packageId

游戏包的稳定 ID，用于存档隔离、日志和运行时识别。

建议使用与变量键相同的 ID 规则：

```text
^[a-z][a-z0-9_.-]*$
```

包 ID 一旦发布，不应因为目录名或显示标题变化而改变。

### packageVersion

游戏内容版本，建议使用 SemVer 字符串，例如 `1.0.0`。

它用于展示、发布和诊断，不直接决定存档是否兼容。存档兼容性由
`saveSchemaVersion` 管理。

### saveSchemaVersion

存档和可恢复运行时状态的版本号。

它覆盖变量定义以及未来纳入存档的角色运行时状态、背包、任务等数据结构。
不兼容时，v1 直接拒绝读档，不进行隐式迁移。

### entryScene

新游戏使用的入口 Scene ID。

- 必须引用 `scenes` 中已声明的 Scene。
- 不根据目录名或脚本路径推断。
- 目录重组时可以只修改 `mainScript`，不必改变稳定 Scene ID。

### engine

引擎兼容性要求。v1 只定义可选的 `minVersion` 字段。

如果当前引擎版本低于该值，加载器必须在运行脚本前拒绝包。

### metadata

面向启动页、包管理器和编辑器的非运行逻辑元数据。

建议字段：

- `title`：游戏显示标题。
- `author`：作者或制作组。
- `language`：默认语言，例如 `zh-CN`。
- `cover`：资源 ID，而不是宿主路径。

metadata 不参与剧情逻辑。缺失的 metadata 字段不应影响场景执行。

### assets

包内资源目录，详见[资源定义](#资源定义)。

### characters

全局角色定义，详见[角色定义](#角色定义)。

### variables

游戏级预声明变量，直接复用 `VariableDefinition` 和递归 schema。

### scenes

场景定义数组，详见[Scene 定义](#scene-定义)。

### routes

场景出口路由表，详见[路由定义](#路由定义)。

## Scene 定义

一个 Scene 描述一个可独立执行的剧情节点：

```text
Scene ID + 一个 main.lua + 局部角色表 + 命名出口
```

示例：

```json
{
  "id": "prologue",
  "title": "序章",
  "mainScript": "scenes/prologue/main.lua",
  "cast": [
    {
      "characterId": "alice",
      "role": "女主角",
      "displayName": "爱丽丝"
    }
  ],
  "exits": ["continue", "retry"]
}
```

### Scene 字段

#### id

Scene 的稳定 ID。

- 必须匹配 `^[a-z][a-z0-9_.-]*$`。
- 在同一个包内必须唯一。
- 用于路由、存档、日志和编辑器节点引用。
- 不应该直接承担玩家看到的标题职责。

#### title

可选的显示标题，例如 `序章`。

标题变化不应影响路由、存档引用或脚本路径。

#### mainScript

Scene 唯一的 Lua 主入口。

规则如下：

- 必须显式声明，不能由 Scene ID 自动拼接。
- 必须是包内相对逻辑路径。
- 必须位于 `scenes/` 目录下。
- basename 必须严格为 `main.lua`。
- 必须指向实际存在的普通文件。
- 一个入口路径最多只能被一个 Scene 引用。
- 一个 Scene 不能声明第二个入口。

因此：

```text
一个 Scene       -> 一个且仅一个 main.lua
一个游戏包       -> 多个 Scene，因此可以有多个 main.lua
```

例如：

```text
scenes/prologue/main.lua  -> Scene "prologue"
scenes/chapter-one/main.lua -> Scene "chapter-one"
```

其他 Lua 文件可以作为包内容保留，但 v1 不把它们识别为 Scene 入口。
当前 Lua 沙箱不提供游戏包自己的 `require` 模块解析，因此 v1 不承诺
`helpers.lua` 可以被场景脚本加载；后续可以增加受控模块解析器。

#### cast

本 Scene 允许引用的角色局部绑定列表。

```json
{
  "characterId": "alice",
  "role": "club-president",
  "displayName": "Alice"
}
```

字段含义：

- `characterId`：指向全局 `characters` 的稳定 ID。
- `role`：角色在本场景中的叙事身份。
- `displayName`：本场景的显示名覆盖，不修改全局角色实体的状态。

`cast` 是舞台 API 的角色白名单，不是当前已登场角色列表。
角色是否显示、位于哪一侧、是否聚焦由运行时表现状态决定。

同一个角色在一个 Scene 的 cast 中不能重复。未提供 `cast` 时按空数组处理。

#### exits

本 Scene 可以返回的本地出口名列表。

```json
{
  "exits": ["accept", "decline"]
}
```

出口名不是目标 Scene ID，也不是 Lua 文件路径。Lua 只返回出口名：

```lua
return function(ctx)
  return ctx.flow:exit("accept")
end
```

未声明的出口必须在 Lua 边界被拒绝。空出口数组表示该 Scene 不能返回命名出口，
只能调用：

```lua
return ctx.flow:end_story()
```

## 角色定义

角色定义属于包级数据，运行时由会话创建自己的 `Character` 实体。

```json
{
  "id": "alice",
  "name": "爱丽丝",
  "aliases": ["Alice"],
  "tags": ["heroine"],
  "portraits": [
    {
      "id": "normal",
      "asset": "portrait.alice.normal"
    },
    {
      "id": "smile",
      "asset": "portrait.alice.smile"
    }
  ],
  "defaultPortraitId": "normal"
}
```

### 角色字段

- `id`：全局唯一的角色 ID。
- `name`：角色默认名称。
- `aliases`：别名列表，用于查找、工具和本地化辅助。
- `tags`：编辑器筛选和后续扩展使用的标签。
- `portraits`：角色可选择的立绘目录。
- `defaultPortraitId`：新会话或角色重置时选择的立绘。

`portraits[].id` 只要求在当前角色内唯一。`portraits[].asset` 必须引用
`assets[].id`，不能直接写宿主文件路径。

### Character 的运行时状态

包中的角色定义是初始配置；运行时的 `Character` 是可变实体。

角色可以管理：

- 当前显示名。
- 当前选择的立绘。
- 可用立绘目录的查询。
- 角色自身状态的快照、恢复和重置。

角色不负责：

- 读取或解码图片。
- 持有具体渲染器对象。
- 管理角色在舞台上的左/右位置。
- 管理角色是否登场或当前焦点。

推荐的职责关系：

```text
Character
  当前显示名、当前立绘、可用立绘目录

Stage
  当前是否登场、位置、焦点

AssetResolver / ResourceProvider
  根据 asset ID 读取和缓存实际资源

Renderer
  将资源和舞台状态绘制到 TUI 或 GUI
```

角色实例属于游戏会话。不同游戏会话不能共享同一个可变 `Character` 实例。

## 资源定义

资源通过稳定 ID 声明：

```json
{
  "id": "portrait.alice.smile",
  "kind": "image",
  "path": "assets/characters/alice/smile.png"
}
```

### v1 字段

- `id`：包内唯一资源 ID。
- `kind`：资源类型，v1 支持 `image`、`audio`、`video`、`font`、`data`。
- `path`：包内相对逻辑路径。
- `integrity`：可选的内容完整性信息。

资源 ID 建议匹配：

```text
^[a-z][a-z0-9_.-]*$
```

`path` 必须满足：

- 不能是绝对路径。
- 不能包含盘符。
- 不能包含 NUL 字符。
- 不能通过 `..` 越出包根。
- v1 必须位于 `assets/` 目录下。
- 必须指向实际存在的普通文件。

可选的完整性字段示例：

```json
{
  "integrity": {
    "algorithm": "sha256",
    "digest": "0123...64 lowercase hexadecimal characters...cdef"
  }
}
```

当提供 `integrity` 时，`PackageLoader` 会在加载阶段计算 SHA-256 并严格比对。
资源层负责读取、解码、缓存和平台相关的资源对象；`Character` 只保存资源引用和
当前选择。

## 变量定义

变量直接复用引擎的预声明变量系统：

```json
{
  "key": "affection.alice",
  "schema": {
    "type": "number",
    "integer": true,
    "min": 0,
    "max": 100
  },
  "defaultValue": 0
}
```

约束：

- 每个变量键必须唯一。
- 变量键必须匹配 `^[a-z][a-z0-9_.-]*$`。
- `defaultValue` 必须符合声明的 schema。
- 对象 schema 是封闭的，不允许未声明字段。
- JSON 中的正则表达式必须使用字符串，不存在 JavaScript `RegExp` 对象。
- v1 不允许脚本动态声明变量。

变量属于 `GameState`，在不同 Scene 执行之间共享。

## 路由定义

路由将当前 Scene 的本地出口映射到目标 Scene：

```json
{
  "routes": {
    "prologue": {
      "continue": "chapter-one"
    },
    "chapter-one": {
      "finish": "ending"
    }
  }
}
```

语义为：

```text
routes[currentSceneId][exitPort] = targetSceneId
```

加载阶段必须校验：

- 路由源 Scene 存在。
- 路由目标 Scene 存在。
- 路由出口名已经在源 Scene 的 `exits` 中声明。
- 每个 Scene 的已声明出口都有恰好一个路由。
- 同一个 `(sourceScene, port)` 不能有多个目标。

允许路由形成循环。循环不是包加载错误，但编辑器可以将没有结局的循环作为
图诊断提示。

没有命名出口的 Scene 不需要路由；它只能调用 `end_story()`。

## Lua 场景入口

每个 `main.lua` 必须返回一个接收 `ctx` 的函数：

```lua
return function(ctx)
  ctx.stage:show("alice", {
    side = "left"
  })

  ctx.dialogue:say("alice", "欢迎回来。")

  return ctx.flow:exit("continue")
end
```

结局场景可以写成：

```lua
return function(ctx)
  ctx.dialogue:narrate("故事结束。")
  return ctx.flow:end_story()
end
```

Scene 脚本不能通过文件路径跳转到另一个 Scene：

```lua
-- 不支持：
-- dofile("../chapter-one/main.lua")
-- require("chapter-one")
```

场景跳转由包级路由和故事调度器负责，而不是由 Lua 文件互相嵌套调用。

## 表现协议

Lua 和表现层之间使用稳定的协议边界：

```text
Lua API
  -> LuaRequest / LuaPresentationCommand
  -> TUI、GUI 或编辑器预览宿主
```

对话、选项和等待产生需要宿主回复的请求；舞台变化产生非阻塞表现命令。

角色相关的表现命令只传稳定 ID 和表现参数，不把 `Character` 实例直接暴露给 Lua：

```lua
ctx.stage:show("alice", {
  side = "left",
  portraitId = "smile"
})
```

`portraitId` 必须经过当前角色的立绘目录校验。资源实际如何呈现由宿主和渲染器决定。

场景局部 `cast.displayName`、角色当前 `displayName` 和命令中的显式显示名需要有
明确的优先级。建议优先级为：

```text
命令显式 displayName
  > 场景 cast.displayName
  > Character.displayName
  > Character.id
```

该解析应由运行时集中完成，不能让 TUI、GUI 和编辑器预览各自实现不同规则。

## 包加载流程

`PackageLoader` 把不可信的清单和包内容转换为经过验证的运行时包：

```text
ReadonlyFileSystem
  -> 读取 manifest.json
  -> 解析 JSON
  -> 校验 formatVersion、packageVersion 和引擎兼容性
  -> 校验顶层字段和 ID 唯一性
  -> 建立 AssetRegistry
  -> 建立 CharacterRegistry
  -> 校验变量定义
  -> 创建不可变 Scene
  -> 建立 SceneRegistry
  -> 校验资源文件、资源 digest、角色引用和路由引用
  -> 检查所有 main.lua 存在、可读取且为合法 UTF-8
  -> 编译所有 main.lua，但不执行场景代码
  -> 生成 LoadedRuntimePackage
```

加载失败会抛出 `PackageLoadError`，包含稳定 `code` 和清单字段路径，例如：

```text
characters[0].portraits[1].asset
scenes[2].mainScript
routes.prologue.continue
assets[1].path
```

加载器应在返回运行时包之前完成所有可以确定的校验，不把清单错误推迟到玩家
执行到某条剧情时才暴露。

## LoadedRuntimePackage 与 GameSession

包定义和运行时会话分开：

```text
LoadedRuntimePackage
├─ immutable manifest data
├─ AssetRegistry
├─ SceneRegistry
├─ RouteTable
├─ readSceneScript(sceneId)
└─ createCharacterRegistry()
```

`LoadedRuntimePackage` 可以被多个会话共享，因为它只保存不可变定义和只读资源来源。
`createCharacterRegistry()` 必须为每局游戏创建新的可变角色实例集合。

后续 `GameSession` 会组合：

```text
GameState
CharacterRegistry
StoryRunner
表现层会话状态
```

角色的当前显示名、当前立绘、舞台位置、可见性和焦点都不能写回共享包定义。

## 存档边界

存档至少需要保存：

```text
packageId
saveSchemaVersion
sceneId
variables
characterStates
```

其中 `characterStates` 只保存角色自身的可恢复状态，例如：

```json
{
  "alice": {
    "displayName": "小爱",
    "portraitId": "smile"
  }
}
```

舞台左/右位置、可见性、焦点是否纳入存档，需要由表现层存档策略决定；如果存档
要求从一个完整画面继续，则应由会话快照协调器统一保存，而不是把舞台字段写进
`CharacterState`。

当前 SQLite 存档实现主要保存变量和场景元数据。正式接入 Runtime Package 后，
需要扩展其数据结构以保存角色状态，并由 `saveSchemaVersion` 管理兼容性。

无效角色 ID、未知立绘 ID、包 ID 不匹配或存档版本不匹配时，恢复必须整体失败，
不能只恢复一部分状态。

## 编辑器工程与 Runtime Package

编辑器工程不必直接使用 Runtime Package 作为工作文件。推荐使用两层格式：

```text
编辑器工程
  -> 编译器 / 导出器
  -> Runtime Package
  -> PackageLoader
  -> Engine Session
```

编辑器工程可以保存：

```text
my-story.gelproj/
├─ project.json
├─ graph/
├─ scene-data/
├─ assets/
└─ editor-state/
```

其中可以包含：

- 节点坐标。
- 画布缩放和视口。
- 节点 UUID。
- 连线的编辑器元数据。
- 注释和草稿。
- 未发布的资源。

这些字段不应进入 Runtime Package，除非它们对运行时确实有意义。

编辑器导出时必须生成：

```text
manifest.json
scenes/<scene-id>/main.lua
assets/*
```

编辑器预览和正式游戏都应该通过同一个 `PackageLoader` 和同一个运行时协议执行，
而不是为预览单独实现一套宽松格式。

## v1 加载不变量

PackageLoader 返回成功前必须保证：

- `manifest.json` 存在且是合法 UTF-8 JSON。
- `formatVersion` 是受支持的版本。
- `packageId`、Scene ID、角色 ID、资源 ID 和变量键满足格式要求。
- 所有包级 ID 唯一。
- `entryScene` 引用已存在的 Scene。
- 每个 Scene 有且仅有一个合法的 `main.lua` 入口。
- 每个 `mainScript` 文件存在、可读取、为合法 UTF-8 且能通过 Lua 语法编译。
- 所有角色 cast 引用已声明角色。
- 所有立绘资源引用已声明的 image 资源。
- 所有资源路径位于包内并指向普通文件。
- 可选资源 SHA-256 digest 与包内内容匹配。
- 所有 Scene 出口没有重复声明，且每个出口都有路由。
- 所有路由源、出口和目标引用有效。
- 变量定义和默认值通过变量 schema 校验。
- 不能因为目录重命名、路径分隔符或宿主系统不同而改变包语义。

## v1 不包含

以下功能不属于 Runtime Package v1 的必要范围：

- 任意文件系统访问。
- 任意 Lua `require` 或模块搜索路径。
- 运行时动态创建 Scene。
- 运行时动态声明变量。
- 立绘图片解码和具体 GUI 渲染实现。
- 多语言资源自动回退。
- BGM、音效和语音的播放策略。
- 复杂立绘动画或骨骼系统。
- 云存档和跨设备同步。
- 旧包和旧存档的自动迁移。

## 当前实现状态

已经完成：

1. `RuntimePackage` v1 字段与 `formatVersion`、`packageVersion`、`saveSchemaVersion`。
2. `AssetRegistry`、`CharacterRegistry`、`SceneRegistry` 和 `RouteTable`。
3. `PackageLoader`、跨对象引用校验、资源文件检查、SHA-256 校验和 Lua 语法预编译。
4. `LoadedRuntimePackage` 的清单副本、脚本读取和独立角色注册表创建。

尚未完成：

1. `SceneExecutor`，读取并运行当前 Scene 唯一的 `main.lua`。
2. `StoryRunner`，循环执行 Scene、解析出口并更新 `GameState.sceneId`。
3. `GameSession`，协调 `GameState`、`CharacterRegistry` 与表现层。
4. `portraitId` 表现协议和角色解析接入 Lua/TUI/GUI。
5. 角色状态和表现状态的存档恢复。
6. `.gelpkg` 压缩包 provider 和发布流程。

完成这些内容后，编辑器只需要负责生成符合本文件约束的包，不需要再猜测引擎的
内部对象结构。
