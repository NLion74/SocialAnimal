"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../auth");
const usersRoutes = async (fastify) => {
    fastify.post("/register", async (request, reply) => {
        try {
            const { email, password, name } = request.body;
            if (!email || !password) {
                return reply
                    .status(400)
                    .send({ error: "Email and password required" });
            }
            const user = await (0, auth_1.register)({ email, password, name });
            return reply.status(201).send(user);
        }
        catch (error) {
            if (error instanceof Error) {
                return reply.status(400).send({ error: error.message });
            }
            return reply.status(500).send({ error: "Internal server error" });
        }
    });
    fastify.post("/login", async (request, reply) => {
        try {
            const { email, password } = request.body;
            if (!email || !password) {
                return reply
                    .status(400)
                    .send({ error: "Email and password required" });
            }
            const result = await (0, auth_1.login)({ email, password });
            return reply.send(result);
        }
        catch (error) {
            if (error instanceof Error) {
                return reply.status(401).send({ error: error.message });
            }
            return reply.status(500).send({ error: "Internal server error" });
        }
    });
    fastify.get("/me", { preHandler: auth_1.authenticateToken }, async (request, reply) => {
        return request.user;
    });
};
exports.default = usersRoutes;
