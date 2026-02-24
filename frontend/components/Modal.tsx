"use client";

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
    if (!isOpen) return null;

    return (
        <div className={s.overlay} onClick={onClose}>
            <div className={s.modal} onClick={(e) => e.stopPropagation()}>
                <div className={s.header}>
                    <h2>{title}</h2>
                    <button onClick={onClose} className={s.close}>
                        <X size={20} />
                    </button>
                </div>
                <div className={s.body}>{children}</div>
                {footer && <div className={s.footer}>{footer}</div>}
            </div>
        </div>
    );
}
