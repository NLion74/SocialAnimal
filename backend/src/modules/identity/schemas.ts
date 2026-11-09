import { obj, str, bool, nullableString, date } from "../../core/http";

export const userSchema = obj(
	{
		id: str,
		email: str,
		name: nullableString,
		isAdmin: bool,
		accountRole: {
			type: "string",
			enum: ["admin", "moderator", "normal", "readonly"],
		},
		emailVerifiedAt: nullableString,
		createdAt: date,
	},
	["id", "email", "name", "isAdmin"],
);

export const password = { type: "string", minLength: 8, maxLength: 128 };

export const login = obj(
	{
		recovery: bool,
		email: { type: "string", format: "email", maxLength: 254 },
		password: { type: "string", minLength: 1, maxLength: 128 },
	},
	["email", "password"],
);

export const registration = obj(
	{
		email: login.properties.email,
		password,
		name: { type: "string", maxLength: 100 },
		inviteCode: str,
	},
	["email", "password"],
);
