import { NextResponse } from "next/server";
import { getTableCounts, resetStoryRun } from "@/lib/turso";

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
