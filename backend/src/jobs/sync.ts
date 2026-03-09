import { runDueCalendars } from "../services/providerService";

export async function runSyncJob() {
    await runDueCalendars();
}

export { runDueCalendars };
