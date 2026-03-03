import { getProviderHandler } from "../handlers/registry";

export async function handleProviderExport(type: string, params: any) {
    const handler = getProviderHandler(type);
    if (!handler?.export)
        return { error: "Provider not found or export not supported" };
    return await handler.export(params);
}
