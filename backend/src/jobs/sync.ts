import { runDueCalendars } from "../services/syncService";

export async function runSyncJob() {
    await runDueCalendars();
}

export { runDueCalendars };
