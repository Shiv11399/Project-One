const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8000);

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

    if ((request.method === "GET" || request.method === "HEAD") && requestUrl.pathname === "/data/elections.json") {
        try {
            const feed = await readFile(path.join(__dirname, "data", "elections.json"));
            response.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff"
            });
            response.end(request.method === "HEAD" ? undefined : feed);
        } catch (error) {
            console.error("Unable to read the published ECI feed:", error);
            response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Unable to load the ECI feed. Run npm run update-feed first." }));
        }
        return;
    }

    if ((request.method === "GET" || request.method === "HEAD") && ["/", "/index.html"].includes(requestUrl.pathname)) {
        try {
            const page = await readFile(path.join(__dirname, "index.html"));
            response.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff"
            });
            response.end(request.method === "HEAD" ? undefined : page);
        } catch (error) {
            console.error("Unable to serve the election calendar page:", error);
            response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Unable to load the election calendar page.");
        }
        return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
});

server.listen(port, host, () => {
    console.log(`The Ballot Grid is running at http://${host}:${port}`);
});

server.on("error", (error) => {
    console.error("The Ballot Grid server failed to start:", error);
    process.exitCode = 1;
});
