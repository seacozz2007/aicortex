import type { Metadata } from "next";
import { AICortexLanding } from "@/features/landing/components/aicortex-landing";

export const metadata: Metadata = {
  title: "Homepage",
  description:
    "AICortex — open-source platform that turns coding agents into real teammates. Assign tasks, track progress, compound skills.",
  openGraph: {
    title: "AICortex — Project Management for Human + Agent Teams",
    description:
      "Manage your human + agent workforce in one place.",
    url: "/homepage",
  },
  alternates: {
    canonical: "/homepage",
  },
};

export default function HomepagePage() {
  return <AICortexLanding />;
}
