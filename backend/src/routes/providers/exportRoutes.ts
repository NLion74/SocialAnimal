import { handleProviderExport } from "../../services/providerService";
import { verifyToken } from "../../utils/auth";

export default function exportRoutes(fastify: any) {
    fastify.get("/:calendarId", async (request: any, reply: any) => {
        const type = request.params.type;
        const { calendarId } = request.params;
        const mode = request.query?.type;
        const queryToken = request.query?.token;
        const authHeader = request.headers.authorization;
        const bearerToken = authHeader?.startsWith("Bearer ")
            ? authHeader.substring(7)
            : undefined;

        let userId: string | undefined;
        if (bearerToken) {
            try {
                userId = verifyToken(bearerToken).sub;
            } catch {
                userId = undefined;
            }
        }

        const result = await handleProviderExport(type, {
            calendarId,
            type: mode === "link" ? "link" : undefined,
            subscription: mode !== "link",
            token: queryToken || bearerToken,
            userId,
        });
        if (result?.error)
            return reply.status(404).send({
                error: "Provider not found or export not supported",
            });
        if (result?.mimeType) {
            reply.type(result.mimeType);
        }
        reply.send(result?.body ?? result);
    });
}
