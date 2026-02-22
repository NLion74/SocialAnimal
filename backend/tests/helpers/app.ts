import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";

export async function createTestApp(): Promise<FastifyInstance> {
    return await buildApp();
}
