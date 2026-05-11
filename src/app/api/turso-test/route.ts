import { NextResponse } from "next/server";
import { getTableCounts, upsertSampleStoryState } from "@/lib/turso";

export async function POST() {
  try {
    const state = await upsertSampleStoryState();
    const tableCounts = await getTableCounts();

    return NextResponse.json({
      ok: true,
      tableCounts,
      state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown Turso error",
      },
      { status: 500 },
    );
  }
}
