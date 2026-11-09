import { SessionProvider } from "../features/account/SessionProvider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "SocialAnimal",
	description: "Share your calendar with friends",
	icons: {
		icon: "/favicon.svg",
		shortcut: "/favicon-32x32.png",
		apple: "/apple-touch-icon.png",
	},
	manifest: "/site.webmanifest",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>
				<SessionProvider>{children}</SessionProvider>
			</body>
		</html>
	);
}
