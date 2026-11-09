import type { Metadata } from "next";
import VerifyEmail from "../../features/account/VerifyEmail";

export const metadata: Metadata = {
	title: "Verify email · SocialAnimal",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

export default function Page() {
	return <VerifyEmail />;
}
