import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Content Security Policy for the static site. GitHub Pages can't send
 * headers, so it's a <meta> tag. `connect-src 'none'` means the page can't
 * send data anywhere: samples are bundled, files are read locally.
 * frame-ancestors can't be set from a meta tag (see docs/DESIGN.md).
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
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

export default defineConfig({
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
