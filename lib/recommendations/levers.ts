import type { GapLeverType } from "@/lib/contracts/gaps";
import type { EvidenceGrade } from "@/lib/contracts/recommendations";

/** GEO_PLAYBOOK §5: lever → owning team. */
export const LEVER_OWNERS: Record<GapLeverType, string> = {
  technical: "Web team",
  on_page: "Content team",
  truth_layer: "Comms plus IR",
  listing: "Admissions marketing",
  earned_media: "Media relations",
  community: "Social team",
  original_data: "Research comms",
};

/** GEO_PLAYBOOK §1: evidence grade meanings (for UI copy / validation). */
export const EVIDENCE_GRADE_MEANING: Record<EvidenceGrade, string> = {
  A: "Peer reviewed or controlled",
  B: "Large observational study, method published",
  C: "Vendor study, method thin",
  D: "Anecdote or marketing claim",
};

export function ownerForLever(leverType: GapLeverType): string {
  return LEVER_OWNERS[leverType];
}
