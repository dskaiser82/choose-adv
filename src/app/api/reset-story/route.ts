import { NextResponse } from "next/server";
import { getTableCounts, resetStoryRun } from "@/lib/turso";

const REQUIRED_STARTING_ITEMS = [
  "Ancient Shadow Brace",
  "Hunting Bow",
  "Arrows",
  "Quiet Dagger",
  "Travel Sword",
  "Silver Coins",
] as const;

// Development/testing reset only.
// This route is intentionally kept out of the normal player UI.
export async function POST() {
  try {
    const story = await resetStoryRun();
    const inventoryNames = new Set(story.inventory.map((item) => item.name));
    const missingRequiredItems = REQUIRED_STARTING_ITEMS.filter((item) => !inventoryNames.has(item));
    const resetVerified = story.currentScene?.title === "Approach to Whispering Pass" && missingRequiredItems.length === 0;

    return NextResponse.json({
      ok: true,
      tableCounts: await getTableCounts(),
      resetVerified,
      currentScene: story.currentScene,
      inventory: story.inventory.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        itemType: item.itemType,
        equippedSlot: item.equippedSlot,
      })),
      missingRequiredItems,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown reset error" },
      { status: 500 },
    );
  }
}
