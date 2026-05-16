import type { Metadata } from "next";
import { AICortexLanding } from "@/features/landing/components/aicortex-landing";
import { RedirectIfAuthenticated } from "@/features/landing/components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: "AICortex — One brain. Many hands.",
  description:
    "The orchestration layer for AI engineering teams.",
};

export default function LandingPage() {
  return (
    <>
      <RedirectIfAuthenticated />
      <AICortexLanding />
    </>
  );
}
