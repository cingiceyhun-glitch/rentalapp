import { useDictation } from '../lib/speech.ts';
import { loadSettings } from '../lib/settings.ts';
import { Icon } from './Icon.tsx';

/** Mic button: speak and the text is added to your notes. */
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const { listening, error, start, stop, supported } = useDictation(onText, loadSettings().voiceLang);
  if (!supported) return null;
  return (
    <span className="dictate">
      <button
        type="button"
        className={`btn small soft ${listening ? 'recording' : ''}`}
        onClick={listening ? stop : start}
        aria-pressed={listening}
      >
        {listening ? '■ Stop' : (<><Icon name="mic" size={16} /> Speak</>)}
      </button>
      {error && <span className="error small">{error}</span>}
    </span>
  );
}
