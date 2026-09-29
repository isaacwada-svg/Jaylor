// Records microphone audio as a complete 16 kHz mono WAV file, so every
// phone produces a format the transcription model can read.
function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const tag = (o: number, v: string) => {
    for (let i = 0; i < v.length; i++) view.setUint8(o + i, v.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const value of chunk) {
      const s = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, s * (s < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function recordWav(): Promise<{ stop: () => Promise<{ file: File; seconds: number }> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let context: AudioContext | undefined;
  try {
    try {
      context = new AudioContext({ sampleRate: 16000 });
    } catch {
      context = new AudioContext();
    }
    await context.resume();
    const ctx = context;
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    let stopped = false;
    return {
      async stop() {
        if (stopped) throw new Error("Recording already stopped");
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
        node.disconnect();
        source.disconnect();
        node.onaudioprocess = null;
        const samples = chunks.reduce((s, c) => s + c.length, 0);
        const blob = encodeWav(chunks, ctx.sampleRate);
        await ctx.close();
        if (blob.size < 2048) throw new Error("The recording was empty. Please try again.");
        return {
          file: new File([blob], "voice-note.wav", { type: "audio/wav" }),
          seconds: Math.max(1, Math.round(samples / ctx.sampleRate)),
        };
      },
    };
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    await context?.close();
    throw error;
  }
}
