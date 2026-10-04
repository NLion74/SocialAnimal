import { describe, expect, it } from "vitest";
import {
	conditionSize,
	describeCondition,
} from "../features/permissions/conditions";
import type { Condition } from "../features/permissions/api";

const leaf: Condition = {
	attribute: "calendar.name",
	operator: "equals",
	value: "Work",
};

describe("Nested rule presentation", () => {
	it("counts the whole subtree and presents each boolean operator with parentheses", () => {
		const condition: Condition = {
			all: [leaf, { not: { any: [leaf, leaf] } }],
		};

		expect(conditionSize(condition)).toEqual({ nodes: 6, depth: 4 });

		expect(
			describeCondition(
				condition,
				[{ id: "calendar.name", label: "Calendar name" }],
				{ equals: "is exactly" },
			),
		).toBe(
			'(Calendar name is exactly "Work" AND NOT ((Calendar name is exactly "Work" OR Calendar name is exactly "Work")))',
		);
	});
});
