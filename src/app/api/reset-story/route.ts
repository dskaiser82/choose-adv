import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { appendEvent, getTableCounts, upsertCharacter, upsertScene, upsertWorld } from "@/lib/turso";

export async function POST() {
  try {
    const now = new Date().toISOString();

    await upsertWorld({
      id: "world-main",
      name: "Veyr",
      tone: "Dark political fantasy",
      technologyLevel: "Advanced medieval / early renaissance without firearms",
      summary:
        "Veyr is a hard land of rival powers, border intrigue, and quiet violence. Cade operates in the Grey Marches, where decaying loyalties, reconnaissance work, and hidden threats shape every decision.",
      majorPowers: ["Avaren", "Velkan Marches", "The Free Coast"],
      regions: ["The Grey Marches"],
      locations: ["Blackmere"],
      updatedAt: now,
    });

    await upsertCharacter({
      id: "character-main",
      name: "Cade",
      status: "alive",
      kingdom: "Avaren",
      region: "The Grey Marches",
      formerAffiliation: "Black Veil Corps",
      role: "Frontier reconnaissance operative",
      yearsOfService: 11,
      specializations: [
        "Stealth",
        "Reconnaissance",
        "Crossbow marksmanship",
        "Tactical planning",
        "Survival",
        "Infiltration",
        "Assassination",
        "Frontier operations",
      ],
      updatedAt: now,
    });

    await upsertScene({
      id: crypto.randomUUID(),
      sceneKey: "current",
      title: "Veyr Test Run",
      narration:
        "Cade stands at the edge of Blackmere with the Grey Marches stretched out behind him. The story is live, the world is loaded from Turso, and the next move will set the tone for what follows.",
      suggestedChoices: [
        "Scout the area before entering town",
        "Approach the nearest stranger and ask questions",
        "Inspect the most suspicious landmark nearby",
      ],
      actionDraft: "",
      updatedAt: now,
    });

    await appendEvent({
      id: crypto.randomUUID(),
      eventKey: `reset-${now}`,
      title: "Story reset",
      summary: "The test story state was reset to a clean starting point.",
      action: "Reset story",
      createdAt: now,
    });

    return NextResponse.json({ ok: true, tableCounts: await getTableCounts() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown reset error" },
      { status: 500 },
    );
  }
}
