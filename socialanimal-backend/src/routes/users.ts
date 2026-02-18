import { FastifyPluginAsync } from "fastify";
import { register, login, authenticateToken } from "../utils/auth";

const usersRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post("/register", async (request, reply) => {
        try {
            const { email, password, name } = request.body as any;

            if (!email || !password) {
                return reply
                    .status(400)
                    .send({ error: "Email and password required" });
            }

            const user = await register({ email, password, name });
            return reply.status(201).send(user);
        } catch (error) {
            if (error instanceof Error) {
                return reply.status(400).send({ error: error.message });
            }
            return reply.status(500).send({ error: "Internal server error" });
        }
    });

    fastify.post("/login", async (request, reply) => {
        try {
            const { email, password } = request.body as any;

            if (!email || !password) {
                return reply
                    .status(400)
                    .send({ error: "Email and password required" });
            }

            const result = await login({ email, password });
            return reply.send(result);
        } catch (error) {
            if (error instanceof Error) {
                return reply.status(401).send({ error: error.message });
            }
            return reply.status(500).send({ error: "Internal server error" });
        }
    });

    fastify.get(
        "/me",
        { preHandler: authenticateToken },
        async (request, reply) => {
            return (request as any).user;
        },
    );
};

export default usersRoutes;
