import { useCallback, useState } from 'react';

export interface Settings {
  /** BCP-47 language for voice notes, e.g. "pt-PT" or "en-GB". */
  voiceLang: string;
  /** Country calling code added to local phone numbers for calls/WhatsApp. */
  countryCode: string;
}

const KEY = 'homehunt-settings';
const DEFAULTS: Settings = { voiceLang: validTag(navigator.language) ?? 'en-GB', countryCode: '351' };

function validTag(tag: string | undefined): string | undefined {
  try {
    return tag ? Intl.getCanonicalLocales(tag)[0] : undefined;
  } catch {
    return undefined;
  }
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings(): [Settings, (changes: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(loadSettings);
  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...changes };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode: keep in memory only */
      }
      return next;
    });
  }, []);
  return [settings, update];
}
