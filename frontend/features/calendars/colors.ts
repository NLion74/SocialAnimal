import type { CSSProperties } from "react";

export const colors = {
	blue: { label: "Blue", ink: "#93c5fd", fill: "#172b46", edge: "#60a5fa" },
	green: { label: "Green", ink: "#86efac", fill: "#173527", edge: "#4ade80" },
	teal: { label: "Teal", ink: "#5eead4", fill: "#123631", edge: "#2dd4bf" },
	amber: { label: "Amber", ink: "#fde68a", fill: "#39301b", edge: "#fbbf24" },
	rose: { label: "Rose", ink: "#fda4af", fill: "#3c202c", edge: "#fb7185" },
	violet: {
		label: "Violet",
		ink: "#d8b4fe",
		fill: "#302342",
		edge: "#c084fc",
	},
	slate: { label: "Slate", ink: "#cbd5e1", fill: "#27313e", edge: "#94a3b8" },
} as const;

export function calendarStyle(color?: string): CSSProperties {
	const value = colors[color as keyof typeof colors] || colors.blue;
	return {
		"--calendar-ink": value.ink,
		"--calendar-fill": value.fill,
		"--calendar-edge": value.edge,
	} as CSSProperties;
}
