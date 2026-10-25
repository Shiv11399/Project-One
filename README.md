# The Ballot Grid

An India election calendar with official notices from the Election Commission of India (ECI), hosted as a static site on GitHub Pages.

## GitHub Pages setup

1. Push the repository to GitHub.
2. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Confirm the repository's default branch is `main`. The included workflow runs on pushes to `main`, once an hour, and on manual dispatch.
4. Keep `theballotgrid.in` in the repository's `CNAME` file and verify the custom domain is set in **Settings → Pages**.
5. In **Settings → Actions → General → Workflow permissions**, allow workflows to deploy GitHub Pages if GitHub asks for that permission.

The workflow fetches ECI's latest announcements, commits changes to `data/elections.json`, and deploys the static page and feed together. If ECI is unavailable or rejects a request, the workflow still deploys the last saved feed and the page identifies it as older data. Use **Actions → Refresh ECI feed and deploy GitHub Pages → Run workflow** to request an immediate update. Scheduled GitHub Actions may start later than their scheduled time, so updates are not guaranteed to be exactly hourly.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm run update-feed` to download the current ECI announcements into `data/elections.json`.
3. Run `npm run prepare-pages` to prepare a static site in `_site` using the saved feed.
4. Run `npm start` and open <http://127.0.0.1:8000>.

The **Reload published feed** button reloads the most recently published feed. It does not start a GitHub Actions run; use the workflow's manual dispatch for an immediate feed refresh and deployment.

## Election card photography

The election cards use locally stored Wikimedia Commons thumbnails. Artist credits, source pages, and the applicable Creative Commons licenses are listed in the page's **Photo credits and reuse licenses** section.

## Data notes

The feed contains up to 100 of ECI's latest public press-release entries related to elections, with publication dates and links to official notices. Expected election windows and assembly seat counts are curated reference data. Polling dates are not inferred from notice titles; open an official notice for its full details.

Candidate and party manifesto information is kept separately in `data/candidates.json`; the ECI announcement feed does not provide a reliable candidate/manifesto list. Use ECI records for candidate and constituency details where available; if an official fallback is needed, label it clearly in the source link. Manifesto summaries should be concise, paraphrased, and linked to the party's official publication. Until verified records are entered, the relevant election detail says that candidate and manifesto information is not yet available. The Pages preparation script publishes this file with the site.

Each state entry contains `candidates` and `manifestos` arrays. Candidate records use `name`, `party`, `constituency`, optional `status`, and `sources` (an array of `{ "label", "url" }`). Manifesto records use `party`, optional `title`, `promises` (a short array of summary points), and `source` (`{ "label", "url" }`). All source links must use HTTPS and should identify whether they point to ECI or an official party source.
