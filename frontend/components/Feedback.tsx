"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import s from "./Feedback.module.css";

export default function Feedback({
	tone = "error",
	title,
	children,
	focusOnMount = false,
}: {
	tone?: "error" | "success" | "info";
	title?: string;
	children?: ReactNode;
	focusOnMount?: boolean;
}) {
	const element = useRef<HTMLDivElement>(null);

	const Icon =
		tone === "error"
			? CircleAlert
			: tone === "success"
				? CircleCheck
				: Info;

	useEffect(() => {
		if (!focusOnMount) return;
		element.current?.focus({ preventScroll: true });
		element.current?.scrollIntoView?.({ block: "nearest" });
	}, [focusOnMount, title]);

	return (
		<div
			ref={element}
			className={`${s.feedback} ${s[tone]}`}
			role={tone === "error" ? "alert" : "status"}
			aria-atomic="true"
			tabIndex={focusOnMount ? -1 : undefined}
		>
			<Icon size={20} className={s.icon} aria-hidden="true" />
			<div className={s.content}>
				{title && <strong className={s.title}>{title}</strong>}
				{children && <div className={s.message}>{children}</div>}
			</div>
		</div>
	);
}
