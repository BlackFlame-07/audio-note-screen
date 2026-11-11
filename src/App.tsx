import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AsciiCanvas } from './components/AsciiCanvas';
import { TactileControls } from './components/TactileControls';
import { AsciiPixelEngine, AppState, ThemeMode } from './lib/asciiPixelEngine';
import { audioSynth } from './lib/audioSynth';

export function App() {
  const [theme, setTheme] = useState<ThemeMode>('DARK');
  const [state, setState] = useState<AppState>('IDLE');
  const [isRecordingPaused, setIsRecordingPaused] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [audioBands, setAudioBands] = useState<number[]>([0.1, 0.2, 0.4, 0.6, 0.5, 0.3, 0.2, 0.1]);
  const [audioEnergy, setAudioEnergy] = useState<number>(0.08);

  // Singleton ASCII Pixel Swarm Engine
  const engine = useMemo(() => new AsciiPixelEngine(), []);
  const timerRef = useRef<number | null>(null);

  // Timecode clock management
  useEffect(() => {
    if (state === 'RECORDING' && !isRecordingPaused) {
      const startTime = performance.now() - elapsedMs;
      timerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - startTime);
      }, 33);
    } else if (state === 'PLAYING') {
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Math.round(engine.readingProgressSec * 1000));
      }, 33);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (state === 'IDLE') {
        setElapsedMs(0);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state, isRecordingPaused, engine]);

  // Read live audio telemetry for the VU meters
  useEffect(() => {
    const meterInterval = setInterval(() => {
      const now = performance.now() * 0.001;
      const isSim = state === 'RECORDING' && !isRecordingPaused && !isMicActive;
      const data = audioSynth.getLiveAudioEnergy(now, isSim);
      setAudioEnergy(data.energy);
      setAudioBands(data.bands);
    }, 50);

    return () => clearInterval(meterInterval);
  }, [state, isRecordingPaused, isMicActive]);

  // Format MM:SS.ms (tabular-nums)
  const formattedTimecode = useMemo(() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((elapsedMs % 1000) / 10);

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const cs = String(centiseconds).padStart(2, '0');
    return `${mm}:${ss}.${cs}`;
  }, [elapsedMs]);

  // Core Actions
  const handleToggleRecord = () => {
    audioSynth.playClick(950);
    if (state !== 'RECORDING') {
      setState('RECORDING');
      setIsRecordingPaused(false);
      setIsTranscribing(false);
      setElapsedMs(0);
      engine.setState('RECORDING');
      engine.setRecordingPaused(false);
    } else {
      const nextPaused = !isRecordingPaused;
      setIsRecordingPaused(nextPaused);
      engine.setRecordingPaused(nextPaused);
    }
  };

  const handleTranscribe = () => {
    audioSynth.playClick(1050);
    if (state === 'RECORDING') {
      setIsTranscribing(true);
      setIsRecordingPaused(false);
      setState('TRANSCRIBED');
      engine.setState('TRANSCRIBED');
      engine.triggerTranscribeTransition(() => {
        setIsTranscribing(false);
      });
    }
  };

  const handleTogglePlay = () => {
    audioSynth.playClick(850);
    if (state === 'TRANSCRIBED') {
      setState('PLAYING');
      engine.setState('PLAYING');
      engine.readingProgressSec = 0;
    } else if (state === 'PLAYING') {
      setState('TRANSCRIBED');
      engine.setState('TRANSCRIBED');
    }
  };

  const handleClear = () => {
    audioSynth.playClick(800);
    setState('IDLE');
    setIsRecordingPaused(false);
    setIsTranscribing(false);
    setElapsedMs(0);
    engine.setState('IDLE');
    engine.setRecordingPaused(false);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handleToggleRecord();
          break;
        case 't':
        case 'T':
          if (state === 'RECORDING') {
            handleTranscribe();
          }
          break;
        case 'p':
        case 'P':
          if (state === 'TRANSCRIBED' || state === 'PLAYING') {
            handleTogglePlay();
          }
          break;
        case 'c':
        case 'C':
          handleClear();
          break;
        case 'z':
        case 'Z':
          audioSynth.playClick(1200);
          setIsZoomed((prev) => !prev);
          break;
        case 'm':
        case 'M':
          audioSynth.playClick(1000);
          setTheme((prev) => (prev === 'DARK' ? 'WHITE' : 'DARK'));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, isRecordingPaused]);

  const handleMicToggle = async () => {
    audioSynth.playClick(1150);
    if (!isMicActive) {
      const ok = await audioSynth.enableMicrophone();
      setIsMicActive(ok);
    } else {
      audioSynth.disableMicrophone();
      setIsMicActive(false);
    }
  };

  const handleMuteToggle = () => {
    const muted = audioSynth.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-8 bg-[#0C0C0E] text-[#EEEEEE] font-pixel select-none technical-grid relative">
      {/* Studio Workbench Header & Telemetry Pill (Strict Monochrome) */}
      <div className="w-full max-w-[390px] mb-3 flex items-center justify-between text-[9px] tracking-widest text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-white rounded-xs shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          <span className="font-pixel text-[#EEEEEE]">
            AUDIO_NOTE // MINIMAL
          </span>
        </div>

        {/* Global Controls (Strict Monochrome: Zero Red) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              audioSynth.playClick(1000);
              setTheme((prev) => (prev === 'DARK' ? 'WHITE' : 'DARK'));
            }}
            className="px-2 py-0.5 rounded-md text-[8.5px] font-pixel tracking-wider border carbon-key-idle transition-all cursor-pointer"
            title="Toggle Monochrome Theme (Dark / White)"
          >
            {theme === 'DARK' ? 'THEME: DARK' : 'THEME: WHITE'}
          </button>

          <button
            onClick={handleMicToggle}
            className={`px-2 py-0.5 rounded-md text-[8.5px] font-pixel tracking-wider border transition-all cursor-pointer ${
              isMicActive
                ? 'bg-white/20 border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                : 'carbon-key-idle'
            }`}
          >
            {isMicActive ? 'MIC: LIVE' : 'MIC: SIM'}
          </button>

          <button
            onClick={handleMuteToggle}
            className={`px-2 py-0.5 rounded-md text-[8.5px] font-pixel tracking-wider border transition-all cursor-pointer ${
              isMuted
                ? 'bg-zinc-800/40 border-white/5 text-zinc-600'
                : 'carbon-key-idle'
            }`}
            title="Toggle Web Audio Foley Clicks"
          >
            {isMuted ? 'FOLEY: OFF' : 'FOLEY: ON'}
          </button>
        </div>
      </div>

      {/* 390x844 MOBILE HARDWARE FRAME (Strict Monochrome Carbon Slate Chassis) */}
      <div className="relative w-[390px] h-[844px] rounded-[48px] p-3 flex flex-col justify-between overflow-hidden carbon-frame shadow-2xl">
        {/* Subtle Corner Crosshairs */}
        <div className="absolute top-3 left-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>
        <div className="absolute top-3 right-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>
        <div className="absolute bottom-3 left-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>
        <div className="absolute bottom-3 right-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>

        {/* TOP 2/3 (HEIGHT: 556PX): RECESSED ASCII PIXEL CANVAS (366x532px) */}
        <div className="w-full h-[556px] rounded-[28px] p-3 flex flex-col justify-between carbon-card relative">
          <div className="w-[366px] h-[532px] mx-auto overflow-hidden rounded-[16px]">
            <AsciiCanvas
              engine={engine}
              state={state}
              theme={theme}
              tapeName="MEMO_01"
              isZoomed={isZoomed}
              isSimulatingAudio={!isMicActive && !isRecordingPaused && state === 'RECORDING'}
            />
          </div>
        </div>

        {/* BOTTOM 1/3 (HEIGHT: 264PX): LEAN TACTILE CONTROL PANEL */}
        <TactileControls
          state={state}
          isRecordingPaused={isRecordingPaused}
          isPlaying={state === 'PLAYING'}
          isTranscribing={isTranscribing}
          theme={theme}
          timecode={formattedTimecode}
          onToggleRecord={handleToggleRecord}
          onTranscribe={handleTranscribe}
          onTogglePlay={handleTogglePlay}
          onClear={handleClear}
          audioBands={audioBands}
          audioEnergy={audioEnergy}
        />
      </div>

      {/* Lean HUD Footer */}
      <div className="w-full max-w-[390px] mt-3 flex items-center justify-between text-[9px] font-pixel text-zinc-500 tracking-wider">
        <span>SPACE:REC/PAUSE | T:TRANSCRIBE | P:PLAY | C:CLEAR</span>
        <button
          onClick={() => setIsZoomed((z) => !z)}
          className="hover:text-white cursor-pointer transition-colors"
        >
          Z:ZOOM {isZoomed ? '[1.5×]' : '[1.0×]'}
        </button>
      </div>
    </div>
  );
}

export default App;
