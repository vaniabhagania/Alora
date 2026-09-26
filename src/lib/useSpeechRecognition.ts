import { useCallback, useRef, useState } from 'react';

// The Web Speech API has no official TS lib entry — Chrome/Edge/Android
// ship it as `webkitSpeechRecognition`, with `SpeechRecognition` as the
// unprefixed alias on newer builds. Typed minimally here rather than
// pulling in a third-party types package for a handful of fields.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => SpeechRecognitionLike) | null;
}

/**
 * Thin wrapper around the browser's built-in speech-to-text. No server
 * round-trip, no API cost — but quality and even availability vary by
 * browser (solid on Chrome/Edge desktop and Android, unsupported on
 * Firefox, present but flakier on Safari). Callers should treat
 * `isSupported` as a real gate, not just an optimistic attempt.
 */
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isSupported = typeof window !== 'undefined' && getSpeechRecognitionCtor() !== null;

  const start = useCallback((onResult: (text: string) => void, onError?: (message: string) => void) => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onError?.('Voice capture is not supported in this browser — try Chrome or Edge on desktop, or Chrome on Android.');
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
      }
      if (finalText.trim()) onResult(finalText.trim());
    };

    recognition.onerror = (event) => {
      const message = event.error === 'not-allowed'
        ? "Microphone access was blocked — allow it in your browser's site settings to use voice capture."
        : event.error === 'no-speech'
          ? "Didn't catch any speech — try again a little closer to the mic."
          : `Voice capture stopped (${event.error}).`;
      onError?.(message);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isSupported, isListening, start, stop };
}
