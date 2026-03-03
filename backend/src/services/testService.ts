import type { Calendar } from "@prisma/client";
import type { TestResult } from "../types";
import { getProviderHandler } from "../handlers/registry";

export async function handleProviderTest(type: string, credentials: any) {
    const handler = getProviderHandler(type);
    if (!handler?.test) {
        return { error: "Provider not found or test not supported" };
    }
    return handler.test(credentials);
}

export async function testCalendarConnection(
    calendar: Partial<Calendar> & { type?: string; config?: any },
    type: string = calendar.type!,
): Promise<TestResult> {
    const handler = getProviderHandler(type);
    if (!handler?.test) {
        return { success: false, error: `No test for type: ${type}` };
    }
    return handler.test(calendar.config);
}
