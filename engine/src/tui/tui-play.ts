import { TuiLuaApp } from "./tui-lua-app";

async function main(): Promise<void> {
  const luaPath = process.argv[2];
  if (luaPath === undefined) {
    console.error("用法：npm run tui:play -- <lua 文件路径>");
    process.exitCode = 1;
    return;
  }

  try {
    await new TuiLuaApp(luaPath).start();
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
