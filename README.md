# Start List Maker

Build freediving competition start lists (OT / WT / check-in, lanes and zones, breaks) from Google Form responses. It runs entirely in the browser, so athlete data never leaves the device.

**https://startlistmaker.online** · try the demo: https://startlistmaker.online/#demo

## Using it

1. In Google Forms, open **Responses → ⋮ → Download responses (.csv)**, or select the cells in the linked sheet and copy them.
2. Drop the file (or paste) on the site, check the column matching, and fix anything flagged in the athletes table.
3. Set the first OT, interval or dive time + buffer, lanes / zones, breaks, and order, then adjust by dragging or sorting.
4. Print it, save it as PDF, or download PDF / CSV / Excel. **Save project** keeps everything in a file you can reopen later.

The form needs one row per athlete with a name, and per start a discipline and an announced performance (AP). Dive time, PB, gender and country are optional. See `src/samples/` for example files.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck && npm test
npm run test:e2e   # builds, serves dist/ and runs Playwright (npx playwright install chromium once)
```

See `CLAUDE.md` and `docs/` for architecture, decisions and design.

### Making a sample from a real export

```sh
node scripts/anonymize.mjs path/to/real-responses.csv src/samples/new-sample.csv 11 --fix-typos
```

Keep real exports outside the repo. The script exits with an error if any source name or email would end up in the output.

## Deploying to GitHub Pages

1. Push to a GitHub repository with `main` as the default branch.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.** The `CI and deploy` workflow builds, tests, and deploys every push to `main`.
3. **Settings → Pages → Custom domain:** `startlistmaker.online` (also in `public/CNAME`). Tick **Enforce HTTPS** once the certificate is issued.
4. **Verify the domain** under your GitHub account **Settings → Pages → Add a domain**, with the TXT record GitHub shows. This stops anyone else's repo from serving your domain.
5. DNS at the registrar:

   | Type | Host | Value |
   |---|---|---|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | AAAA | @ | 2606:50c0:8000::153 |
   | AAAA | @ | 2606:50c0:8001::153 |
   | AAAA | @ | 2606:50c0:8002::153 |
   | AAAA | @ | 2606:50c0:8003::153 |
   | CNAME | www | `<your-github-username>.github.io` |
   | TXT | `_github-pages-challenge-<username>` | (value from step 4) |

   Remove any parking or forwarding records the registrar added. Turn on DNSSEC if the registrar supports it.
