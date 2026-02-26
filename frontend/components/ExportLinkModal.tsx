import { Copy, Check } from "lucide-react";
import Modal from "./Modal";
import s from "./ExportLinkModal.module.css";

interface ExportLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    link: string;
    copied: boolean;
    onCopy: () => void;
}

export default function ExportLinkModal({
    isOpen,
    onClose,
    link,
    copied,
    onCopy,
}: ExportLinkModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="ICS Subscription Link">
            <div className={s.linkRow}>
                <input readOnly className={s.linkInput} value={link} />
                <button className={s.btnIcon} onClick={onCopy}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
            </div>
            {copied && <div className={s.copiedMsg}>Copied to clipboard</div>}
        </Modal>
    );
}
