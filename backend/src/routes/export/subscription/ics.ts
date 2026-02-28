import { FastifyPluginAsync } from "fastify";
import { IcsExporter } from "../../../exports/subscription/ics";
import { registerSubscriptionRoutes } from "./base";

const exporter = new IcsExporter();

const icsSubscriptionRoutes: FastifyPluginAsync = async (fastify) => {
    registerSubscriptionRoutes(fastify, exporter);
};

export default icsSubscriptionRoutes;
