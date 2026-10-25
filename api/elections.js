const { getAnnouncements } = require("../eci-feed");

module.exports = async function elections(request, response) {
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: "Only GET requests are supported." });
        return;
    }

    try {
        const data = await getAnnouncements(request.query.refresh === "1");
        response.setHeader("Cache-Control", "no-store");
        response.status(200).json(data);
    } catch (error) {
        console.error("Unable to retrieve Election Commission announcements:", error);
        response.status(502).json({
            error: `Could not retrieve official ECI announcements. ${error.message}`
        });
    }
};
