import type { FastifyPluginAsync } from "fastify";
import { obj, str, contract } from "../../core/http";
import { userSchema, login, registration } from "./schemas";
import { registerUser, loginUser } from "./operations";

const routes: FastifyPluginAsync = async (app) => {
	app.post<{
		Body: {
			email: string;
			password: string;
			name?: string;
			inviteCode?: string;
		};
	}>(
		"/auth/registrations",
		{
			schema: contract(
				"register",
				userSchema,
				{ body: registration },
				201,
			),
		},
		async (req, reply) =>
			reply.code(201).send(await registerUser(req.body)),
	);

	app.post<{ Body: { email: string; password: string } }>(
		"/auth/sessions",
		{
			schema: contract("login", obj({ token: str, user: userSchema }), {
				body: login,
			}),
		},
		(req) => loginUser(req.body.email, req.body.password),
	);
};

export default routes;
