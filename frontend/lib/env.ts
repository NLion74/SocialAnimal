export interface RuntimeEnv {
    API_URL: string;
    ICS_BASE_URL: string;
}

export let env: RuntimeEnv = {
    API_URL: "",
    ICS_BASE_URL: "http://localhost:3000",
};

(async () => {
    try {
        const res = await fetch("/config");
        env = await res.json();
    } catch (err) {
        console.warn("Failed to load runtime env, using defaults", err);
    }
})();
