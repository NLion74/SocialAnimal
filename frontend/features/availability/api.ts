import { findTime, type findTimeInput } from "../../lib/generated/client";

export const availabilityApi = {
	search: (body: findTimeInput["body"]) => findTime({ body }),
};
