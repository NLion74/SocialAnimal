import { Check, Loader2 } from "lucide-react";
import Modal from "./Modal";
import s from "./ServerCalendarSelect.module.css";

interface DiscoveredCalendar {
    url: string;
    displayName: string;
    color?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    loading: boolean;
    error: string;
    calendars: DiscoveredCalendar[];
    selectedUrls: string[];
    onToggle: (url: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onImport: () => void;
    importing: boolean;
    title?: string;
}

export default function ServerCalendarSelect({
    isOpen,
    onClose,
    loading,
    error,
    calendars,
    selectedUrls,
    onToggle,
    onSelectAll,
    onDeselectAll,
    onImport,
    importing,
    title = "Select Calendars",
}: Props) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            {loading ? (
                <div className={s.loading}>
                    <Loader2 size={32} className={s.spin} />
                    <span>Discovering calendars...</span>
                </div>
            ) : (
                <>
                    {error && <div className={s.error}>{error}</div>}
                    <div className={s.selectActions}>
                        <div className={s.selectInfo}>
                            {selectedUrls.length} of {calendars.length} selected
                        </div>
                        <div className={s.btnGroup}>
                            <button
                                className={s.btnLink}
                                onClick={onSelectAll}
                                disabled={calendars.length === 0}
                            >
                                Select All
                            </button>
                            <button
                                className={s.btnLink}
                                onClick={onDeselectAll}
                                disabled={selectedUrls.length === 0}
                            >
                                Deselect All
                            </button>
                        </div>
                    </div>
                    {calendars.length === 0 ? (
                        <div className={s.empty}>No calendars found</div>
                    ) : (
                        <div className={s.calendarList}>
                            {calendars.map((cal) => {
                                const isSelected = selectedUrls.includes(
                                    cal.url,
                                );
                                return (
                                    <div
                                        key={cal.url}
                                        className={`${s.calendarRow} ${isSelected ? s.selected : ""}`}
                                        onClick={() => onToggle(cal.url)}
                                    >
                                        <div className={s.checkbox}>
                                            {isSelected && <Check size={16} />}
                                        </div>
                                        <div className={s.calendarInfo}>
                                            <div className={s.calendarName}>
                                                {cal.color && (
                                                    <span
                                                        className={s.colorDot}
                                                        style={{
                                                            background:
                                                                cal.color,
                                                        }}
                                                    />
                                                )}
                                                {cal.displayName}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className={s.formRow}>
                        <button
                            className={s.btnSecondary}
                            onClick={onClose}
                            disabled={importing}
                        >
                            Cancel
                        </button>
                        <button
                            className={s.btnPrimary}
                            style={{ flex: 1 }}
                            onClick={onImport}
                            disabled={importing || selectedUrls.length === 0}
                        >
                            {importing ? (
                                <>
                                    <Loader2 size={16} className={s.spin} />
                                    Importing...
                                </>
                            ) : (
                                `Import ${selectedUrls.length} Calendar${selectedUrls.length !== 1 ? "s" : ""}`
                            )}
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}
