import { cpSync } from "node:fs";
import { spawn } from "node:child_process";

const dist = process.env.NEXT_DIST_DIR || ".next-e2e";
cpSync(`${dist}/static`, `${dist}/standalone/${dist}/static`, {
	recursive: true,
});
cpSync("public", `${dist}/standalone/public`, { recursive: true });

const server = spawn(process.execPath, [`${dist}/standalone/server.js`], {
	stdio: "inherit",
	env: { ...process.env, PORT: "3300", HOSTNAME: "127.0.0.1" },
});
for (const signal of ["SIGINT", "SIGTERM"])
	process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
