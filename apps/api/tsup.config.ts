import { defineConfig } from "tsup";

const shared = {
  splitting: false as const,
  bundle: true,
  env: { IS_SERVER_BUILD: "true" },
  loader: { ".json": "copy" as const },
  minify: true,
  sourcemap: false,
  target: "es2022" as const,
};

export default defineConfig([
  {
    ...shared,
    entry: ["./src/index.ts"],
    format: "cjs",
    outDir: "./dist",
    clean: true,
    noExternal: [/^@repo\//],
    external: [/^@scalar\//],
  },
  {
    ...shared,
    entry: ["./src/vercel.ts"],
    format: "esm",
    outDir: "./dist",
    outExtension({ format }) {
      return { js: format === "esm" ? ".mjs" : ".js" };
    },
    clean: false,
    platform: "node",
    noExternal: [/^@repo\//, /^@scalar\//],
    external: [],
    banner: {
      js: 'import { createRequire as __createRequire } from "module";import { fileURLToPath as __fileURLToPath } from "url";import { dirname as __pathDirname } from "path";const require=__createRequire(import.meta.url);const __filename=__fileURLToPath(import.meta.url);const __dirname=__pathDirname(__filename);',
    },
  },
]);
