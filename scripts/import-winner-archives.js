// Builds the 2022 winners archives in data/candidates.json and links sitting MLAs in
// data/incumbents.json to them.
//
// - Every seat's 2022 winner and result (votes, vote share, margin) come from Wikipedia's
//   "Results by constituency" table, a secondary source compiled from ECI results.
// - Affidavit summaries (education, assets, liabilities, declared case counts) come from the
//   plain rows of the ADR/MyNeta winners table. Rows MyNeta renders only through obfuscated
//   scripts are deliberately not decoded; those winners keep their result but no summary.
// - MyNeta also lists later by-election winners; they become separate by-election archives
//   so sitting MLAs elected in by-elections get a profile too.
// - Where the two sources name different winners for the same seat, the MyNeta affidavit
//   record is kept and the Wikipedia result is left out rather than attached to the wrong person.
//
// Everything imported is marked unverified. Existing candidacies are kept and only gain
// missing fields, so hand-curated corrections survive a re-run. Pass state names to limit
// the run, e.g. `node scripts/import-winner-archives.js Goa Punjab`.
const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const states = [
    { state: "Goa", prefix: "goa", myneta: "Goa2022", wikipedia: "2022_Goa_Legislative_Assembly_election", seats: 40 },
    { state: "Manipur", prefix: "manipur", myneta: "Manipur2022", wikipedia: "2022_Manipur_Legislative_Assembly_election", seats: 60 },
    { state: "Punjab", prefix: "punjab", myneta: "Punjab2022", wikipedia: "2022_Punjab_Legislative_Assembly_election", seats: 117 },
    { state: "Uttarakhand", prefix: "uttarakhand", myneta: "Uttarakhand2022", wikipedia: "2022_Uttarakhand_Legislative_Assembly_election", seats: 70 },
    { state: "Uttar Pradesh", prefix: "uttar-pradesh", myneta: "UttarPradesh2022", wikipedia: "2022_Uttar_Pradesh_Legislative_Assembly_election", seats: 403 },
    { state: "Gujarat", prefix: "gujarat", myneta: "Gujarat2022", wikipedia: "2022_Gujarat_Legislative_Assembly_election", seats: 182 }
];
const year = 2022;
const retrievedAt = new Date().toISOString().slice(0, 10);
const userAgent = "TheBallotGrid/1.0 (India election calendar; winners archive import)";
const projectRoot = path.join(__dirname, "..");
const candidatesPath = path.join(projectRoot, "data", "candidates.json");
const incumbentsPath = path.join(projectRoot, "data", "incumbents.json");
const titles = new Set([
    "dr", "prof", "master", "adv", "advocate", "er", "shri", "sri", "smt", "capt", "col", "retd",
    "qazi", "haji", "hafiz", "kunwar", "sardar", "pandit"
]);

function stripHtml(value) {
    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&#91;/g, "[")
        .replace(/&#93;/g, "]")
        .replace(/&#160;|&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// The reservation tag is dropped here because sources disagree on it ("PERNEM (SC)" /
// "Pernem"); `fullConstituencyKey` keeps it to tell apart seats such as "Jetpur" and "Jetpur (ST)".
function constituencyKey(value) {
    return String(value).toLowerCase().replace(/\((sc|st)\)/g, "").replace(/[^a-z]/g, "");
}

function fullConstituencyKey(value) {
    return String(value).toLowerCase().replace(/[^a-z]/g, "");
}

function constituenciesClose(first, second) {
    const a = constituencyKey(first);
    const b = constituencyKey(second);
    // 0.65 admits "Khambaliya" / "KHAMBHALIA" but not "Patti" / "Patiala" (0.6); callers also
    // require the winner's name to agree.
    return a === b || a.startsWith(b) || b.startsWith(a) || similarity(a, b) >= 0.65;
}

const nameVariants = new Map([["mohd", "mohammad"], ["md", "mohammad"], ["mohammed", "mohammad"], ["muhammad", "mohammad"]]);

function nameTokens(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token && !titles.has(token))
        .map((token) => nameVariants.get(token) || token);
}

// Gujarati names carry respectful suffixes ("Jethabhai", "Ritaben") that make unrelated
// given names look alike, so they are compared without them.
function nameCore(token) {
    const core = token.replace(/(bhai|ben|behn|bahen)$/, "");
    return core.length >= 3 ? core : token;
}

function tokensMatch(first, second) {
    const a = nameCore(first);
    const b = nameCore(second);
    if (a === b) return true;
    if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
    return similarity(a, b) >= 0.45;
}

function bigrams(value) {
    const pairs = [];
    for (let index = 0; index < value.length - 1; index++) pairs.push(value.slice(index, index + 2));
    return pairs;
}

// Dice coefficient over letter pairs: tolerant of transliteration ("Dharmpal" / "Dharampal")
// and spacing ("Omkumar" / "Om Kumar").
function similarity(first, second) {
    if (first === second) return 1;
    const firstPairs = bigrams(first);
    const secondPairs = bigrams(second);
    if (!firstPairs.length || !secondPairs.length) return 0;
    const counts = new Map();
    firstPairs.forEach((pair) => counts.set(pair, (counts.get(pair) || 0) + 1));
    let shared = 0;
    secondPairs.forEach((pair) => {
        const count = counts.get(pair);
        if (count) {
            shared++;
            counts.set(pair, count - 1);
        }
    });
    return (2 * shared) / (firstPairs.length + secondPairs.length);
}

function nameSimilarity(first, second) {
    return similarity(nameTokens(first).join(""), nameTokens(second).join(""));
}

function sameFullName(first, second) {
    return nameTokens(first).join("") === nameTokens(second).join("");
}

// Each name's first word must appear in the other name. This tolerates reordering
// ("Patel Raghavjibhai" / "Raghavjibhai Patel") but rejects different people who share
// a surname ("Harshadbhai Parmar" / "Govindbhai Parmar").
function givenNamesSimilar(first, second) {
    const firstTokens = nameTokens(first);
    const secondTokens = nameTokens(second);
    if (!firstTokens.length || !secondTokens.length) return false;
    return secondTokens.some((token) => tokensMatch(firstTokens[0], token)) &&
        firstTokens.some((token) => tokensMatch(secondTokens[0], token));
}

// A shared surname plus a matching initial: "P. M. Jadeja" / "Jadeja Pradhyumansinh
// Mahipatsinh", "Jitu Vaghani" / "Jitendrabhai Savajibhai Vaghani".
function initialsAndSurnameMatch(first, second) {
    const firstTokens = nameTokens(first).map(nameCore);
    const secondTokens = nameTokens(second).map(nameCore);
    const shared = firstTokens.filter((token) => token.length >= 4 && secondTokens.includes(token));
    if (!shared.length) return false;
    const initialFound = (tokens, others) => {
        const given = tokens.find((token) => !shared.includes(token));
        return Boolean(given) && others.some((token) => !shared.includes(token) && token[0] === given[0]);
    };
    return initialFound(firstTokens, secondTokens) || initialFound(secondTokens, firstTokens);
}

// Two sources describing the winner of the same seat in the same election: they should be
// one person, so only reject names that are clearly different ("Bedi" / "Triveni Ram",
// "Mohit Sonkar" / "Rahul Bachha Sonkar").
function sameSeatWinnersMatch(first, second) {
    return nameSimilarity(first, second) >= 0.45 || givenNamesSimilar(first, second) || initialsAndSurnameMatch(first, second);
}

// A sitting MLA against an earlier winner of the seat may be a different person after a
// by-election, so require both the given name and the whole name to agree
// ("Gurdeep Singh Randhawa" is not "Sukhjinder Singh Randhawa").
function samePersonLater(first, second) {
    return givenNamesSimilar(first, second) && nameSimilarity(first, second) >= 0.5;
}

function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseInteger(value) {
    const digits = String(value).replace(/[^0-9]/g, "");
    return digits ? Number(digits) : undefined;
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchText(url) {
    const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
    return response.text();
}

async function fetchWikipediaResults(config) {
    const api = "https://en.wikipedia.org/w/api.php?format=json&formatversion=2&action=parse";
    const sections = JSON.parse(await fetchText(`${api}&prop=sections&page=${config.wikipedia}`)).parse.sections;
    const section = sections.find((entry) => /^results by constituency$/i.test(entry.line));
    if (!section) throw new Error(`No "Results by constituency" section on ${config.wikipedia}.`);
    const html = JSON.parse(await fetchText(`${api}&prop=text&section=${section.index}&page=${config.wikipedia}`)).parse.text;

    const results = [];
    let district = "";
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => stripHtml(cell[1]));
        // District names arrive either as a row of their own or as a leading cell spanning rows.
        if (cells.length === 1) district = cells[0].replace(/\s+district$/i, "");
        // Rows start with an optional district cell, then the constituency number and name.
        const numberIndex = cells.findIndex((cell) => /^\d{1,3}$/.test(cell));
        if (numberIndex < 0 || numberIndex > 1) continue;
        if (numberIndex === 1) district = cells[0];
        let index = numberIndex + 1;
        const constituency = cells[index++];
        if (/^\d+(\.\d+)?$/.test(cells[index])) index++; // optional turnout column
        const winner = cells[index++];
        if (cells[index] === "") index++; // party colour swatch
        const party = cells[index++];
        const votes = parseInteger(cells[index++]);
        const voteShare = Number(cells[index++]);
        const runnerUp = cells[index++];
        if (cells[index] === "") index++;
        const runnerUpParty = cells[index++];
        index += 2; // runner-up votes and share
        const margin = parseInteger(cells[index]);
        if (!constituency || !winner || !Number.isInteger(votes) || !Number.isFinite(voteShare) || !Number.isInteger(margin)) {
            throw new Error(`Could not parse the ${config.state} results row: ${JSON.stringify(cells)}`);
        }
        results.push({ number: Number(cells[numberIndex]), constituency, district, winner, party, votes, voteShare, margin, runnerUp, runnerUpParty });
    }
    // Two seats can share a name in different districts (Gujarat has two "Kalol" seats).
    const nameCounts = new Map();
    results.forEach((seat) => nameCounts.set(seat.constituency, (nameCounts.get(seat.constituency) || 0) + 1));
    results.forEach((seat) => {
        if (nameCounts.get(seat.constituency) > 1 && seat.district) seat.constituency = `${seat.constituency} (${seat.district})`;
    });
    if (results.length !== config.seats) {
        throw new Error(`Expected ${config.seats} ${config.state} results on Wikipedia but parsed ${results.length}.`);
    }
    return results;
}

async function fetchMynetaWinners(config) {
    const html = await fetchText(`https://www.myneta.info/${config.myneta}/index.php?action=show_winners&sort=default`);
    const winners = [];
    for (const row of html.matchAll(/<tr[^>]*>\s*<td[^>]*>\s*\d+\s*<\/td>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
        const link = cells[0]?.match(new RegExp(`/${config.myneta}/candidate\\.php\\?candidate_id=(\\d+)>([^<]+)<`));
        if (!link || cells.length < 7) continue;
        const money = (cell) => {
            const amount = stripHtml(cell.split("<br>")[0]).replace(/^Rs\s*/, "");
            return /\d/.test(amount) ? `INR ${amount}` : amount;
        };
        const constituencyText = stripHtml(cells[1]);
        const byElection = constituencyText.match(/^(.*?)\s*:\s*BYE ELECTION ON (\d{2})-(\d{2})-(\d{4})$/i);
        winners.push({
            mynetaId: link[1],
            name: stripHtml(link[2]),
            constituency: byElection ? byElection[1] : constituencyText,
            byElectionDate: byElection ? `${byElection[4]}-${byElection[3]}-${byElection[2]}` : undefined,
            party: stripHtml(cells[2]),
            criminalCases: parseInteger(stripHtml(cells[3])) ?? 0,
            education: stripHtml(cells[4]),
            assets: money(cells[5]),
            liabilities: money(cells[6])
        });
    }
    return winners;
}

function mynetaSource(config, winner) {
    return {
        label: `ADR/MyNeta ${config.state} ${year} winner affidavit summary (secondary)`,
        url: `https://www.myneta.info/${config.myneta}/candidate.php?candidate_id=${winner.mynetaId}`,
        retrievedAt
    };
}

function wikipediaSource(config) {
    return {
        label: `Wikipedia ${config.state} ${year} results by constituency (secondary; compiled from ECI results)`,
        url: `https://en.wikipedia.org/wiki/${config.wikipedia}#Results_by_constituency`,
        retrievedAt
    };
}

function addAffidavitSummary(candidacy, config, winner) {
    const source = mynetaSource(config, winner);
    candidacy.profile.education = { value: winner.education, source };
    candidacy.profile.assets = { value: winner.assets, source };
    candidacy.profile.liabilities = { value: winner.liabilities, source };
    candidacy.profile.criminalCases = { declaredCount: winner.criminalCases, entries: [], source };
    candidacy.verification.education = { status: "unverified" };
    candidacy.verification.assets = { status: "unverified" };
    candidacy.verification.liabilities = { status: "unverified" };
    candidacy.verification.criminalCases = {
        status: "unverified",
        note: winner.criminalCases
            ? "Declared case count from the ADR/MyNeta winners table; individual case details have not been imported or checked against the original ECI affidavit. A pending case is an allegation, not a conviction."
            : "The source reports zero declared cases; this has not yet been checked against the original affidavit."
    };
    if (!candidacy.sources.some((entry) => entry.url === source.url)) candidacy.sources.push(source);
}

function newCandidacy(id, personId, constituency, party, status) {
    return {
        id,
        candidateId: personId,
        constituency,
        party,
        status,
        verification: {
            name: { status: "unverified" },
            party: { status: "unverified" },
            constituency: { status: "unverified" }
        },
        profile: {},
        sources: []
    };
}

function createPerson(config, name, constituency, aliases, candidateData, peopleById) {
    let id = `${config.prefix}-${slugify(name)}`;
    if (peopleById.has(id)) id = `${id}-${slugify(constituency)}`;
    const person = { id, name };
    const extraAliases = aliases.filter((alias) => alias && !sameFullName(alias, name));
    if (extraAliases.length) person.aliases = extraAliases;
    peopleById.set(id, person);
    candidateData.people.push(person);
    return id;
}

// Picks the single best entry from `pool` for a seat: same constituency first, then a very
// close constituency spelling ("Naoria" / "Naoriya") whose winner has the same name. Nearby
// spellings of different seats ("Patti" / "Patiala") must not pass.
function bestSeatMatch(pool, seat, getConstituency, getName, seatKeys) {
    // Same seat name including any reservation tag, whoever the winner is called: a name
    // conflict here is reported by the caller rather than resolved by guessing.
    const exact = pool.filter((entry) => fullConstituencyKey(getConstituency(entry)) === fullConstituencyKey(seat.constituency));
    if (exact.length === 1) return { entry: exact[0], exactSeat: true };
    // Otherwise the seat name may be spelled or tagged differently ("Devgadhbariya" /
    // "DEVGADHBARIA", "Kalol" / "KALOL-GANDHINAGAR"), so the winner's name has to agree too.
    const key = constituencyKey(seat.constituency);
    const close = pool
        .filter((entry) => constituenciesClose(getConstituency(entry), seat.constituency) && sameSeatWinnersMatch(getName(entry), seat.winner))
        .map((entry) => ({ entry, score: similarity(constituencyKey(getConstituency(entry)), key) + nameSimilarity(getName(entry), seat.winner) }))
        .sort((first, second) => second.score - first.score);
    if (close.length && (close.length === 1 || close[0].score > close[1].score)) return { entry: close[0].entry, exactSeat: false };
    // A clearly different spelling with a near-identical winner name ("MANGLORE" / "Manglaur").
    const looser = pool.filter((entry) =>
        similarity(constituencyKey(getConstituency(entry)), key) >= 0.5 && nameSimilarity(getName(entry), seat.winner) >= 0.8);
    if (looser.length === 1) return { entry: looser[0], exactSeat: false };
    // Last resort for spellings too different to compare ("ST. CRUZ" / "Santa Cruz"): only
    // entries whose constituency is not some other seat's name, so two winners called
    // "Dharmpal Singh" in different seats can never be swapped.
    const byName = pool.filter((entry) =>
        !seatKeys.has(constituencyKey(getConstituency(entry))) && nameSimilarity(getName(entry), seat.winner) >= 0.85);
    if (byName.length === 1) return { entry: byName[0], exactSeat: false };
    return {};
}

async function importState(config, candidateData, peopleById, report) {
    const seats = await fetchWikipediaResults(config);
    await sleep(1500);
    const mynetaRows = await fetchMynetaWinners(config);
    await sleep(1500);

    const generalRows = new Set(mynetaRows.filter((row) => !row.byElectionDate));
    const byElectionRows = mynetaRows.filter((row) => row.byElectionDate);
    const electionId = `${config.prefix}-${year}-assembly-winners`;
    let election = candidateData.elections.find((entry) => entry.id === electionId);
    if (!election) {
        election = { id: electionId, state: config.state, year, type: "State Legislative Assembly", candidateScope: "winners_archive", candidacies: [] };
        candidateData.elections.push(election);
    }
    const unusedExisting = new Set(election.candidacies);
    const personName = (candidacy) => peopleById.get(candidacy.candidateId)?.name || "";

    const seatKeys = new Set(seats.map((seat) => constituencyKey(seat.constituency)));
    const candidacies = [];
    let withAffidavit = 0;
    let withResult = 0;
    for (const seat of seats) {
        const { entry: winner } = bestSeatMatch([...generalRows], seat, (row) => row.constituency, (row) => row.name, seatKeys);
        let conflict = false;
        if (winner && !sameSeatWinnersMatch(winner.name, seat.winner)) {
            conflict = true;
            report.push(`${config.state} · ${seat.constituency}: MyNeta's 2022 affidavit record names ${winner.name} but Wikipedia's table names ${seat.winner}; kept the affidavit record and left out the Wikipedia result.`);
        }
        if (winner) generalRows.delete(winner);

        const { entry: existing } = bestSeatMatch([...unusedExisting], seat, (candidacy) => candidacy.constituency, personName, seatKeys);
        if (existing) unusedExisting.delete(existing);

        let candidacy = existing;
        if (!candidacy) {
            const name = winner?.name || seat.winner;
            const personId = createPerson(config, name, seat.constituency, conflict ? [] : [seat.winner], candidateData, peopleById);
            candidacy = winner
                ? newCandidacy(`${config.prefix}-${year}-winner-${winner.mynetaId}`, personId, seat.constituency, winner.party, "winner (as listed in the ADR/MyNeta archive)")
                : newCandidacy(`${config.prefix}-${year}-winner-ac-${seat.number}`, personId, seat.constituency, seat.party, "winner (as listed in Wikipedia's results table)");
            if (winner) addAffidavitSummary(candidacy, config, winner);
        }
        candidacy.verification = candidacy.verification || {};
        candidacy.profile = candidacy.profile || {};
        candidacy.sources = candidacy.sources || [];

        if (conflict) {
            candidacy.verification.name = {
                status: "unverified",
                note: `Wikipedia's ${year} results table lists ${seat.winner} for this seat, which conflicts with the ADR/MyNeta affidavit record; the vote result has been left out until checked against ECI records.`
            };
        } else if (!candidacy.result) {
            const source = wikipediaSource(config);
            candidacy.result = { votes: seat.votes, voteShare: seat.voteShare, margin: seat.margin, outcome: "won", source };
            candidacy.verification.electionResults = {
                status: "unverified",
                note: `Votes, vote share and margin over ${seat.runnerUp} (${seat.runnerUpParty}) are from Wikipedia's constituency table and have not yet been checked against ECI Form 20/21 records.`
            };
            if (!candidacy.profile.assets && !candidacy.sources.some((entry) => entry.url === source.url)) candidacy.sources.push(source);
        }
        if (candidacy.profile.assets) withAffidavit++;
        if (candidacy.result) withResult++;
        candidacies.push(candidacy);
    }
    for (const leftover of generalRows) {
        report.push(`${config.state} · MyNeta row ${leftover.name} (${leftover.constituency}) matched no Wikipedia seat; skipped.`);
    }
    if (unusedExisting.size) {
        // Never drop curated records silently; keep them and flag them for review.
        candidacies.push(...unusedExisting);
        unusedExisting.forEach((candidacy) => report.push(`${config.state} · existing record ${candidacy.id} (${candidacy.constituency}) matched no Wikipedia seat; kept unchanged.`));
    }
    const peopleIds = candidacies.map((candidacy) => candidacy.candidateId);
    const repeated = peopleIds.filter((id, index) => peopleIds.indexOf(id) !== index);
    if (repeated.length) throw new Error(`${config.state}: one person was matched to more than one seat (${repeated.join(", ")}).`);

    election.candidacies = candidacies;
    election.archiveCompleteness = "complete";
    election.archiveNote = `All ${config.seats} winners are listed. ${year} results (votes, vote share, margin) from Wikipedia's constituency table (secondary; compiled from ECI results) are included for ${withResult} of ${config.seats}; affidavit summaries from ADR/MyNeta are included for ${withAffidavit} of ${config.seats}; the rest are not published as plain rows in that table and have not been added. Every imported field is unverified until checked against ECI records.`;
    election.sources = [
        wikipediaSource(config),
        {
            label: `ADR/MyNeta ${config.state} ${year} winners table (secondary; based on ECI affidavit records)`,
            url: `https://www.myneta.info/${config.myneta}/index.php?action=show_winners&sort=default`,
            retrievedAt
        },
        { label: "ECI Candidate Affidavit Portal (search for original affidavit)", url: "https://affidavit.eci.gov.in/", retrievedAt }
    ];

    const byElections = importByElections(config, seats, byElectionRows, candidateData, peopleById);
    return { seats: seats.length, withAffidavit, withResult, byElections };
}

function importByElections(config, seats, rows, candidateData, peopleById) {
    const rowsByYear = new Map();
    rows.forEach((row) => {
        const rowYear = Number(row.byElectionDate.slice(0, 4));
        rowsByYear.set(rowYear, [...(rowsByYear.get(rowYear) || []), row]);
    });
    for (const [rowYear, yearRows] of rowsByYear) {
        const id = `${config.prefix}-${rowYear}-by-election-winners`;
        let election = candidateData.elections.find((entry) => entry.id === id);
        if (!election) {
            election = { id, state: config.state, year: rowYear, type: "State Legislative Assembly by-election", candidateScope: "winners_archive", candidacies: [] };
            candidateData.elections.push(election);
        }
        const existingIds = new Set(election.candidacies.map((candidacy) => candidacy.id));
        for (const row of yearRows) {
            const candidacyId = `${config.prefix}-${rowYear}-by-election-winner-${row.mynetaId}`;
            if (existingIds.has(candidacyId)) continue;
            const rowKey = constituencyKey(row.constituency);
            const ranked = seats
                .map((entry) => ({ entry, score: similarity(constituencyKey(entry.constituency), rowKey) }))
                .sort((first, second) => second.score - first.score);
            const seat = ranked[0] && ranked[0].score >= 0.55 && ranked[0].score > (ranked[1]?.score ?? 0) ? ranked[0].entry : undefined;
            const constituency = seat?.constituency || row.constituency;
            // A 2022 winner who resigned and won the seat again (often for another party) is
            // the same person, so the by-election record shares their identity.
            const general = candidateData.elections.find((entry) => entry.id === `${config.prefix}-${year}-assembly-winners`);
            const previous = general?.candidacies.find((candidacy) => constituencyKey(candidacy.constituency) === constituencyKey(constituency));
            const previousPerson = previous && peopleById.get(previous.candidateId);
            const personId = previousPerson && [previousPerson.name, ...(previousPerson.aliases || [])].some((name) => samePersonLater(name, row.name))
                ? previousPerson.id
                : createPerson(config, row.name, constituency, [], candidateData, peopleById);
            if (personId === previousPerson?.id && ![previousPerson.name, ...(previousPerson.aliases || [])].some((name) => sameFullName(name, row.name))) {
                previousPerson.aliases = [...(previousPerson.aliases || []), row.name];
            }
            const candidacy = newCandidacy(candidacyId, personId, constituency, row.party, `by-election winner, ${row.byElectionDate} (as listed in the ADR/MyNeta archive)`);
            addAffidavitSummary(candidacy, config, row);
            election.candidacies.push(candidacy);
        }
        election.archiveCompleteness = "partial";
        election.archiveNote = `By-election winners listed in the ADR/MyNeta ${config.state} ${year} winners table. Vote totals have not been imported, and this may not include every ${rowYear} by-election. Every imported field is unverified until checked against ECI records.`;
        election.sources = [
            {
                label: `ADR/MyNeta ${config.state} ${year} winners table, including later by-elections (secondary; based on ECI affidavit records)`,
                url: `https://www.myneta.info/${config.myneta}/index.php?action=show_winners&sort=default`,
                retrievedAt
            },
            { label: "ECI Candidate Affidavit Portal (search for original affidavit)", url: "https://affidavit.eci.gov.in/", retrievedAt }
        ];
    }
    return rows.length;
}

function linkIncumbents(config, candidateData, incumbentData, peopleById, report) {
    const snapshot = incumbentData.states[config.state];
    if (!snapshot) return 0;
    // Newest records first, so an MLA elected in a by-election links to that record.
    const stateCandidacies = candidateData.elections
        .filter((entry) => entry.state === config.state && entry.candidateScope === "winners_archive")
        .sort((first, second) => second.year - first.year)
        .flatMap((entry) => entry.candidacies);
    const namesFor = (candidacy) => {
        const person = peopleById.get(candidacy.candidateId);
        return person ? [person.name, ...(person.aliases || [])] : [];
    };

    let linked = 0;
    snapshot.members = snapshot.members.map((member) => {
        if (member.name === "Vacant") return member;
        if (member.personId) {
            linked++;
            return member;
        }
        const key = constituencyKey(member.constituency);
        const sameSeat = stateCandidacies
            .filter((candidacy) => constituenciesClose(candidacy.constituency, member.constituency))
            .sort((first, second) => Number(constituencyKey(second.constituency) === key) - Number(constituencyKey(first.constituency) === key));
        let match = sameSeat.find((candidacy) => namesFor(candidacy).some((name) => samePersonLater(name, member.name)));
        if (!match && !sameSeat.length) {
            // Constituency spelled differently: only an exact full-name match within the state is safe.
            const byName = stateCandidacies.filter((candidacy) => namesFor(candidacy).some((name) => sameFullName(name, member.name)));
            if (byName.length === 1) match = byName[0];
        }
        if (!match) {
            report.push(sameSeat.length
                ? `${config.state} · ${member.constituency}: sitting MLA ${member.name} matches no imported winner of the seat (${sameSeat.map((candidacy) => namesFor(candidacy)[0]).join(", ")}); not linked.`
                : `${config.state} · ${member.constituency}: no imported winner record for sitting MLA ${member.name}; not linked.`);
            return member;
        }
        const person = peopleById.get(match.candidateId);
        if (!namesFor(match).some((name) => sameFullName(name, member.name))) {
            report.push(`${config.state} · ${member.constituency}: linked "${member.name}" to "${person.name}" (${match.id}) on a close name match; check.`);
        }
        linked++;
        const { name, ...rest } = member;
        return { name, personId: person.id, ...rest };
    });
    return linked;
}

async function main() {
    const candidateData = JSON.parse(await readFile(candidatesPath, "utf8"));
    const incumbentData = JSON.parse(await readFile(incumbentsPath, "utf8"));
    const peopleById = new Map(candidateData.people.map((person) => [person.id, person]));
    const report = [];
    const only = process.argv.slice(2);

    for (const config of states.filter((entry) => !only.length || only.includes(entry.state))) {
        const { seats, withAffidavit, withResult, byElections } = await importState(config, candidateData, peopleById, report);
        const linked = linkIncumbents(config, candidateData, incumbentData, peopleById, report);
        console.log(`${config.state}: ${seats} winners, ${withResult} with results, ${withAffidavit} with affidavit summaries, ${byElections} by-election winners, ${linked} sitting MLAs linked.`);
    }

    await writeFile(candidatesPath, `${JSON.stringify(candidateData, null, 2)}\n`, "utf8");
    await writeFile(incumbentsPath, `${JSON.stringify(incumbentData, null, 2)}\n`, "utf8");
    if (report.length) console.log(`\nReview:\n${report.map((line) => `- ${line}`).join("\n")}`);
}

main().catch((error) => {
    console.error("Unable to import the winners archives:", error);
    process.exitCode = 1;
});
