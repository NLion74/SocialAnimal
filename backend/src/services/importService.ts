import { getProviderHandler } from "../handlers/registry";

export async function handleProviderImport(type: string, data: any) {
    const handler = getProviderHandler(type);
    if (!handler?.import) {
        return { error: "Provider not found or import not supported" };
    }
    return handler.import(data);
}

export async function handleProviderAuthUrl(type: string, params?: any) {
    const handler = getProviderHandler(type);
    if (!handler?.getAuthUrl) {
        return { error: "Provider not found or auth url not supported" };
    }
    const url = await handler.getAuthUrl(params);
    return typeof url === "string" ? { url } : url;
}
