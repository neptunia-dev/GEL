/** 运行时包加载接口；具体文件格式稍后确定。 */
export interface PackageLoader {
  load(): Promise<import("./runtime-package").RuntimePackage>;
}
