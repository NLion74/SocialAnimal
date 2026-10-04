import type { Condition } from "./api";

export function conditionSize(condition: Condition): {
	nodes: number;
	depth: number;
} {
	if ("attribute" in condition) return { nodes: 1, depth: 1 };

	const children =
		"not" in condition
			? [condition.not]
			: "all" in condition
				? condition.all
				: condition.any;

	const sizes = children.map(conditionSize);

	return {
		nodes: 1 + sizes.reduce((sum, value) => sum + value.nodes, 0),
		depth: 1 + Math.max(0, ...sizes.map((value) => value.depth)),
	};
}

export function describeCondition(
	condition: Condition,
	attributes: Array<{ id: string; label: string }>,
	operators: Record<string, string>,
): string {
	if ("not" in condition)
		return `NOT (${describeCondition(condition.not, attributes, operators)})`;

	if ("all" in condition || "any" in condition) {
		const children = "all" in condition ? condition.all : condition.any;
		return `(${children.map((child) => describeCondition(child, attributes, operators)).join("all" in condition ? " AND " : " OR ")})`;
	}

	return `${attributes.find((attribute) => attribute.id === condition.attribute)?.label || condition.attribute} ${operators[condition.operator] || condition.operator} ${Array.isArray(condition.value) ? condition.value.join(" to ") : JSON.stringify(condition.value)}`;
}
