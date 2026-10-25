const crypto = require("node:crypto");

const cacheDuration = 10 * 60 * 1000;
const sourceUrl = "https://www.eci.gov.in/eci-backend/public/api/get-event";
const eciKey = Buffer.from("4WS8851W824R456Y", "utf8");
let cachedFeed;
let pendingRefresh;

function encryptQueryValue(value) {
    const cipher = crypto.createCipheriv("aes-128-ecb", eciKey, null);
    return Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64");
}

function stripMarkup(value) {
    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeAnnouncement(item) {
    const title = stripMarkup(item.document_title);
    const description = stripMarkup(item.document_description);
    const publishedAt = stripMarkup(item.date_of_creation);
    const attachment = Array.isArray(item.document_attachments) ? item.document_attachments[0] : null;
    const rawUrl = attachment && attachment.record_location;
    let url = "";

    if (typeof rawUrl === "string") {
        try {
            const parsedUrl = new URL(rawUrl);
            if (
                parsedUrl.protocol === "https:" &&
                parsedUrl.hostname === "www.eci.gov.in" &&
                parsedUrl.pathname === "/eci/public/api/download"
            ) {
                url = parsedUrl.href;
            }
        } catch (error) {
            console.warn(`Ignoring an invalid ECI notice URL: ${error.message}`);
        }
    }

    return { title, description, publishedAt, url };
}

async function fetchAnnouncements() {
    const query = new URLSearchParams({
        categories: encryptQueryValue("10"),
        limit: encryptQueryValue("100")
    });
    const response = await fetch(`${sourceUrl}?${query}`, {
        headers: {
            Accept: "application/json",
            "User-Agent": "TheBallotGrid/1.0 (Election calendar)"
        },
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw new Error(`Election Commission returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const records = payload.results && payload.results.data;
    if (payload.success !== true || !Array.isArray(records)) {
        throw new Error("Election Commission returned an unexpected announcements response.");
    }

    const announcements = records
        .map(normalizeAnnouncement)
        .filter((item) => /\b(election|assembly|poll|polling|constituency|schedule)\b/i.test(`${item.title} ${item.description}`));

    cachedFeed = {
        lastChecked: new Date().toISOString(),
        announcements
    };
    return cachedFeed;
}

async function getAnnouncements(forceRefresh = false) {
    if (!forceRefresh && cachedFeed && Date.now() - Date.parse(cachedFeed.lastChecked) < cacheDuration) {
        return cachedFeed;
    }

    if (!pendingRefresh) {
        pendingRefresh = fetchAnnouncements().finally(() => {
            pendingRefresh = undefined;
        });
    }

    try {
        return await pendingRefresh;
    } catch (error) {
        if (cachedFeed) {
            return {
                ...cachedFeed,
                stale: true,
                warning: error.message
            };
        }
        throw error;
    }
}

module.exports = { getAnnouncements };
