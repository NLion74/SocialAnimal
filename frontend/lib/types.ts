export interface CalendarEvent {
	id: string;
	title: string;
	startTime: string;
	endTime: string;
	allDay: boolean;
}

export interface CalendarData {
	id: string;
	name: string;
	type: string;
	connectionId?: string | null;
	remoteId?: string | null;
	events?: any[];
	lastSync?: string | null;
	lastTestSuccess?: boolean | null;
	lastSyncSuccess?: boolean | null;
	lastError?: string | null;
	syncInterval?: number;
}

export interface FriendUser {
	id: string;
	email: string;
	name?: string | null;
}

export interface UserSearchResult {
	id: string;
	email: string;
	name?: string | null;
}

export interface SharedCalendar {
	id: string;
	name: string;
	permission: Permission;
	accessLabel?: string;
}

export interface Friend {
	id: string;
	user1: FriendUser;
	user2: FriendUser;
	status: string;
	createdAt?: string;
	sharedCalendarIds?: string[];
	sharedCalendarExpirations?: Record<string, string | null>;
	sharedCalendarRulesets?: Record<string, string>;
	sharedCalendarPermissions?: Record<string, Permission>;
	sharedWithMe?: SharedCalendar[];
}

export interface CalEvent extends CalendarEvent {
	calendarId?: string;
	description?: string | null;
	location?: string | null;
	isFriend?: boolean;
	owner?: { id: string; name?: string | null; email: string } | null;
	calendar: { id: string; name: string; type: string };
}

export interface CalSource {
	id: string;
	name: string;
	isFriend: boolean;
}

export type Permission = "busy" | "titles" | "full";

export type LayoutEvent = {
	id: string;
	startMinutes: number;
	endMinutes: number;
	orig: CalEvent;
};

export type EventLayout = {
	event: LayoutEvent;
	col: number;
	cols: number;
};

export type FirstDay = "sunday" | "monday";
