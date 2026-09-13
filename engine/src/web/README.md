# GEL Web Player

网页端由两层组成：

- `WebPlayer`：LuaRuntime 输入调度、TuiSession 状态和 HTML 对话 UI。
- `WebGLStage`：背景与角色立绘的 WebGL2 渲染。

```ts
import { WebPlayer, GameState } from "@gel/engine";
import "@gel/engine/dist/src/web/web-player.css";

const player = new WebPlayer({
  root: document.querySelector("#game")!,
  source: luaSource,
  state: gameState,
  characterIds: ["hero", "mika"],
  assets: { background: "/bg/classroom.webp", hero: "/ch/hero.png", mika: "/ch/mika.png" },
});
await player.start();
```

`WebGLStage` 的纹理由 `assets` 按角色 ID 查找；未提供纹理时仍会显示对话 UI，不会阻断 Lua 运行。
