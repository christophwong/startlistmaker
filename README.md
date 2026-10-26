# Start List Maker

Build freediving competition start lists (OT / WT / check-in, lanes and zones, breaks) from Google Form responses. It runs entirely in the browser, so athlete data never leaves the device.

**https://ctophw.xyz/startlistmaker/** · try the demo: https://ctophw.xyz/startlistmaker/#demo (the custom domain `startlistmaker.online` comes later)

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

The repo is public, and Pages (source: GitHub Actions) deploys every push to `main` through the `CI and deploy` workflow. A private repo would only run the checks, because Pages on the free plan needs a public repo.

The build uses relative asset URLs (`base: "./"`), so the same build works at the project URL `https://ctophw.xyz/startlistmaker/` (the account's user site has the `ctophw.xyz` domain, so `christophwong.github.io/startlistmaker/` redirects there) and at a domain root.

To move to the custom domain later:

1. Do steps 2 and 3 below (domain verification and DNS) first.
2. **Settings → Pages → Custom domain:** `startlistmaker.online` (also in `public/CNAME`, which Actions deploys ignore). Tick **Enforce HTTPS** once the certificate is issued.
3. **Verify the domain** under your GitHub account **Settings → Pages → Add a domain**, with the TXT record GitHub shows. This stops anyone else's repo from serving your domain.
4. DNS at the registrar (today it's Namecheap's parking page):

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
