const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { getAnnouncements } = require("../eci-feed");

async function main() {
    const feed = await getAnnouncements(true);
    const feedPath = path.join(__dirname, "..", "data", "elections.json");
    await mkdir(path.dirname(feedPath), { recursive: true });
    await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
    console.log(`Saved ${feed.announcements.length} ECI notices to ${feedPath}.`);
}

main().catch((error) => {
    console.error("Unable to update the ECI feed:", error);
    process.exitCode = 1;
});
