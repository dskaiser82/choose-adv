import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { toAsyncIterable } from "@elevenlabs/elevenlabs-js/wrapper/utils";

async function synthesizeNarration(text: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      body: {
        error: "missing-api-key",
        debug: {
          hasApiKey: false,
          apiKeyPrefix: null,
          stage: "missing-api-key",
        },
      },
    };
  }

  try {
    const client = new ElevenLabsClient({ apiKey });
    const audioStream = await client.textToSpeech.convert("DGhxgogT0bhXlRToPzFs", {
      text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of toAsyncIterable(audioStream)) {
      chunks.push(chunk);
    }

    if (!chunks.length) {
      return {
        ok: false as const,
        status: 502,
        body: {
          error: "empty-audio-stream",
          debug: {
            hasApiKey: true,
            apiKeyPrefix: apiKey.slice(0, 4),
            stage: "empty-audio-stream",
            chunkCount: 0,
          },
        },
      };
    }

    const audioBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return {
      ok: true as const,
      audioBuffer,
      debug: {
        hasApiKey: true,
        apiKeyPrefix: apiKey.slice(0, 4),
        stage: "audio-generated",
        chunkCount: chunks.length,
        byteLength: audioBuffer.byteLength,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      status: 502,
      body: {
        error: "elevenlabs-error",
        debug: {
          hasApiKey: true,
          apiKeyPrefix: apiKey.slice(0, 4),
          stage: "elevenlabs-error",
          error: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return Response.json(
      {
        error: "missing-text",
        debug: {
          stage: "missing-text",
        },
      },
      { status: 400 },
    );
  }

  const result = await synthesizeNarration(text);
  if (!result.ok) {
    return Response.json(result.body, { status: result.status });
  }

  return new Response(result.audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Length": String(result.audioBuffer.byteLength),
      "X-TTS-Stage": result.debug.stage,
      "X-TTS-Key-Prefix": result.debug.apiKeyPrefix,
      "X-TTS-Chunk-Count": String(result.debug.chunkCount),
      "X-TTS-Byte-Length": String(result.debug.byteLength),
    },
  });
}
