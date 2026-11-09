import type { Metadata } from "next";
import SharedCalendar from "../../features/sharing/SharedCalendar";

export const metadata: Metadata = {
	title: "Shared calendar · SocialAnimal",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

export default function SharedCalendarPage() {
	return <SharedCalendar />;
}
