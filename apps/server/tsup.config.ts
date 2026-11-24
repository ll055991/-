import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node20",
  // shared 包以 TS 源码形式提供，必须打进产物，否则运行时 Node 无法直接加载 .ts
  noExternal: ["@wall/shared"],
});
