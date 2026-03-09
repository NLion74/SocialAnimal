import { handleProviderImport } from "../../services/providerService";
import { authenticateToken } from "../../utils/auth";
export default function importRoutes(fastify: any) {
    fastify.post(
        "/",
        { preHandler: authenticateToken },
        async (request: any, reply: any) => {
            const type = request.params.type;
            const result = await handleProviderImport(type, {
                ...(request.body || {}),
                userId: request.user.id,
            });
            if (result?.error)
                return reply.status(404).send({
                    error: "Provider not found or import not supported",
                });
            reply.send(result);
        },
    );
}
