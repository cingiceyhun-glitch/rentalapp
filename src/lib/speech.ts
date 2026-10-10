import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typing for the Web Speech API (Chrome, Edge, Safari incl. iOS).
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => Recognition) | undefined {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recognition) | undefined;
}

export const speechSupported = typeof window !== 'undefined' && !!recognitionCtor();

/**
 * Dictation: calls onText with each finished sentence while listening.
 * Language defaults to the browser's, so Portuguese works out of the box on a pt-PT phone.
 */
export function useDictation(onText: (text: string) => void, lang = navigator.language) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onTextRef.current(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone permission denied.' : `Voice input stopped (${e.error}).`);
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }, [lang]);

  useEffect(() => () => rec.current?.stop(), []);

  return { listening, error, start, stop, supported: speechSupported };
}
