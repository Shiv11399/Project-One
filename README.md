# The Ballot Grid

An India election calendar with live notices from the Election Commission of India (ECI).

## Run locally

1. Install Node.js 18 or newer.
2. From this folder, run `npm start`.
3. Open <http://127.0.0.1:8000>.

Use the **Refresh ECI updates** button to request the latest notices immediately. Automatic page loads use a 10-minute cache; the server shows an error if the ECI feed cannot be reached. The page must be opened through this server; opening `index.html` directly will not provide the API route.

## Deploy on Vercel

1. Push this project to GitHub.
2. In Vercel, import the GitHub repository and deploy it with the project root set to this folder. No build command or environment variables are required.
3. Add `theballotgrid.in` and `www.theballotgrid.in` to the Vercel project's Domains settings and follow the DNS instructions Vercel shows for your domain.
4. After Vercel verifies the domain and deployment, make Vercel the domain's website host instead of GitHub Pages.

Vercel serves `index.html` as the static site and deploys `api/elections.js` as the `/api/elections` serverless function. The local `npm start` server remains available for development.

## Data notes

The server retrieves ECI's public announcements API and links to the original ECI notice documents. The page checks the latest 100 press-release entries and shows notices whose titles mention an election and the selected state. Expected election windows and assembly seat counts remain curated reference data. Official polling dates are not inferred from press-release titles; follow the linked ECI notice for its full schedule.
