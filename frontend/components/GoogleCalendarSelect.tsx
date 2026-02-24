import { Check, Loader2 } from "lucide-react";
import Modal from "./Modal";
import s from "./GoogleCalendarSelect.module.css";

interface GoogleCalendar {
    id: string;
    summary: string;
}

interface GoogleCalendarSelectProps {
    isOpen: boolean;
    onClose: () => void;
    loading: boolean;
    error: string;
    calendars: GoogleCalendar[];
    importedIds: string[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onImport: () => void;
    importing: boolean;
}

export default function GoogleCalendarSelect({
    isOpen,
    onClose,
    loading,
    error,
    calendars,
    importedIds,
    selectedIds,
    onToggle,
    onSelectAll,
    onDeselectAll,
    onImport,
    importing,
}: GoogleCalendarSelectProps) {
    const availableCount = calendars.filter(
        (cal) => !importedIds.includes(cal.id),
    ).length;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Select Google Calendars"
        >
            {loading ? (
                <div className={s.loading}>
                    <Loader2 size={32} className={s.spin} />
                    <span>Loading calendars...</span>
                </div>
            ) : (
                <>
                    {error && <div className={s.error}>{error}</div>}
                    <div className={s.googleSelectActions}>
                        <div className={s.googleSelectInfo}>
                            {selectedIds.length} of {availableCount} selected
                        </div>
                        <div className={s.btnGroup}>
                            <button
                                className={s.btnLink}
                                onClick={onSelectAll}
                                disabled={availableCount === 0}
                            >
                                Select All
                            </button>
                            <button
                                className={s.btnLink}
                                onClick={onDeselectAll}
                                disabled={selectedIds.length === 0}
                            >
                                Deselect All
                            </button>
                        </div>
                    </div>
                    {calendars.length === 0 ? (
                        <div className={s.empty}>No calendars found</div>
                    ) : (
                        <div className={s.googleCalendarList}>
                            {calendars.map((cal) => {
                                const isImported = importedIds.includes(cal.id);
                                const isSelected = selectedIds.includes(cal.id);
                                return (
                                    <div
                                        key={cal.id}
                                        className={`${s.googleCalendarRow} ${isImported ? s.imported : ""} ${isSelected ? s.selected : ""}`}
                                        onClick={() => onToggle(cal.id)}
                                    >
                                        <div className={s.checkbox}>
                                            {isSelected && <Check size={16} />}
                                        </div>
                                        <div className={s.calendarInfo}>
                                            <div className={s.calendarName}>
                                                {cal.summary}
                                            </div>
                                            {isImported && (
                                                <div
                                                    className={s.importedBadge}
                                                >
                                                    Already imported
                                                </div>
                                            )}
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
                            disabled={importing || selectedIds.length === 0}
                        >
                            {importing ? (
                                <>
                                    <Loader2 size={16} className={s.spin} />
                                    Importing...
                                </>
                            ) : (
                                `Import ${selectedIds.length} Calendar${selectedIds.length !== 1 ? "s" : ""}`
                            )}
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}
