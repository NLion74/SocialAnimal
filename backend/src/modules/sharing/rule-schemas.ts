import {
	obj,
	str,
	integer,
	array,
	date,
	nullableString,
} from "../../core/http";
import { visibilities } from "../../services/permissions";

export const visibilitySchema = { type: "string", enum: [...visibilities] };

const ref = { $ref: "PermissionCondition#" };

export const conditionSchema = {
	$id: "PermissionCondition",
	anyOf: [
		obj({
			attribute: str,
			operator: str,
			value: {
				anyOf: [
					str,
					{ type: "number" },
					{
						type: "array",
						minItems: 2,
						maxItems: 2,
						items: { anyOf: [str, { type: "number" }] },
					},
				],
			},
		}),
		obj({ all: { ...array(ref), minItems: 1, maxItems: 16 } }),
		obj({ any: { ...array(ref), minItems: 1, maxItems: 16 } }),
		obj({ not: ref }),
	],
};

export const rulesetFields = {
	name: { type: "string", minLength: 1, maxLength: 80 },
	fallback: visibilitySchema,
	rules: {
		...array(obj({ when: ref, visibility: visibilitySchema })),
		maxItems: 32,
	},
};

export const rulesetSchema = obj({
	id: str,
	...rulesetFields,
	version: integer,
	seedKey: nullableString,
	updatedAt: date,
});

export const previewEventSchema = obj({
	explanation: obj({
		visibility: visibilitySchema,
		ruleIndex: { type: ["integer", "null"] },
		reason: str,
		timezone: str,
		matchedAt: nullableString,
		conditions: array(obj({ path: str, label: str, result: str })),
	}),
	id: str,
	title: str,
	description: nullableString,
	location: nullableString,
	startTime: date,
	endTime: date,
	allDay: { type: "boolean" },
	visibility: visibilitySchema,
});
