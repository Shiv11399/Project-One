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

    if (candidateData.schemaVersion !== 1 || !candidateData.states || typeof candidateData.states !== "object") {
        throw new Error("The saved candidate data is invalid; refusing to deploy it.");
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

main().catch((error) => {
    console.error("Unable to prepare the GitHub Pages site:", error);
    process.exitCode = 1;
});
