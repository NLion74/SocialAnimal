import { ProviderHandler } from "./base";
import { GoogleHandler } from "./google";
import { CaldavHandler } from "./caldav";
import { IcloudHandler } from "./icloud";
import { IcsHandler } from "./ics";

const registry: Record<string, ProviderHandler> = {
    google: new GoogleHandler(),
    caldav: new CaldavHandler(),
    icloud: new IcloudHandler(),
    ics: new IcsHandler(),
};

export function getProviderHandler(type: string): ProviderHandler | undefined {
    return registry[type];
}
