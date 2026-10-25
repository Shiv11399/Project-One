# The Ballot Grid

An India election calendar with live notices from the Election Commission of India (ECI).

## Run locally

1. Install Node.js 18 or newer.
2. From this folder, run `npm start`.
3. Open <http://127.0.0.1:8000>.

Use the **Refresh ECI updates** button to request the latest notices immediately. Automatic page loads use a 10-minute cache; the server shows an error if the ECI feed cannot be reached. The page must be opened through this server; opening `index.html` directly will not provide the API route.

## Data notes

The server retrieves ECI's public announcements API and links to the original ECI notice documents. The page checks the latest 100 press-release entries and shows notices whose titles mention an election and the selected state. Expected election windows and assembly seat counts remain curated reference data. Official polling dates are not inferred from press-release titles; follow the linked ECI notice for its full schedule.
