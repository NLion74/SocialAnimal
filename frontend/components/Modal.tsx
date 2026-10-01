"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import s from "./Modal.module.css";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
}

export default function Modal({
	isOpen,
	onClose,
	title,
	children,
	footer,
}: ModalProps) {
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();

	useEffect(() => {
		if (!isOpen) return;
		const element = dialog.current;
		const previous = document.activeElement as HTMLElement | null;
		const overflow = document.body.style.overflow;
		element?.showModal();
		document.body.style.overflow = "hidden";

		return () => {
			element?.close();
			document.body.style.overflow = overflow;
			previous?.focus();
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<dialog
			ref={dialog}
			className={s.overlay}
			aria-labelledby={titleId}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onClick={onClose}
		>
			<div className={s.modal} onClick={(e) => e.stopPropagation()}>
				<div className={s.header}>
					<h2 id={titleId}>{title}</h2>
					<button
						type="button"
						aria-label="Close dialog"
						onClick={onClose}
						className={s.close}
					>
						<X size={20} />
					</button>
				</div>
				<div className={s.body}>{children}</div>
				{footer && <div className={s.footer}>{footer}</div>}
			</div>
		</dialog>
	);
}
