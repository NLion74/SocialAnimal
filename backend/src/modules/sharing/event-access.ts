import type { Event } from "@prisma/client";
import { tokenHash } from "../../core/secrets";
import { prisma } from "../../core/database";
import { fail } from "../../core/http";
import {
	compileRuleset,
	stricter,
	timegrid,
	type Context,
	type Visibility,
} from "../../services/permissions";
import { maskEvent } from "./authorization";

export async function eventAccess(
	calendarId: string,
	viewerId: string,
	maximum: Visibility = "full",
	previewRulesetId?: string,
	linkRuleset?: { fallback: string; rules: unknown } | null,
) {
	const [calendar, friend, settings] = await Promise.all([
		prisma.calendar.findUnique({
			where: { id: calendarId },
			include: {
				user: {
					select: {
						settings: { select: { timezone: true } },
						disabled: true,
					},
				},
				shares: {
					where: {
						sharedWithId: viewerId,
						OR: [
							{ expiresAt: null },
							{ expiresAt: { gt: new Date() } },
						],
					},
					include: { ruleset: true },
				},
			},
		}),
		prisma.user.findUnique({
			where: { id: viewerId },
			select: {
				id: true,
				name: true,
				email: true,
				disabled: true,
				emailVerifiedAt: true,
				isAdmin: true,
			},
		}),
		prisma.appSettings.findUnique({
			where: { id: "global" },
			select: { requireEmailVerification: true, requireTwoFactor: true },
		}),
	]);

	if (!calendar || !friend || friend.disabled || calendar.user.disabled)
		return fail(403, "FORBIDDEN", "Calendar access is unavailable");

	if (
		(settings?.requireTwoFactor || settings?.requireEmailVerification) &&
		!friend.emailVerifiedAt &&
		(!friend.isAdmin || settings?.requireTwoFactor)
	)
		return fail(
			403,
			"EMAIL_VERIFICATION_REQUIRED",
			"Email verification is required",
		);

	const own = calendar.userId === viewerId;
	const share = calendar.shares[0];

	if (!own && !share && !previewRulesetId)
		return fail(403, "FORBIDDEN", "Calendar is not shared with you");

	let ruleset = share?.ruleset;

	if (previewRulesetId) {
		ruleset = await prisma.permissionRuleset.findFirst({
			where: { id: previewRulesetId, userId: calendar.userId },
		});

		if (!ruleset) return fail(404, "NOT_FOUND", "Ruleset not found");
	}

	const friendship = own
		? null
		: await prisma.friendship.findFirst({
				where: {
					status: "accepted",
					OR: [
						{ user1Id: calendar.userId, user2Id: viewerId },
						{ user2Id: calendar.userId, user1Id: viewerId },
					],
				},
				select: { createdAt: true },
			});

	if (!own && !friendship)
		return fail(403, "NOT_FRIENDS", "Accepted friendship required");

	const timezone = calendar.user.settings?.timezone || "UTC";

	const base: Context = {
		"calendar.id": calendar.id,
		"calendar.name": calendar.name,
		"calendar.type": calendar.type,
		"friend.id": friend.id,
		"friend.name": friend.name || "",
		"friend.email": friend.email,
		"friend.since": friendship
			? String(timegrid(friendship.createdAt, timezone)["timegrid.date"])
			: undefined,
	};

	const evaluate = compileRuleset(
		ruleset && (!own || previewRulesetId)
			? { fallback: ruleset.fallback, rules: ruleset.rules }
			: { fallback: own ? "full" : share.permission, rules: [] },
	);

	const publicEvaluate = linkRuleset
		? compileRuleset({
				fallback: linkRuleset.fallback,
				rules: linkRuleset.rules,
			})
		: null;

	const contextFor = (
		event: Pick<
			Event,
			| "title"
			| "description"
			| "location"
			| "startTime"
			| "endTime"
			| "allDay"
		> & { isRecurring?: boolean | null },
	): Context => ({
		...base,
		"event.title": event.title,
		"event.description": event.description || "",
		"event.location": event.location || "",
		"event.hasLocation": event.location?.trim() ? "yes" : "no",
		"event.hasDescription": event.description?.trim() ? "yes" : "no",
		"event.isRecurring":
			event.isRecurring == null
				? undefined
				: event.isRecurring
					? "yes"
					: "no",
		"event.duration": (+event.endTime - +event.startTime) / 60000,
		"event.allDay": event.allDay ? "yes" : "no",
	});

	const mask = <
		T extends Pick<
			Event,
			| "title"
			| "description"
			| "location"
			| "startTime"
			| "endTime"
			| "allDay"
		>,
	>(
		event: T,
	): (T & { visibility: Visibility }) | null => {
		let permission = stricter(
			maximum,
			evaluate.during(
				{
					...contextFor(event),
					...timegrid(event.startTime, timezone),
					"event.title": event.title,
					"event.location": event.location || "",
					"event.duration":
						(event.endTime.getTime() - event.startTime.getTime()) /
						60000,
					"event.allDay": event.allDay ? "yes" : "no",
				},
				event.startTime,
				event.endTime,
				timezone,
			),
		);

		if (publicEvaluate) {
			const context: Context = {
				...contextFor(event),
				"friend.id": undefined,
				"friend.name": undefined,
				"friend.email": undefined,
				"friend.since": undefined,
				"event.title": event.title,
				"event.location": event.location || "",
				"event.duration": (+event.endTime - +event.startTime) / 60000,
				"event.allDay": event.allDay ? "yes" : "no",
			};

			permission = stricter(
				permission,
				publicEvaluate.during(
					context,
					event.startTime,
					event.endTime,
					timezone,
				),
			);
		}

		if (permission === "hidden") return null;
		return { ...maskEvent(event, permission), visibility: permission };
	};

	return Object.assign(mask, {
		explain: (event: Event) =>
			evaluate.explain(
				contextFor(event),
				event.startTime,
				event.endTime,
				timezone,
			),
		revision: tokenHash(
			JSON.stringify({
				base,
				timezone,
				maximum,
				ruleset: ruleset || share?.permission || "full",
				linkRuleset,
			}),
		),
	});
}
