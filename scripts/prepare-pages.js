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

    if (
        candidateData.schemaVersion !== 3 ||
        !Array.isArray(candidateData.people) ||
        !candidateData.states ||
        typeof candidateData.states !== "object" ||
        !Array.isArray(candidateData.elections)
    ) {
        throw new Error("The saved candidate data is invalid; refusing to deploy it.");
    }

    const peopleById = new Map();
    for (const person of candidateData.people) {
        if (
            typeof person.id !== "string" ||
            !person.id.trim() ||
            typeof person.name !== "string" ||
            !person.name.trim() ||
            (person.aliases !== undefined &&
                (!Array.isArray(person.aliases) ||
                    person.aliases.some((alias) => typeof alias !== "string" || !alias.trim())))
        ) {
            throw new Error("The saved candidate identity data is incomplete; refusing to deploy it.");
        }
        if (peopleById.has(person.id)) {
            throw new Error(`The saved candidate identity ${person.id} is duplicated; refusing to deploy it.`);
        }
        peopleById.set(person.id, person);
    }

    for (const [state, stateData] of Object.entries(candidateData.states)) {
        if (!Array.isArray(stateData.manifestos)) {
            throw new Error(`The saved manifesto data for ${state} is incomplete; refusing to deploy it.`);
        }
    }

    const electionIds = new Set();
    const candidacyIds = new Set();
    const candidacyLocations = new Set();
    const candidateScopes = new Set(["declared_candidates", "winners_archive"]);
    for (const election of candidateData.elections) {
        if (
            typeof election.id !== "string" ||
            !election.id.trim() ||
            typeof election.state !== "string" ||
            !election.state.trim() ||
            !candidateData.states[election.state] ||
            !Number.isInteger(election.year) ||
            typeof election.type !== "string" ||
            !election.type.trim() ||
            !candidateScopes.has(election.candidateScope) ||
            !Array.isArray(election.candidacies)
        ) {
            throw new Error("The saved candidate election data is incomplete; refusing to deploy it.");
        }
        if (electionIds.has(election.id)) {
            throw new Error(`The saved election ${election.id} is duplicated; refusing to deploy it.`);
        }
        electionIds.add(election.id);

        if (election.sources !== undefined && !Array.isArray(election.sources)) {
            throw new Error(`The sources for candidate election ${election.id} are invalid; refusing to deploy it.`);
        }
        for (const source of election.sources || []) {
            validateSource(source, `candidate election archive ${election.id}`);
        }
        for (const candidacy of election.candidacies) {
            if (
                typeof candidacy.id !== "string" ||
                !candidacy.id.trim() ||
                !peopleById.has(candidacy.candidateId) ||
                typeof candidacy.constituency !== "string" ||
                !candidacy.constituency.trim() ||
                typeof candidacy.party !== "string" ||
                !candidacy.party.trim() ||
                typeof candidacy.status !== "string" ||
                !candidacy.status.trim()
            ) {
                throw new Error(`A candidacy in ${election.id} is incomplete or references an unknown candidate; refusing to deploy it.`);
            }
            if (candidacyIds.has(candidacy.id)) {
                throw new Error(`The candidacy ${candidacy.id} is duplicated; refusing to deploy it.`);
            }
            candidacyIds.add(candidacy.id);
            const location = `${election.id}:${candidacy.constituency.trim().toLocaleLowerCase()}`;
            if (candidacyLocations.has(location)) {
                throw new Error(`The election ${election.id} contains duplicate candidacies for ${candidacy.constituency}; refusing to deploy it.`);
            }
            candidacyLocations.add(location);

            const candidate = {
                ...candidacy,
                name: peopleById.get(candidacy.candidateId).name
            };

            validateCandidateVerification(candidate.verification, `candidate ${candidate.name}`);

            if (candidate.affidavit) {
                validateSource(candidate.affidavit, `candidate affidavit for ${candidate.name}`);
            }
            if (candidate.sources !== undefined && !Array.isArray(candidate.sources)) {
                throw new Error(`The sources for ${candidate.name} are invalid; refusing to deploy it.`);
            }
            for (const source of candidate.sources || []) {
                validateSource(source, `candidate profile for ${candidate.name}`);
            }

            if (candidate.profile !== undefined && (!candidate.profile || typeof candidate.profile !== "object" || Array.isArray(candidate.profile))) {
                throw new Error(`The profile for ${candidate.name} is invalid; refusing to deploy it.`);
            }
            const profile = candidate.profile || {};
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
                        (result.voteShare !== undefined && (!Number.isFinite(result.voteShare) || result.voteShare < 0 || result.voteShare > 100)) ||
                        (result.margin !== undefined && (!Number.isInteger(result.margin) || result.margin < 0))
                    ) {
                        throw new Error(`An election result for ${candidate.name} is invalid; refusing to deploy it.`);
                    }
                    if (result.source) validateSource(result.source, `election result for ${candidate.name}`);
                }
            }

            if (candidate.result) {
                if (
                    (candidate.result.votes !== undefined && (!Number.isInteger(candidate.result.votes) || candidate.result.votes < 0)) ||
                    (candidate.result.voteShare !== undefined && (!Number.isFinite(candidate.result.voteShare) || candidate.result.voteShare < 0 || candidate.result.voteShare > 100)) ||
                    (candidate.result.margin !== undefined && (!Number.isInteger(candidate.result.margin) || candidate.result.margin < 0))
                ) {
                    throw new Error(`The election result for ${candidate.name} is invalid; refusing to deploy it.`);
                }
                if (candidate.result.source) validateSource(candidate.result.source, `election result for ${candidate.name}`);
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
    if (source.retrievedAt !== undefined && Number.isNaN(Date.parse(source.retrievedAt))) {
        throw new Error(`The retrieval date for the source link for ${context} is invalid; refusing to deploy it.`);
    }
    if (source.page !== undefined && typeof source.page !== "string" && !Number.isInteger(source.page)) {
        throw new Error(`The page reference for the source link for ${context} is invalid; refusing to deploy it.`);
    }
    if (source.corrections !== undefined && !Array.isArray(source.corrections)) {
        throw new Error(`The source corrections for ${context} are invalid; refusing to deploy it.`);
    }
}

function validateCandidateVerification(verification, context) {
    if (verification === undefined) return;
    const statuses = new Set(["verified", "cross_checked", "needs_review", "unverified"]);
    const fields = new Set([
        "name",
        "party",
        "constituency",
        "affidavit",
        "previousPositions",
        "education",
        "assets",
        "liabilities",
        "criminalCases",
        "electionResults"
    ]);
    if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
        throw new Error(`The verification data for ${context} is invalid; refusing to deploy it.`);
    }

    for (const [field, record] of Object.entries(verification)) {
        if (
            !fields.has(field) ||
            !record ||
            typeof record !== "object" ||
            Array.isArray(record) ||
            !statuses.has(record.status)
        ) {
            throw new Error(`A verification status for ${context} is invalid; refusing to deploy it.`);
        }

        if (record.status !== "unverified") {
            if (
                typeof record.reviewer !== "string" ||
                !record.reviewer.trim() ||
                typeof record.checkedAt !== "string" ||
                Number.isNaN(Date.parse(record.checkedAt))
            ) {
                throw new Error(`The reviewer and check date for ${context} (${field}) are required; refusing to deploy it.`);
            }
        }
        if (record.status === "needs_review" && (typeof record.note !== "string" || !record.note.trim())) {
            throw new Error(`A review note is required for ${context} (${field}); refusing to deploy it.`);
        }
        if (record.note !== undefined && (typeof record.note !== "string" || !record.note.trim())) {
            throw new Error(`The verification note for ${context} (${field}) is invalid; refusing to deploy it.`);
        }
        if (record.sources !== undefined && !Array.isArray(record.sources)) {
            throw new Error(`The verification sources for ${context} (${field}) are invalid; refusing to deploy it.`);
        }

        const sourceUrlsByRole = {
            primary: new Set(),
            secondary: new Set()
        };
        for (const source of record.sources || []) {
            validateSource(source, `verification of ${context} (${field})`);
            if (!["primary", "secondary"].includes(source.role)) {
                throw new Error(`A verification source role for ${context} (${field}) is invalid; refusing to deploy it.`);
            }
            sourceUrlsByRole[source.role].add(new URL(source.url).href);
        }
        if (record.status === "verified" && sourceUrlsByRole.primary.size === 0) {
            throw new Error(`Primary-source evidence is required for ${context} (${field}) to be verified; refusing to deploy it.`);
        }
        if (
            record.status === "cross_checked" &&
            (!sourceUrlsByRole.primary.size ||
                ![...sourceUrlsByRole.secondary].some((url) => !sourceUrlsByRole.primary.has(url)))
        ) {
            throw new Error(`Primary and independent secondary sources are required for ${context} (${field}) to be cross-checked; refusing to deploy it.`);
        }
    }
}

main().catch((error) => {
    console.error("Unable to prepare the GitHub Pages site:", error);
    process.exitCode = 1;
});
