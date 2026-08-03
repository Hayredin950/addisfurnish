import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Native TanStack Start + Nitro setup.
//
// The Nitro plugin (added only for the `build` command, like the original
// Lovable preset did) is what packages the SSR server into a deployable
// output. Pick the deploy target at build time with NITRO_PRESET:
//   NITRO_PRESET=vercel npm run build            -> .vercel/output (Vercel)
//   NITRO_PRESET=cloudflare-module npm run build -> .output (Cloudflare Pages)
//   npm run build                                -> .output (Node server)
export default defineConfig(async ({ command }) => {
  const plugins: NonNullable<import("vite").UserConfig["plugins"]> = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Keep server-only modules out of the client bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts
      // (our SSR error wrapper). Nitro builds from this.
      server: { entry: "server" },
    }),
  ];

  if (command === "build") {
    plugins.push(
      nitro({
        defaultPreset: "vercel",
      }),
    );
  }

  plugins.push(viteReact());

  return {
    plugins,
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
