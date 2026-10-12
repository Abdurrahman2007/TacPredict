// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [{
      name: "tacpredict-wallet-browser-builtins",
      enforce: "pre" as const,
      // Nitro normalizes builtin aliases to node:*, so resolve the browser modules
      // before Vite turns them into empty external stubs. SSR keeps native builtins.
      resolveId(id: string, _importer: string | undefined, options: { ssr?: boolean | undefined }) {
        if (options?.ssr) return null;
        if (id === "buffer" || id === "node:buffer")
          return path.resolve(rootDir, "node_modules/buffer/index.js");
        if (id === "events" || id === "node:events")
          return path.resolve(rootDir, "node_modules/events/events.js");
        return null;
      },
    }],
    resolve: {
      alias: {
        // WalletConnect → Cloudflare/workerd has no node/browser match for "." export.
        "rpc-websockets": path.resolve(
          rootDir,
          "node_modules/rpc-websockets/dist/index.browser.mjs",
        ),
      },
    },
    ssr: {
      resolve: {
        conditions: ["browser", "import", "module", "default"],
      },
    },
  },
});
