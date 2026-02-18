"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const db_1 = require("./db");
const env_1 = require("./config/env");
const users_1 = __importDefault(require("./routes/users"));
const calendars_1 = __importDefault(require("./routes/calendars"));
const events_1 = __importDefault(require("./routes/events"));
const friends_1 = __importDefault(require("./routes/friends"));
const ics_1 = __importDefault(require("./routes/ics"));
const server = (0, fastify_1.default)({
    logger: true,
});
async function start() {
    try {
        await server.register(cors_1.default);
        await server.register(jwt_1.default, {
            secret: env_1.env.JWT_SECRET,
        });
        server.register(users_1.default, { prefix: "/api/users" });
        server.register(calendars_1.default, { prefix: "/api/calendars" });
        server.register(events_1.default, { prefix: "/api/events" });
        server.register(friends_1.default, { prefix: "/api/friends" });
        server.register(ics_1.default, { prefix: "/api/ics" });
        const address = await server.listen({
            port: env_1.env.PORT,
            host: "0.0.0.0",
        });
        console.log(`SocialAnimal server listening on ${address}`);
    }
    catch (err) {
        server.log.error(err);
        await (0, db_1.disconnectDb)();
        process.exit(1);
    }
}
// Graceful shutdown
process.on("SIGTERM", async () => {
    await (0, db_1.disconnectDb)();
    await server.close();
});
process.on("SIGINT", async () => {
    await (0, db_1.disconnectDb)();
    await server.close();
});
start();
