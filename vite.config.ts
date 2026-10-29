import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Content Security Policy for the static site. GitHub Pages can't send
 * headers, so it's a <meta> tag. The only place the page can send anything is
 * the visit counter (GoatCounter's count.js, served from our own origin):
 * `connect-src` for its sendBeacon, `img-src` for its pixel fallback. Samples
 * are bundled and files are read locally.
 * frame-ancestors can't be set from a meta tag (see docs/DESIGN.md).
 */
export const STATS_ORIGIN = "https://stats.startlistmaker.online";

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: blob: ${STATS_ORIGIN}`,
  "font-src 'self'",
  `connect-src ${STATS_ORIGIN}`,
  "worker-src 'none'",
  "manifest-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

function csp(): Plugin {
  let isBuild = false;
  return {
    name: "csp-meta",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    transformIndexHtml(html) {
      if (html.split("%CSP%").length !== 2) throw new Error("index.html must contain exactly one %CSP% placeholder");
      const tag = isBuild ? `<meta http-equiv="Content-Security-Policy" content="${CSP}" />` : "";
      return html.replace("%CSP%", tag);
    },
  };
}

/** "2026-10-28 · 19b94ea": the build date and commit, shown in Help and filled into bug reports. */
function version() {
  const date = new Date().toISOString().slice(0, 10);
  try {
    return `${date} · ${execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()}`;
  } catch {
    return date;
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version()) },
  // Relative asset URLs, so one build works at a sub-path (ctophw.xyz/startlistmaker/,
  // the GitHub Pages project URL) and at a domain root (startlistmaker.online later).
  base: "./",
  plugins: [tailwindcss(), react(), csp()],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    // No inline scripts, styles or data: assets beyond what the CSP allows.
    assetsInlineLimit: 0,
    // The polyfill fetches module scripts; modern browsers don't need it.
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
});
