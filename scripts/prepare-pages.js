const { cp, mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

async function main() {
    const projectRoot = path.join(__dirname, "..");
    const outputDirectory = process.env.PAGES_OUTPUT_DIR || path.join(projectRoot, "_site");
    const feedPath = path.join(projectRoot, "data", "elections.json");
    const feed = JSON.parse(await readFile(feedPath, "utf8"));

    if (
        typeof feed.lastChecked !== "string" ||
        Number.isNaN(Date.parse(feed.lastChecked)) ||
        !Array.isArray(feed.announcements)
    ) {
        throw new Error("The saved ECI feed is invalid; refusing to deploy it.");
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
        writeFile(path.join(dataDirectory, "elections.json"), `${JSON.stringify(pageFeed, null, 2)}\n`, "utf8")
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
