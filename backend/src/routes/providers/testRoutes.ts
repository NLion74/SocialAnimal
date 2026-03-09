import { handleProviderTest } from "../../services/providerService";
import { authenticateToken } from "../../utils/auth";
export default function testRoutes(fastify: any) {
    fastify.post(
        "/",
        { preHandler: authenticateToken },
        async (request: any, reply: any) => {
            const type = request.params.type;
            const result = await handleProviderTest(type, request.body);
            if (result?.error === "Provider not found or test not supported")
                return reply.status(404).send({
                    error: "Provider not found or test not supported",
                });
            reply.send(result);
        },
    );
}
