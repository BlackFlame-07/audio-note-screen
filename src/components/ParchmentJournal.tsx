import React, { useState } from 'react';
import { tavernFoley } from '../lib/tavernFoley';

export interface JournalEntry {
  id: string;
  timestamp: string;
  mood: string;
  moodLabel: string;
  transcript: string;
  duration: string;
  tags: string[];
}

interface ParchmentJournalProps {
  transcript: string;
  isSpeaking: boolean;
  durationSeconds: number;
  onSaveEntry: (entry: JournalEntry) => void;
  savedEntries: JournalEntry[];
  onSelectSavedEntry: (entry: JournalEntry) => void;
  onUpdateTranscript: (text: string) => void;
}

export const ParchmentJournal: React.FC<ParchmentJournalProps> = ({
  transcript,
  isSpeaking,
  durationSeconds,
  onSaveEntry,
  savedEntries,
  onSelectSavedEntry,
  onUpdateTranscript,
}) => {
  const [selectedMood, setSelectedMood] = useState<{ id: string; emoji: string; label: string }>({
    id: 'victorious',
    emoji: '⚔️',
    label: 'Battle-Worn & Victorious',
  });
  const [showPastLogs, setShowPastLogs] = useState<boolean>(false);
  const [isSealedRecently, setIsSealedRecently] = useState<boolean>(false);

  const moods = [
    { id: 'victorious', emoji: '⚔️', label: 'Victorious' },
    { id: 'battle_worn', emoji: '🛡️', label: 'Battle-Worn' },
    { id: 'pensive', emoji: '🕯️', label: 'Pensive' },
    { id: 'merry', emoji: '🍺', label: 'Merry' },
  ];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  const handleSeal = () => {
    if (!transcript.trim()) return;
    tavernFoley.playWaxSealStamp();
    setIsSealedRecently(true);

    const newEntry: JournalEntry = {
      id: String(Date.now()),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mood: selectedMood.emoji,
      moodLabel: selectedMood.label,
      transcript: transcript,
      duration: formatTime(durationSeconds),
      tags: ['#NightJournal', '#TavernVault', `#${selectedMood.label.replace(/\s+/g, '')}`],
    };

    onSaveEntry(newEntry);

    setTimeout(() => {
      setIsSealedRecently(false);
    }, 1800);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Daily Disposition / Mood Selector */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-[#d4a02c]">
          <span>DAILY DISPOSITION & MOOD</span>
          <span className="text-[#a69989]">{selectedMood.emoji} {selectedMood.label}</span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {moods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                tavernFoley.playWoodClick(500);
                setSelectedMood(m);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border py-1.5 transition-all ${
                selectedMood.id === m.id
                  ? 'border-[#f3aa57] bg-[#442614] text-[#fef1cb] shadow-[0_0_8px_rgba(243,170,87,0.3)]'
                  : 'border-[#36302a] bg-[#1a100a]/80 text-[#a69989] hover:border-[#61371b]'
              }`}
            >
              <span className="text-sm">{m.emoji}</span>
              <span className="mt-0.5 text-[9px] font-mono font-medium">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* The Scribe's Parchment Note Card */}
      <div className="relative overflow-hidden rounded-xl border-2 border-[#8c7355] bg-[#fbf5e5] p-3.5 shadow-md">
        {/* Parchment Deckle Edge Accents */}
        <div className="flex items-center justify-between border-b border-[#d1c6b6] pb-2 text-[10px] font-mono text-[#61371b]">
          <div className="flex items-center gap-1.5 font-semibold uppercase">
            <span>📜 SCRIBE'S LEDGER</span>
            <span className="text-[#a69989]">•</span>
            <span className="text-[#844c24]">{formatTime(durationSeconds)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#796e62]">{wordCount} words</span>
            {isSpeaking && (
              <span className="flex items-center gap-1 font-bold text-[#ab2d38]">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#ab2d38]" />
                INSCRIBING...
              </span>
            )}
          </div>
        </div>

        {/* Live Handwritten Transcript Content */}
        <div className="my-2 min-h-[90px] text-sm leading-relaxed text-[#2c190f]">
          <textarea
            value={transcript}
            onChange={(e) => onUpdateTranscript(e.target.value)}
            placeholder="The scribe's quill rests poised on parchment. Speak thy day, and watch the words ink into history..."
            className="w-full resize-none bg-transparent font-serif text-sm leading-relaxed text-[#2c190f] outline-none placeholder:italic placeholder:text-[#a69989]"
            rows={4}
          />

          {/* Scribe's Inking Nib Indicator */}
          {isSpeaking && (
            <span className="inline-block h-4 w-1 animate-pulse bg-[#2c190f] align-middle ml-1" />
          )}
        </div>

        {/* Tags and Wax Seal Watermark */}
        <div className="flex items-center justify-between border-t border-[#e3cdab] pt-2 text-[10px] font-mono text-[#844c24]">
          <div className="flex flex-wrap gap-1">
            <span className="rounded bg-[#e3cdab]/60 px-1.5 py-0.5 font-medium">#Nightfall</span>
            <span className="rounded bg-[#e3cdab]/60 px-1.5 py-0.5 font-medium">#{selectedMood.id}</span>
            <span className="rounded bg-[#e3cdab]/60 px-1.5 py-0.5 font-medium">#DailyRecord</span>
          </div>

          <div className="text-[9px] text-[#796e62]">
            Signed by the Tavern Chronicler
          </div>
        </div>

        {/* Hot Wax Stamp Seal Overlay when saved */}
        {isSealedRecently && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
            <div className="animate-bounce flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#54151c] bg-[#ab2d38] font-mono text-xs font-bold uppercase tracking-widest text-[#fef1cb] shadow-[0_0_24px_rgba(171,45,56,0.9)]">
              <div className="text-center leading-tight">
                <span className="text-base">⚜️</span>
                <br />
                SEALED
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary Action: Seal Entry into Tome */}
      <button
        type="button"
        disabled={!transcript.trim()}
        onClick={handleSeal}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider shadow-md transition-all active:translate-y-0.5 ${
          transcript.trim()
            ? 'border-[#ab2d38] bg-gradient-to-r from-[#7e2029] via-[#ab2d38] to-[#7e2029] text-[#fef1cb] hover:shadow-[0_0_16px_rgba(171,45,56,0.6)] cursor-pointer'
            : 'border-[#36302a] bg-[#1a100a] text-[#796e62] cursor-not-allowed'
        }`}
      >
        <span className="text-base">🔴</span>
        <span>SEAL NOTE INTO CHRONICLE</span>
      </button>

      {/* Accordion Toggle for Past Chronicles */}
      <div className="flex flex-col gap-2 rounded-xl border border-[#36302a] bg-[#16100a]/90 p-2.5">
        <button
          type="button"
          onClick={() => {
            tavernFoley.playWoodClick(460);
            setShowPastLogs(!showPastLogs);
          }}
          className="flex w-full items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-[#d4a02c]"
        >
          <span>📚 PAST CHRONICLES ({savedEntries.length})</span>
          <span className="text-[#a69989]">{showPastLogs ? '▲ HIDE' : '▼ VIEW'}</span>
        </button>

        {showPastLogs && (
          <div className="flex flex-col gap-2 pt-1">
            {savedEntries.length === 0 ? (
              <span className="py-2 text-center text-xs italic text-[#796e62]">
                No sealed notes yet. Dictate your thoughts and stamp with wax!
              </span>
            ) : (
              savedEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => onSelectSavedEntry(entry)}
                  className="cursor-pointer rounded-lg border border-[#3d2918] bg-[#21140c]/80 p-2.5 transition-colors hover:border-[#ab6630] hover:bg-[#2c190f]"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#d4843d]">
                    <span className="font-bold">
                      {entry.mood} {entry.moodLabel} • {entry.timestamp}
                    </span>
                    <span className="text-[#a69989]">{entry.duration}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 font-serif text-xs text-[#d1c6b6]">
                    "{entry.transcript}"
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
