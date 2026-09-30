import { obj, str, bool, nullableString, date } from "../../core/http";

export const userSchema = obj(
	{
		id: str,
		email: str,
		name: nullableString,
		isAdmin: bool,
		createdAt: date,
	},
	["id", "email", "name", "isAdmin"],
);

export const password = { type: "string", minLength: 8, maxLength: 72 };

export const login = obj({
	email: { type: "string", format: "email", maxLength: 254 },
	password: { type: "string", minLength: 1, maxLength: 72 },
});

export const registration = obj(
	{
		...login.properties,
		password,
		name: { type: "string", maxLength: 100 },
		inviteCode: str,
	},
	["email", "password"],
);
