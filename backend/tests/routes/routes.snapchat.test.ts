import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers/app";

describe("Routes snapshot", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = await createTestApp();
    });

    afterAll(async () => {
        await app.close();
    });

    it("prints the same route tree", async () => {
        const tree = app.printRoutes();
        expect(tree).toMatchSnapshot();
    });
});
