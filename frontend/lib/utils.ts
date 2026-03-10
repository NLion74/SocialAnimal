export function getCurrentUserId(): string | null {
    const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return null;
    try {
        return JSON.parse(atob(token)).sub;
    } catch {
        return null;
    }
}

import type { CalEvent, EventLayout, LayoutEvent } from "./types";

export function computeLayouts(evs: CalEvent[]): EventLayout[] {
    const events: LayoutEvent[] = evs
        .map((e) => {
            const dayStart = new Date(e.startTime);
            dayStart.setHours(0, 0, 0, 0);
            const start = Math.max(
                0,
                Math.floor(
                    (new Date(e.startTime).getTime() - dayStart.getTime()) /
                        60000,
                ),
            );
            const end = Math.max(
                1,
                Math.floor(
                    (new Date(e.endTime).getTime() - dayStart.getTime()) /
                        60000,
                ),
            );
            return { id: e.id, startMinutes: start, endMinutes: end, orig: e };
        })
        .sort(
            (a, b) =>
                a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
        );

    const layouts: EventLayout[] = [];
    let cluster: LayoutEvent[] = [];
    let clusterEnd = -1;

    const flushCluster = () => {
        if (!cluster.length) return;
        const colsEnd: number[] = [];
        const assignments: { ev: LayoutEvent; col: number }[] = [];
        for (const ev of cluster) {
            let placed = false;
            for (let i = 0; i < colsEnd.length; i++) {
                if (ev.startMinutes >= colsEnd[i]) {
                    assignments.push({ ev, col: i });
                    colsEnd[i] = ev.endMinutes;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                colsEnd.push(ev.endMinutes);
                assignments.push({ ev, col: colsEnd.length - 1 });
            }
        }
        const total = colsEnd.length;
        for (const a of assignments) {
            layouts.push({ event: a.ev, col: a.col, cols: total });
        }
        cluster = [];
        clusterEnd = -1;
    };

    for (const ev of events) {
        if (!cluster.length) {
            cluster.push(ev);
            clusterEnd = ev.endMinutes;
        } else if (ev.startMinutes < clusterEnd) {
            cluster.push(ev);
            clusterEnd = Math.max(clusterEnd, ev.endMinutes);
        } else {
            flushCluster();
            cluster.push(ev);
            clusterEnd = ev.endMinutes;
        }
    }
    flushCluster();

    return layouts;
}
