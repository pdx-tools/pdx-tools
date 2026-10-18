import { useIsDeveloper } from "@/features/account";

/** Feature access; each campaign still requires an explicit Analyze campaign action. */
export function useIsCampaignAnalysisEnabled() {
  return useIsDeveloper();
}
