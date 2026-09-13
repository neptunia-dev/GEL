import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ReadonlyFileSystem } from "../contracts/file-system";
import { VirtualPath, type VirtualPathLike } from "../contracts/virtual-path";
import { FileSystemError } from "../errors/file-system-error";
import { decodeUtf8 } from "../utf8-decoder";

/** Maps a host directory to the package logical filesystem. */
export class DirectoryFileSystem implements ReadonlyFileSystem {
  private readonly rootDirectory: string;

  public constructor(root: string | URL) {
    let requestedRoot = typeof root === "string" ? resolve(root) : "<invalid URL>";
    try {
      if (typeof root !== "string") requestedRoot = resolve(fileURLToPath(root));
      if (!statSync(requestedRoot).isDirectory()) throw new Error("path is not a directory");
      this.rootDirectory = realpathSync(requestedRoot);
    } catch (error) {
      throw new FileSystemError("INVALID_ROOT", `Package root is not a readable directory: '${requestedRoot}'`, requestedRoot, { cause: error });
    }
  }

  public get root(): string { return this.rootDirectory; }

  public hasFile(path: VirtualPathLike): boolean {
    const target = this.resolvePath(path);
    if (target.virtual.isRoot) return false;
    try {
      return statSync(this.resolveExisting(target)).isFile();
    } catch (error) {
      if (isMissing(error)) return false;
      throw this.providerError("Cannot inspect file", target.virtual, error);
    }
  }

  public readFile(path: VirtualPathLike): Uint8Array {
    const target = this.resolvePath(path);
    if (target.virtual.isRoot) throw new FileSystemError("NOT_A_FILE", "The package root is not a file", target.virtual.value);
    let physical: string;
    let stats: ReturnType<typeof statSync>;
    try {
      physical = this.resolveExisting(target);
      stats = statSync(physical);
    } catch (error) {
      if (isMissing(error)) throw new FileSystemError("FILE_NOT_FOUND", `File not found: '${target.virtual.value}'`, target.virtual.value);
      throw this.providerError("Cannot inspect file", target.virtual, error);
    }
    if (!stats.isFile()) throw new FileSystemError("NOT_A_FILE", `Path is not a file: '${target.virtual.value}'`, target.virtual.value);
    try {
      return new Uint8Array(readFileSync(physical));
    } catch (error) {
      if (isMissing(error)) throw new FileSystemError("FILE_NOT_FOUND", `File not found: '${target.virtual.value}'`, target.virtual.value);
      throw this.providerError("Cannot read file", target.virtual, error);
    }
  }

  public readText(path: VirtualPathLike): string {
    const virtualPath = VirtualPath.from(path);
    return decodeUtf8(this.readFile(virtualPath), virtualPath.value);
  }

  public listFiles(prefix?: VirtualPathLike): readonly VirtualPath[] {
    const prefixPath = prefix === undefined ? VirtualPath.root() : VirtualPath.from(prefix);
    const target = this.resolvePath(prefixPath);
    let physical: string;
    let stats: ReturnType<typeof statSync>;
    try {
      physical = this.resolveExisting(target);
      stats = statSync(physical);
    } catch (error) {
      if (isMissing(error)) return [];
      throw this.providerError("Cannot inspect path", prefixPath, error);
    }
    if (stats.isFile()) return [prefixPath];
    if (!stats.isDirectory()) return [];
    const result: VirtualPath[] = [];
    this.collectFiles(physical, prefixPath, result, new Set<string>());
    result.sort((left, right) => left.value < right.value ? -1 : left.value > right.value ? 1 : 0);
    return result;
  }

  private collectFiles(directory: string, prefix: VirtualPath, result: VirtualPath[], visitedDirectories: Set<string>): void {
    const realDirectory = realpathSync(directory);
    this.assertContained(realDirectory, prefix);
    if (visitedDirectories.has(realDirectory)) {
      throw new FileSystemError("INVALID_PATH", `Directory link cycle detected: '${prefix.value}'`, prefix.value);
    }
    visitedDirectories.add(realDirectory);
    let entries: import("node:fs").Dirent<string>[];
    try {
      entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    } catch (error) {
      throw this.providerError("Cannot list directory", prefix, error);
    }
    for (const entry of entries) {
      const child = prefix.join(entry.name);
      const target = this.resolvePath(child);
      let physical: string;
      try {
        physical = this.resolveExisting(target);
      } catch (error) {
        if (isMissing(error)) continue;
        throw this.providerError("Cannot inspect path", child, error);
      }
      // Resolve symlinks before deciding whether to recurse or expose a file.
      // This both permits safe links inside the package and rejects links that
      // resolve outside it instead of silently following an escape.
      const stats = statSync(physical);
      if (stats.isDirectory()) this.collectFiles(physical, child, result, visitedDirectories);
      else if (stats.isFile()) result.push(child);
    }
  }

  private resolvePath(path: VirtualPathLike): { virtual: VirtualPath; physical: string } {
    const virtual = VirtualPath.from(path);
    const physical = resolve(this.rootDirectory, ...splitSegments(virtual));
    this.assertContained(physical, virtual);
    return { virtual, physical };
  }

  /** Resolve an existing target and enforce containment after symlink resolution. */
  private resolveExisting(target: { virtual: VirtualPath; physical: string }): string {
    const physical = realpathSync(target.physical);
    this.assertContained(physical, target.virtual);
    return physical;
  }

  private assertContained(physical: string, virtual: VirtualPath): void {
    const relativePath = relative(this.rootDirectory, physical);
    if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new FileSystemError("INVALID_PATH", `Path escapes package root: '${virtual.value}'`, virtual.value);
    }
  }

  private providerError(operation: string, path: VirtualPath, cause: unknown): FileSystemError {
    if (cause instanceof FileSystemError) return cause;
    return new FileSystemError("INVALID_ROOT", `${operation}: '${path.value}'`, path.value, { cause });
  }
}

function splitSegments(path: VirtualPath): string[] { return path.isRoot ? [] : path.value.split("/"); }
function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    ((error as { code?: unknown }).code === "ENOENT" || (error as { code?: unknown }).code === "ENOTDIR");
}
