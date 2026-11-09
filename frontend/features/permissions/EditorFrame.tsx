"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Modal from "../../components/Modal";
import s from "./Permissions.module.css";

export default function EditorFrame({
	embedded,
	active = true,
	title,
	onClose,
	children,
	footer,
	actions,
}: {
	embedded?: boolean;
	active?: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	actions?: ReactNode;
}) {
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		if (embedded && active) heading.current?.focus({ preventScroll: true });
	}, [embedded, title, active]);

	if (!embedded)
		return (
			<Modal
				isOpen
				size="wide"
				title={title}
				onClose={onClose}
				footer={footer}
			>
				{children}
			</Modal>
		);

	return (
		<section className={s.focusedPanel} aria-label={title}>
			<header className={s.panelHeader}>
				<button
					type="button"
					className={s.textButton}
					onClick={onClose}
				>
					← Back
				</button>
				<div className={s.panelIdentity}>
					<h2 ref={heading} tabIndex={-1}>
						{title}
					</h2>
					{actions}
				</div>
			</header>
			{children}
			{footer && <footer className={s.panelFooter}>{footer}</footer>}
		</section>
	);
}
