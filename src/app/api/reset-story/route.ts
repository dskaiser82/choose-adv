import { NextResponse } from "next/server";
import { getTableCounts, resetStoryRun } from "@/lib/turso";

// Development/testing reset only.
// This route is intentionally kept out of the normal player UI.
export async function POST() {
  try {
    await resetStoryRun();
    return NextResponse.json({ ok: true, tableCounts: await getTableCounts() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown reset error" },
      { status: 500 },
    );
  }
}
