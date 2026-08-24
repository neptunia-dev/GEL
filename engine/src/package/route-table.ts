/** 编辑器图编译后的场景出口路由表。 */
export interface RouteTable {
  resolve(sceneId: string, port: string): string | undefined;
}
