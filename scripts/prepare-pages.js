const { cp, mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

async function main() {
    const projectRoot = path.join(__dirname, "..");
    const outputDirectory = process.env.PAGES_OUTPUT_DIR || path.join(projectRoot, "_site");
    const feedPath = path.join(projectRoot, "data", "elections.json");
    const feed = JSON.parse(await readFile(feedPath, "utf8"));
    const candidateDataPath = path.join(projectRoot, "data", "candidates.json");
    const candidateData = JSON.parse(await readFile(candidateDataPath, "utf8"));
    const incumbentDataPath = path.join(projectRoot, "data", "incumbents.json");
    const incumbentData = JSON.parse(await readFile(incumbentDataPath, "utf8"));

    if (
        typeof feed.lastChecked !== "string" ||
        Number.isNaN(Date.parse(feed.lastChecked)) ||
        !Array.isArray(feed.announcements)
    ) {
        throw new Error("The saved ECI feed is invalid; refusing to deploy it.");
    }

    if (candidateData.schemaVersion !== 2 || !candidateData.states || typeof candidateData.states !== "object") {
        throw new Error("The saved candidate data is invalid; refusing to deploy it.");
    }

    for (const [state, stateData] of Object.entries(candidateData.states)) {
        if (
            !Array.isArray(stateData.candidates) ||
            !Array.isArray(stateData.manifestos)
        ) {
            throw new Error(`The saved candidate and manifesto data for ${state} is incomplete; refusing to deploy it.`);
        }

        const profileEntries = [...stateData.candidates];
        if (stateData.previousElection) {
            const previousElection = stateData.previousElection;
            if (
                !Number.isInteger(previousElection.year) ||
                !Array.isArray(previousElection.winners) ||
                !Array.isArray(previousElection.sources)
            ) {
                throw new Error(`The previous-election profile archive for ${state} is invalid; refusing to deploy it.`);
            }
            profileEntries.push(...previousElection.winners);
            for (const source of previousElection.sources) {
                validateSource(source, `previous-election archive for ${state}`);
            }
        }

        for (const candidate of profileEntries) {
            if (
                typeof candidate.name !== "string" ||
                !candidate.name.trim() ||
                typeof candidate.party !== "string" ||
                !candidate.party.trim() ||
                typeof candidate.constituency !== "string" ||
                !candidate.constituency.trim()
            ) {
                throw new Error(`A saved candidate profile for ${state} is incomplete; refusing to deploy it.`);
            }

            if (candidate.affidavit) {
                validateSource(candidate.affidavit, `candidate affidavit for ${candidate.name}`);
            }
            if (candidate.sources !== undefined && !Array.isArray(candidate.sources)) {
                throw new Error(`The sources for ${candidate.name} are invalid; refusing to deploy it.`);
            }
            for (const source of candidate.sources || []) {
                validateSource(source, `candidate profile for ${candidate.name}`);
            }

            const profile = candidate.profile;
            if (!profile) continue;
            if (profile.previousPositions !== undefined && !Array.isArray(profile.previousPositions)) {
                throw new Error(`The previous positions for ${candidate.name} are invalid; refusing to deploy it.`);
            }
            for (const position of profile.previousPositions || []) {
                if (!position || typeof position.title !== "string" || !position.title.trim()) {
                    throw new Error(`A previous position for ${candidate.name} is incomplete; refusing to deploy it.`);
                }
                if (position.source) validateSource(position.source, `previous position for ${candidate.name}`);
            }
            for (const field of ["education", "assets", "liabilities"]) {
                const disclosure = profile[field];
                if (disclosure !== undefined) {
                    if (!disclosure || typeof disclosure.value !== "string") {
                        throw new Error(`The ${field} disclosure for ${candidate.name} is invalid; refusing to deploy it.`);
                    }
                    if (disclosure.source) validateSource(disclosure.source, `${field} disclosure for ${candidate.name}`);
                }
            }

            if (profile.criminalCases !== undefined) {
                const criminalCases = profile.criminalCases;
                if (
                    !Number.isInteger(criminalCases.declaredCount) ||
                    criminalCases.declaredCount < 0 ||
                    !Array.isArray(criminalCases.entries)
                ) {
                    throw new Error(`The criminal-case disclosure for ${candidate.name} is invalid; refusing to deploy it.`);
                }
                const caseStatuses = new Set(["pending", "convicted", "acquitted", "disposed", "unknown"]);
                for (const entry of criminalCases.entries) {
                    if (!caseStatuses.has(entry.status)) {
                        throw new Error(`A criminal-case status for ${candidate.name} is invalid; refusing to deploy it.`);
                    }
                    if (entry.source) validateSource(entry.source, `criminal-case entry for ${candidate.name}`);
                }
                if (criminalCases.source) validateSource(criminalCases.source, `criminal-case disclosure for ${candidate.name}`);
            }

            if (profile.electionResults !== undefined) {
                if (!Array.isArray(profile.electionResults)) {
                    throw new Error(`The election results for ${candidate.name} are invalid; refusing to deploy it.`);
                }
                for (const result of profile.electionResults) {
                    if (
                        !Number.isInteger(result.year) ||
                        (result.votes !== undefined && (!Number.isInteger(result.votes) || result.votes < 0)) ||
                        (result.voteShare !== undefined && (!Number.isFinite(result.voteShare) || result.voteShare < 0 || result.voteShare > 100))
                    ) {
                        throw new Error(`An election result for ${candidate.name} is invalid; refusing to deploy it.`);
                    }
                    if (result.source) validateSource(result.source, `election result for ${candidate.name}`);
                }
            }
        }
    }

    if (incumbentData.schemaVersion !== 1 || !incumbentData.states || typeof incumbentData.states !== "object") {
        throw new Error("The saved current Assembly data is invalid; refusing to deploy it.");
    }

    for (const [state, snapshot] of Object.entries(incumbentData.states)) {
        if (
            typeof snapshot.asOf !== "string" ||
            Number.isNaN(Date.parse(snapshot.asOf)) ||
            typeof snapshot.government !== "string" ||
            typeof snapshot.chiefMinister !== "string" ||
            !Array.isArray(snapshot.members) ||
            !Array.isArray(snapshot.seatCounts) ||
            !Array.isArray(snapshot.sources)
        ) {
            throw new Error(`The saved current Assembly snapshot for ${state} is incomplete; refusing to deploy it.`);
        }

        const seatCountTotal = snapshot.seatCounts.reduce((total, entry) => {
            if (typeof entry.party !== "string" || !Number.isInteger(entry.seats) || entry.seats < 0) {
                throw new Error(`The saved party tally for ${state} is invalid; refusing to deploy it.`);
            }
            return total + entry.seats;
        }, 0);

        if (seatCountTotal !== snapshot.members.length) {
            throw new Error(`The saved seat tally for ${state} does not match its constituency list; refusing to deploy it.`);
        }

        const constituencies = new Set();
        for (const member of snapshot.members) {
            if (
                typeof member.name !== "string" ||
                !member.name.trim() ||
                typeof member.constituency !== "string" ||
                !member.constituency.trim() ||
                typeof member.party !== "string" ||
                !member.party.trim()
            ) {
                throw new Error(`The saved constituency list for ${state} contains an incomplete member; refusing to deploy it.`);
            }
            const constituency = member.constituency.trim().toLocaleLowerCase();
            if (constituencies.has(constituency)) {
                throw new Error(`The saved constituency list for ${state} contains a duplicate seat; refusing to deploy it.`);
            }
            constituencies.add(constituency);
        }

        for (const source of snapshot.sources) {
            let sourceUrl;
            try {
                sourceUrl = new URL(source.url);
            } catch (error) {
                throw new Error(`The saved source link for ${state} is invalid; refusing to deploy it.`, { cause: error });
            }
            if (sourceUrl.protocol !== "https:" || typeof source.label !== "string" || !source.label.trim()) {
                throw new Error(`The saved source link for ${state} is invalid; refusing to deploy it.`);
            }
        }
    }

    const refreshFailed = process.env.FEED_REFRESH_STATUS === "failure";
    const pageFeed = {
        ...feed,
        stale: refreshFailed
    };

    if (!refreshFailed) {
        delete pageFeed.warning;
        delete pageFeed.lastAttempted;
    } else {
        pageFeed.warning = "The latest automatic ECI refresh failed. These are the last successfully saved notices.";
        pageFeed.lastAttempted = new Date().toISOString();
    }

    const dataDirectory = path.join(outputDirectory, "data");
    const assetsDirectory = path.join(outputDirectory, "assets");
    await Promise.all([
        mkdir(dataDirectory, { recursive: true }),
        mkdir(assetsDirectory, { recursive: true })
    ]);

    await Promise.all([
        cp(path.join(projectRoot, "index.html"), path.join(outputDirectory, "index.html")),
        cp(path.join(projectRoot, "CNAME"), path.join(outputDirectory, "CNAME")),
        cp(path.join(projectRoot, "assets"), assetsDirectory, { recursive: true }),
        writeFile(path.join(dataDirectory, "elections.json"), `${JSON.stringify(pageFeed, null, 2)}\n`, "utf8"),
        writeFile(path.join(dataDirectory, "candidates.json"), `${JSON.stringify(candidateData, null, 2)}\n`, "utf8"),
        writeFile(path.join(dataDirectory, "incumbents.json"), `${JSON.stringify(incumbentData, null, 2)}\n`, "utf8")
    ]);

    console.log(
        !refreshFailed
            ? `Prepared GitHub Pages with ${feed.announcements.length} saved ECI notices.`
            : `Prepared GitHub Pages with ${feed.announcements.length} saved ECI notices; the latest refresh failed.`
    );
}

function validateSource(source, context) {
    let sourceUrl;
    try {
        sourceUrl = new URL(source.url);
    } catch (error) {
        throw new Error(`The source link for ${context} is invalid; refusing to deploy it.`, { cause: error });
    }
    if (sourceUrl.protocol !== "https:" || typeof source.label !== "string" || !source.label.trim()) {
        throw new Error(`The source link for ${context} is invalid; refusing to deploy it.`);
    }
}

main().catch((error) => {
    console.error("Unable to prepare the GitHub Pages site:", error);
    process.exitCode = 1;
});
