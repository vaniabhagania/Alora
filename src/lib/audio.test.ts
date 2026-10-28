import { describe, it, expect } from 'vitest';
import { encodeWav, isAudioType, MAX_RECORD_SECONDS, MAX_TRANSCRIBE_BYTES, TARGET_RATE } from './audio';

describe('audio helpers', () => {
  it('writes a valid 16-bit mono WAV header and clamps samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2]), 16000);
    const v = new DataView(wav.buffer);
    const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(22, true)).toBe(1);            // mono
    expect(v.getUint32(24, true)).toBe(16000);        // rate
    expect(v.getUint32(40, true)).toBe(10);           // 5 samples * 2 bytes
    expect(wav.length).toBe(54);
    expect([44, 46, 48, 50, 52].map((o) => v.getInt16(o, true))).toEqual([0, 32767, -32768, 32767, -32768]);
  });
  it('a maximum-length recording fits under the transcription size cap', () => {
    expect(MAX_RECORD_SECONDS * TARGET_RATE * 2 + 44).toBeLessThan(MAX_TRANSCRIBE_BYTES);
  });
  it('recognises audio mime types only', () => {
    expect(isAudioType('audio/mpeg')).toBe(true);
    expect(isAudioType('video/mp4')).toBe(false);
    expect(isAudioType('application/pdf')).toBe(false);
  });
});
