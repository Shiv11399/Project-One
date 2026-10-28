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

This is manually curated reference data; the ECI announcement feed does not automatically populate candidate names or party manifestos. Candidate data uses schema version 3 and separates a stable person identity from each election-specific candidacy. The same candidate can have multiple candidacies over time, including different parties or constituencies. Candidate source links should be HTTPS and identify whether they point to ECI or a clearly labeled secondary source. Manifesto promises are short paraphrases linked to the party publication.

```json
{
  "schemaVersion": 3,
  "people": [
    {
      "id": "person-stable-id",
      "name": "Candidate name",
      "aliases": ["Name used in another record"]
    }
  ],
  "states": {
    "Goa": {
      "manifestos": []
    }
  },
  "elections": [
    {
      "id": "goa-2027-assembly",
      "state": "Goa",
      "year": 2027,
      "type": "State Legislative Assembly",
      "candidateScope": "declared_candidates",
      "candidacies": [
        {
          "id": "goa-2027-constituency-person",
          "candidateId": "person-stable-id",
          "constituency": "Constituency name",
          "party": "Party name",
          "status": "declared",
          "verification": {
            "name": {
              "status": "verified",
              "checkedAt": "2026-10-27",
              "reviewer": "Data editor",
              "sources": [
                {
                  "role": "primary",
                  "label": "ECI candidate list",
                  "url": "https://eci.gov.in/"
                }
              ]
            },
            "party": {
              "status": "cross_checked",
              "checkedAt": "2026-10-27",
              "reviewer": "Data editor",
              "sources": [
                {
                  "role": "primary",
                  "label": "ECI candidate list",
                  "url": "https://eci.gov.in/"
                },
                {
                  "role": "secondary",
                  "label": "Independent party candidate list",
                  "url": "https://example.org/candidates"
                }
              ]
            },
            "assets": {
              "status": "needs_review",
              "checkedAt": "2026-10-27",
              "reviewer": "Data editor",
              "note": "The affidavit and secondary summary report different totals.",
              "sources": [
                {
                  "role": "primary",
                  "label": "Candidate affidavit",
                  "url": "https://affidavit.eci.gov.in/"
                },
                {
                  "role": "secondary",
                  "label": "ADR/MyNeta",
                  "url": "https://myneta.info/"
                }
              ]
            }
          },
          "affidavit": {
            "label": "Original ECI affidavit",
            "url": "https://affidavit.eci.gov.in/"
          },
          "profile": {
            "previousPositions": [
              {
                "title": "Member of Legislative Assembly",
                "constituency": "Constituency name",
                "fromYear": 2017,
                "toYear": 2022
              }
            ],
            "education": {
              "value": "Candidate-declared education",
              "source": {
                "label": "Candidate affidavit",
                "url": "https://affidavit.eci.gov.in/",
                "page": 4,
                "retrievedAt": "2026-10-27",
                "reviewer": "Data editor",
                "corrections": []
              }
            },
            "assets": {
              "value": "INR amount as declared in affidavit",
              "source": {
                "label": "Candidate affidavit",
                "url": "https://affidavit.eci.gov.in/"
              }
            },
            "liabilities": {
              "value": "INR amount as declared in affidavit",
              "source": {
                "label": "Candidate affidavit",
                "url": "https://affidavit.eci.gov.in/"
              }
            },
            "criminalCases": {
              "declaredCount": 1,
              "entries": [
                {
                  "description": "Description from the affidavit",
                  "status": "pending",
                  "source": {
                    "label": "Candidate affidavit",
                    "url": "https://affidavit.eci.gov.in/"
                  }
                }
              ]
            }
          },
          "result": {
            "votes": 12345,
            "voteShare": 52.3,
            "margin": 1240,
            "outcome": "won",
            "source": {
              "label": "Official ECI result",
              "url": "https://results.eci.gov.in/"
            }
          },
          "sources": []
        }
      ]
    },
    {
      "id": "goa-2022-assembly-winners",
      "state": "Goa",
      "year": 2022,
      "type": "State Legislative Assembly",
      "candidateScope": "winners_archive",
      "archiveCompleteness": "partial",
      "archiveNote": "This is a 34-of-40-seat import. The source summary reports 38 winners analyzed, so reconcile the row discrepancy and six missing seats against official ECI results.",
      "candidacies": [],
      "sources": [
        {
          "label": "ECI candidate affidavit portal",
          "url": "https://affidavit.eci.gov.in/"
        },
        {
          "label": "ADR/MyNeta Goa 2022 winners archive (secondary source)",
          "url": "https://www.myneta.info/Goa2022/index.php?action=show_winners&sort=default"
        }
      ]
    }
  ]
}
```

`people` holds one stable identity per person (`id`, name, optional aliases). Election records hold election metadata and a `candidateScope`: `declared_candidates` for the upcoming candidate list or `winners_archive` for a historical winners-only archive. Each candidacy references a person with `candidateId` and has its own party, constituency, status, affidavit, disclosures, result, and source links. The 2027 placeholder records cover Goa, Manipur, Punjab, Uttarakhand, Uttar Pradesh, and Gujarat. Each state also has a 2022 winners archive and, where applicable, by-election winners archives (`type` "State Legislative Assembly by-election", one per year); these cover winners only and are not a complete list of everyone who contested. An archive can set `archiveCompleteness` to `partial` and provide an `archiveNote`; the site shows this warning rather than implying all seats or profiles are represented.

Keep disclosures tied to source links. Criminal-case `status` is `pending`, `convicted`, `acquitted`, `disposed`, or `unknown`; a disclosed case must not be described as a conviction unless the source records one. Missing values are omitted and shown as not recorded, never inferred as zero.

Each candidacy may include a `verification` map keyed by field (`name`, `party`, `constituency`, `affidavit`, `previousPositions`, `education`, `assets`, `liabilities`, `criminalCases`, or `electionResults`). A verification record contains a `status`, checked date and reviewer where applicable, optional explanatory `note`, and evidence `sources`. Each verification source uses `{ "role": "primary", "label": "...", "url": "..." }` or `{ "role": "secondary", "label": "...", "url": "..." }` and must use HTTPS. `verified` requires primary-source evidence; `cross_checked` requires both primary and independent secondary evidence; `needs_review` requires a note explaining the issue; and `unverified` means the value was collected but has not yet been checked against a reliable source. Only attach a verification record when there is a value to assess. Missing information is not the same as an unverified claim. These statuses are displayed per field, alongside evidence links, and are validated before deployment. Field source records can also include `page`, `retrievedAt`, `reviewer`, and `corrections`.

#### 2022 winners archives and `scripts/import-winner-archives.js`

Run `npm run import-archives` (optionally followed by state names, e.g. `npm run import-archives -- Goa Punjab`) to rebuild the 2022 winners archives and link sitting MLAs. The script combines two secondary sources:

- **Wikipedia's "Results by constituency" table** for each state's 2022 election gives every seat's winner, party, votes, vote share and margin (stored as the candidacy's `result`). It is compiled from ECI results but is not an ECI record.
- **The ADR/MyNeta 2022 winners table** gives affidavit summaries: education, assets, liabilities and the declared criminal-case count (without individual case details). MyNeta renders some rows only through obfuscated scripts; the importer deliberately does not decode them, so those winners have a result but no affidavit summary. MyNeta also lists later by-election winners, which become by-election archives with affidavit summaries but no vote totals.

| State | Seats | With 2022 result | With affidavit summary | By-election winners |
| --- | --- | --- | --- | --- |
| Goa | 40 | 40 | 34 | 0 |
| Manipur | 60 | 60 | 54 | 0 |
| Punjab | 117 | 117 | 104 | 7 |
| Uttarakhand | 70 | 70 | 63 | 5 |
| Uttar Pradesh | 403 | 400 | 359 | 10 |
| Gujarat | 182 | 182 | 162 | 8 |

Records are matched across sources by constituency and winner name, tolerating transliteration and name-order differences but never accepting a shared surname alone. Where the two sources name different winners for the same seat (Goverdhan, Bilhaur and Jakhanian in Uttar Pradesh, where Wikipedia's table lists other people), the affidavit record is kept, the Wikipedia result is left out, and the name's verification note records the conflict; the current Assembly roster agrees with the affidavit record in all three. A 2022 winner who later won the same seat in a by-election shares one `people` identity across both records, and the comparison's "Previous elected positions" row lists such earlier wins. Re-running the script keeps existing candidacies and only adds missing fields, so manual corrections survive; it prints every match it is unsure of for review.

Every imported field is `unverified`; nothing has been checked against original affidavits or ECI Form 20/21 records. Goa's archive additionally keeps 26 detailed case rows across 14 profiles from an earlier manual import; those statuses describe historical affidavit declarations, not current court status. The six upcoming-election records remain empty because no verified candidate list has been added; an empty list does not mean no one will contest.

The page provides text search across candidate name, party, and constituency and a side-by-side comparison for up to three profiles. Clicking a sitting MLA's constituency card in the Current Assembly roster selects that person and opens the comparison drawer (right side on desktop, bottom sheet on mobile); vacant seats are not selectable. Current Assembly snapshot profiles are explicitly labeled as such and are not treated as declared candidates or historical election results.

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

Each member's `status` and a state's `notes` are optional. A member can also set `personId` to the `id` of an entry in `data/candidates.json` `people`, linking the sitting MLA to their candidacy records. Clicking a linked MLA in the roster opens their most detailed candidacy profile (the newest one with profile data), and the comparison shows their current seat alongside it; an unlinked MLA opens a Current Assembly placeholder with no affidavit details. A `personId` must exist in `people`, must not be set on a vacant seat, and can be used by only one seat per state. `scripts/import-winner-archives.js` sets these links: 851 of 864 sitting MLAs are linked. The unlinked ones are mostly winners of late-2024 and 2025 by-elections that the source tables do not yet include (ten in Uttar Pradesh, and Visavadar in Gujarat), plus Firozpur City (Punjab) and Umreth (Gujarat), where the roster name and the 2022 winner's name differ too much to link safely. Record a vacancy as a member entry with `name` and `party` set to `Vacant`, so it is included in the total Assembly strength. The sum of `seatCounts[].seats` must equal the number of entries in `members`; each constituency must appear only once. Source links must use HTTPS and labels should make secondary sources explicit. The preparation script checks required fields, duplicate constituencies, tally totals, and source links before deployment.

The Current Assembly panel renders `seatCounts` as a party seat-distribution pie chart with a matching legend showing seat totals and percentages. The chart represents state-wide Assembly composition; individual constituency entries remain in the expandable roster below it.

Known vacancies and source conflicts are documented in the relevant state data. Some rosters rely on secondary sources where a current official roster could not be verified. Check the source links and update `asOf` and the affected data when membership changes. Do not treat current MLAs as candidates for the next election.

## Data maintenance

Expected election windows, candidate/manifesto entries, and current Assembly snapshots are curated separately from the automated ECI feed. Only `data/elections.json` is refreshed by the ECI workflow. It still deploys the last saved announcement feed if a refresh fails, with stale-data metadata shown on the page. Verify official notices and roster sources before updating curated records.
