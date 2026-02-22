export type DiscoveredRoute = {
    url: string;
    methods: string[];
};

function normalizeUrl(url: string): string {
    return url
        .replace(/:([A-Za-z0-9_]+)/g, "1")
        .replace(/\*/g, "x")
        .replace(/\/+/g, "/");
}

export function discoverRoutesFromPrintRoutes(
    printRoutes: string,
): DiscoveredRoute[] {
    const lines = printRoutes
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const routes: DiscoveredRoute[] = [];

    for (const line of lines) {
        const m = line.match(/(\/\S*)\s*\(([^)]+)\)/);
        if (!m) continue;

        const url = normalizeUrl(m[1]);
        const methods = m[2]
            .split(",")
            .map((x) => x.trim().toUpperCase())
            .filter((x) => x.length > 0);

        routes.push({ url, methods });
    }

    const deduped = new Map<string, DiscoveredRoute>();
    for (const r of routes) {
        const key = `${r.url}::${r.methods.sort().join(",")}`;
        if (!deduped.has(key)) deduped.set(key, r);
    }

    return Array.from(deduped.values());
}
