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

## Data files and structures

The site keeps election announcements, candidate information, and current Assembly information in separate JSON files under `data/`. `scripts/prepare-pages.js` validates the saved data and copies all three files into the static Pages output. The local server exposes them at `/data/elections.json`, `/data/candidates.json`, and `/data/incumbents.json`.

### ECI announcements: `data/elections.json`

This feed is fetched from the Election Commission of India's public announcements and can contain up to 100 election-related notices. It is automatically refreshed by the GitHub Actions workflow and by `npm run update-feed`.

```json
{
  "lastChecked": "2026-10-25T11:44:36.447Z",
  "announcements": [
    {
      "title": "Election notice title",
      "description": "Notice description",
      "publishedAt": "Thursday 22 Oct 2026, 10:22 AM",
      "url": "https://www.eci.gov.in/eci/public/api/download?url=..."
    }
  ],
  "stale": false
}
```

`lastChecked` is an ISO timestamp; each announcement has a title, description, publication date, and official notice URL. When a refresh fails, the published feed retains the last saved announcements and can include `stale: true`, a `warning`, and `lastAttempted` timestamp. These fields explain feed freshness; they do not indicate a failure to deploy. Notices are not used to infer polling dates.

### Upcoming election cards: `index.html`

The upcoming states and their expected election windows are curated in the page's `elections` array rather than loaded from the ECI feed. Each entry uses:

```js
{
  state: "Goa",
  window: "Early 2027 · expected",
  seats: "40 seats",
  timing: "Early 2027",
  image: "./assets/goa-mandrem-beach.jpg",
  imageAlt: "Aerial view of Mandrem beach and river in Goa",
  place: "Goa · West coast"
}
```

These windows are estimates, not official polling dates. Update them only with reliable information and keep the expected/official distinction clear.

### Candidates and manifestos: `data/candidates.json`

This is manually curated reference data; the ECI announcement feed does not automatically populate candidate names or party manifestos. The top-level `states` keys must match the state names used by the election cards. Candidate source links should be HTTPS and identify whether the record comes from ECI or a clearly labeled official fallback. Manifesto promises are short paraphrases linked to the party publication.

```json
{
  "schemaVersion": 1,
  "states": {
    "Goa": {
      "candidates": [
        {
          "name": "Candidate name",
          "party": "Party name",
          "constituency": "Constituency name",
          "status": "Declared",
          "sources": [
            {
              "label": "Official ECI candidate record",
              "url": "https://example.gov.in/candidate"
            }
          ]
        }
      ],
      "manifestos": [
        {
          "party": "Party name",
          "title": "Manifesto title",
          "promises": ["Short, paraphrased policy summary"],
          "source": {
            "label": "Official party manifesto",
            "url": "https://example.org/manifesto"
          }
        }
      ]
    }
  }
}
```

`status`, manifesto `title`, and candidate `sources` are optional presentation fields; manifesto `promises` should be a short array. Keep the `candidates` and `manifestos` arrays even when there is no verified data yet. Empty arrays are displayed as unavailable rather than being treated as proof that no announcements exist.

### Current Assembly and incumbents: `data/incumbents.json`

This is a dated, manually maintained snapshot, not a live feed. Each state has an `asOf` date, government and Chief Minister details, party seat totals, source links, and a constituency-by-constituency `members` list. The snapshot currently covers Goa, Manipur, Punjab, Uttarakhand, Uttar Pradesh, and Gujarat.

```json
{
  "schemaVersion": 1,
  "states": {
    "Example state": {
      "asOf": "2026-10-25",
      "government": "Example coalition government",
      "chiefMinister": "Chief Minister name",
      "seatCounts": [
        { "party": "Example party", "seats": 1 },
        { "party": "Vacant", "seats": 1 }
      ],
      "sources": [
        {
          "label": "Official Assembly member directory",
          "url": "https://example.gov.in/members"
        }
      ],
      "members": [
        {
          "name": "MLA name",
          "constituency": "Constituency name",
          "party": "Example party"
        },
        {
          "name": "Vacant",
          "constituency": "Second constituency",
          "party": "Vacant",
          "status": "Seat vacant"
        }
      ],
      "notes": "Explain material source limitations or discrepancies."
    }
  }
}
```

Each member's `status` and a state's `notes` are optional. Record a vacancy as a member entry with `name` and `party` set to `Vacant`, so it is included in the total Assembly strength. The sum of `seatCounts[].seats` must equal the number of entries in `members`; each constituency must appear only once. Source links must use HTTPS and labels should make secondary sources explicit. The preparation script checks required fields, duplicate constituencies, tally totals, and source links before deployment.

Known vacancies and source conflicts are documented in the relevant state data. Some rosters rely on secondary sources where a current official roster could not be verified. Check the source links and update `asOf` and the affected data when membership changes. Do not treat current MLAs as candidates for the next election.

## Data maintenance

Expected election windows, candidate/manifesto entries, and current Assembly snapshots are curated separately from the automated ECI feed. Only `data/elections.json` is refreshed by the ECI workflow. It still deploys the last saved announcement feed if a refresh fails, with stale-data metadata shown on the page. Verify official notices and roster sources before updating curated records.
