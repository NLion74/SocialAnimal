import { handleProviderExport } from "../../services/providerService";
import { authenticateToken } from "../../utils/auth";
export default function exportRoutes(fastify: any) {
    fastify.get(
        "/:calendarId",
        { preHandler: authenticateToken },
        async (request: any, reply: any) => {
            const type = request.params.type;
            const { calendarId } = request.params;
            const mode = request.query?.type;
            const queryToken = request.query?.token;
            const authHeader = request.headers.authorization;
            const bearerToken = authHeader?.startsWith("Bearer ")
                ? authHeader.substring(7)
                : undefined;

            const result = await handleProviderExport(type, {
                calendarId,
                type: mode === "link" ? "link" : undefined,
                subscription: mode !== "link",
                token: queryToken || bearerToken,
                userId: request.user.id,
            });
            if (result?.error)
                return reply.status(404).send({
                    error: "Provider not found or export not supported",
                });
            if (result?.mimeType) {
                reply.type(result.mimeType);
            }
            reply.send(result?.body ?? result);
        },
    );
}
