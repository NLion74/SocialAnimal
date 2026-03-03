import { getProviderHandler } from "../handlers/registry";

export async function handleProviderDiscover(type: string, params: any) {
    const handler = getProviderHandler(type);
    if (!handler?.discover)
        return { error: "Provider not found or discover not supported" };
    return await handler.discover(params);
}
