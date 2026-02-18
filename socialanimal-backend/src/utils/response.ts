export const ok = (data: unknown) => data;
export const created = (reply: any, data: unknown) =>
    reply.status(201).send(data);
export const notFound = (reply: any, msg = "Not found") =>
    reply.status(404).send({ error: msg });
export const forbidden = (reply: any, msg = "Forbidden") =>
    reply.status(403).send({ error: msg });
export const badRequest = (reply: any, msg: string) =>
    reply.status(400).send({ error: msg });
export const serverError = (reply: any, msg = "Internal server error") =>
    reply.status(500).send({ error: msg });
