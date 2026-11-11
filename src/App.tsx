import React, { useState, useEffect, useRef } from 'react';
import { TavernScribeCanvas } from './components/TavernScribeCanvas';
import { TavernAudioControls } from './components/TavernAudioControls';
import { ParchmentJournal, JournalEntry } from './components/ParchmentJournal';
import { tavernFoley } from './lib/tavernFoley';

export function App() {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [audioEnergy, setAudioEnergy] = useState<number>(0.05);
  const [audioBands, setAudioBands] = useState<number[]>([
    0.05, 0.08, 0.06, 0.04, 0.07, 0.05, 0.04, 0.03, 0.04, 0.06, 0.05, 0.03, 0.04, 0.05, 0.04, 0.02
  ]);

  const [savedEntries, setSavedEntries] = useState<JournalEntry[]>([
    {
      id: 'pre-1',
      timestamp: '22:15 PM',
      mood: '🛡️',
      moodLabel: 'Battle-Worn',
      transcript:
        'A long, fierce march through client feedback today. We refined the anti-slop typography and tuned the animations to whole-pixel perfection. The tavern fire warms weary bones.',
      duration: '01:14',
      tags: ['#Nightfall', '#Craftsmanship', '#BattleWorn'],
    },
  ]);

  // Audio timer & speech streaming refs
  const timerRef = useRef<number | null>(null);
  const streamTimeoutRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);

  // Start ambient fire on first user interaction or mount
  useEffect(() => {
    const handleFirstTouch = () => {
      tavernFoley.startAmbientFire();
      window.removeEventListener('click', handleFirstTouch);
      window.removeEventListener('keydown', handleFirstTouch);
    };
    window.addEventListener('click', handleFirstTouch);
    window.addEventListener('keydown', handleFirstTouch);

    return () => {
      window.removeEventListener('click', handleFirstTouch);
      window.removeEventListener('keydown', handleFirstTouch);
    };
  }, []);

  // Time recording counter
  useEffect(() => {
    if (isSpeaking) {
      timerRef.current = window.setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSpeaking]);

  // Live Audio Telemetry Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now() * 0.001;
      const data = tavernFoley.getLiveAudioEnergy(now, isSpeaking && !isMicActive);
      setAudioEnergy(data.energy);

      const bands16 = [...data.bands, ...data.bands.map((b) => Math.max(0.04, b * 0.85))];
      setAudioBands(bands16);

      if (isMicActive) {
        if (data.energy > 0.14) {
          if (!isSpeaking) setIsSpeaking(true);
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = window.setTimeout(() => {
            setIsSpeaking(false);
          }, 900);
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isSpeaking, isMicActive]);

  const handleToggleSpeaking = () => {
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
    if (!isSpeaking) {
      setIsSpeaking(true);
      if (!transcript.trim()) {
        setTranscript('The night is quiet. I sit by the warm timber counter as the rain taps the roof...');
      }
    } else {
      setIsSpeaking(false);
    }
  };

  const handleToggleMic = async () => {
    if (!isMicActive) {
      const ok = await tavernFoley.enableMicrophone();
      if (ok) {
        setIsMicActive(true);
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          try {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
              let liveText = '';
              for (let i = 0; i < event.results.length; i++) {
                liveText += event.results[i][0].transcript + ' ';
              }
              setTranscript(liveText.trim());
              setIsSpeaking(true);
            };

            recognition.onend = () => {
              if (isMicActive) {
                try {
                  recognition.start();
                } catch {
                  // ignore
                }
              }
            };

            recognition.start();
            speechRecognitionRef.current = recognition;
          } catch (e) {
            console.warn('SpeechRecognition failed to start:', e);
          }
        }
      }
    } else {
      tavernFoley.disableMicrophone();
      setIsMicActive(false);
      setIsSpeaking(false);
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
    }
  };

  const handlePlayPreset = (title: string, storyText: string) => {
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);

    setIsSpeaking(true);
    setTranscript('');
    setElapsedSec(0);

    const words = storyText.split(' ');
    let currentWordIdx = 0;

    const streamNextWord = () => {
      if (currentWordIdx < words.length) {
        const nextChunk = words.slice(0, currentWordIdx + 1).join(' ');
        setTranscript(nextChunk);
        currentWordIdx++;
        const delay = 160 + Math.random() * 120;
        streamTimeoutRef.current = window.setTimeout(streamNextWord, delay);
      } else {
        streamTimeoutRef.current = window.setTimeout(() => {
          setIsSpeaking(false);
        }, 1200);
      }
    };

    streamTimeoutRef.current = window.setTimeout(streamNextWord, 200);
  };

  const handleSaveEntry = (newEntry: JournalEntry) => {
    setSavedEntries((prev) => [newEntry, ...prev]);
    setTranscript('');
    setElapsedSec(0);
    setIsSpeaking(false);
  };

  const handleSelectSavedEntry = (entry: JournalEntry) => {
    tavernFoley.playWoodClick(480);
    setTranscript(entry.transcript);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#05050c] p-0 sm:p-4 text-[#f5eee4] font-sans antialiased selection:bg-[#cc7a3d] selection:text-[#fff1c7]">
      {/* Mobile Frame Container (Max width 430px, 920px tall on desktop) */}
      <div className="relative flex w-full max-w-[430px] h-screen sm:h-[920px] flex-col overflow-hidden bg-gradient-to-b from-[#1c1008] via-[#24150b] to-[#0c0a08] sm:rounded-[40px] sm:border-[4px] sm:border-[#452513] sm:shadow-[0_28px_80px_rgba(0,0,0,0.95)]">
        
        {/* Mobile Status Bar (Time, Battery, Wifi) */}
        <div className="flex h-8 shrink-0 items-center justify-between px-6 text-[11px] font-mono tracking-tight text-[#b0a394]">
          <span className="font-semibold text-[#fff1c7]">23:42</span>
          <div className="flex items-center gap-2">
            <span>5G</span>
            <span>📶</span>
            <span>100% 🔋</span>
          </div>
        </div>

        {/* Tavern Screen Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#452513] bg-[#24130a]/90 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#824924] bg-[#452513] text-sm shadow-inner">
              📜
            </span>
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-sm font-bold tracking-wide text-[#fff1c7]">
                The Scribe's Tavern
              </span>
              <span className="text-[10px] font-mono text-[#cc7a3d]">
                Nightfall Audio Journal • 11 Nov
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isSpeaking ? 'bg-[#e8584f] animate-ping' : 'bg-[#57be8d]'
              }`}
            />
            <span className="text-[10px] font-mono font-medium text-[#b0a394]">
              {isSpeaking ? 'SCRIBING' : 'READY'}
            </span>
          </div>
        </div>

        {/* ══════ 1. TAVERN SCENE (COVERS 60% OF SCREEN) ══════ */}
        <div className="shrink-0 w-full px-3 pt-2.5" style={{ height: '58%' }}>
          <TavernScribeCanvas
            isSpeaking={isSpeaking}
            audioEnergy={audioEnergy}
            audioBands={audioBands}
          />
        </div>

        {/* ══════ 2. LOWER 40% CONSOLE: AUDIO NOTES & PARCHMENT JOURNAL ══════ */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 min-h-0 bg-gradient-to-t from-[#0e0906] to-[#1c1008]/40">
          
          {/* Audio Dictation Controls */}
          <div className="shrink-0">
            <TavernAudioControls
              isSpeaking={isSpeaking}
              onToggleSpeaking={handleToggleSpeaking}
              onPlayPreset={handlePlayPreset}
              isMicActive={isMicActive}
              onToggleMic={handleToggleMic}
            />
          </div>

          {/* The Scribe's Parchment Journal & Past Logs */}
          <div className="shrink-0">
            <ParchmentJournal
              transcript={transcript}
              isSpeaking={isSpeaking}
              durationSeconds={elapsedSec}
              onSaveEntry={handleSaveEntry}
              savedEntries={savedEntries}
              onSelectSavedEntry={handleSelectSavedEntry}
              onUpdateTranscript={setTranscript}
            />
          </div>

          {/* Footer Note */}
          <div className="shrink-0 py-2 text-center text-[10px] font-mono text-[#877c70]">
            Crafted with /pixel-worlds • Pure Canvas2D & Bayer Dither
          </div>
        </div>
      </div>
    </div>
  );
}
export default App;
