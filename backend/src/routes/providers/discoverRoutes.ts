import { handleProviderDiscover } from "../../services/discoverService";
export default function discoverRoutes(fastify: any) {
    fastify.get("/", async (request: any, reply: any) => {
        const type = request.params.type;
        const result = await handleProviderDiscover(type, request.query);
        if (result?.error)
            return reply.status(404).send({
                error: "Provider not found or discover not supported",
            });
        reply.send(result);
    });

    fastify.post("/", async (request: any, reply: any) => {
        const type = request.params.type;
        const result = await handleProviderDiscover(type, request.body);
        if (result?.error)
            return reply.status(404).send({
                error: "Provider not found or discover not supported",
            });
        reply.send(result);
    });
}
