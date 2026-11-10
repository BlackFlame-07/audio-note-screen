import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AsciiCanvas } from './components/AsciiCanvas';
import { TactileControls } from './components/TactileControls';
import { AsciiPixelEngine, AppState, ThemeMode } from './lib/asciiPixelEngine';
import { audioSynth } from './lib/audioSynth';

export function App() {
  const [theme, setTheme] = useState<ThemeMode>('WHITE');
  const [state, setState] = useState<AppState>('IDLE');
  const [tapeName, setTapeName] = useState<string>('NOTE_01');
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [audioBands, setAudioBands] = useState<number[]>([0.1, 0.2, 0.4, 0.6, 0.5, 0.3, 0.2, 0.1]);
  const [audioEnergy, setAudioEnergy] = useState<number>(0.08);

  // Singleton ASCII Pixel Swarm Engine
  const engine = useMemo(() => new AsciiPixelEngine(), []);
  const timerRef = useRef<number | null>(null);

  // Keyboard shortcuts 1-5 for instant state hopping, Z for 1.5x macro zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keys if typing in the note name input
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLInputElement).blur();
        }
        return;
      }

      switch (e.key) {
        case '1':
          audioSynth.playClick(800);
          setState('IDLE');
          break;
        case '2':
          audioSynth.playClick(950);
          setState('RECORDING');
          break;
        case '3':
          audioSynth.playClick(850);
          setState('TRANSCRIBED');
          break;
        case '4':
          audioSynth.playClick(1050);
          setState('PLAYING');
          break;
        case '5':
          audioSynth.playClick(900);
          setState('SAVING');
          break;
        case 'z':
        case 'Z':
          audioSynth.playClick(1200);
          setIsZoomed((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Timecode clock management
  useEffect(() => {
    if (state === 'RECORDING' || state === 'PLAYING') {
      const startTime = performance.now() - elapsedMs;
      timerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - startTime);
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
  }, [state]);

  // Read live audio telemetry for the VU meters
  useEffect(() => {
    const meterInterval = setInterval(() => {
      const now = performance.now() * 0.001;
      const isSim = state === 'RECORDING' || state === 'PLAYING' || !isMicActive;
      const data = audioSynth.getLiveAudioEnergy(now, isSim);
      setAudioEnergy(data.energy);
      setAudioBands(data.bands);
    }, 50);

    return () => clearInterval(meterInterval);
  }, [state, isMicActive]);

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

  // Trigger Tape Eject Routine
  const handleEject = () => {
    audioSynth.playEjectServo();
    engine.triggerEject(() => {
      setState('IDLE');
      setElapsedMs(0);
    });
  };

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

  const isWhite = theme === 'WHITE';

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-8 transition-colors duration-300 font-sans select-none ${
        isWhite ? 'bg-[#F5F5F7] text-[#1D1D1F]' : 'bg-[#050507] text-[#FAFAFA]'
      }`}
    >
      {/* Studio Workbench Header & Telemetry Pill */}
      <div className="w-full max-w-[390px] mb-3 flex items-center justify-between text-[11px] font-mono tracking-wider">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-xs ${isWhite ? 'bg-black' : 'bg-emerald-400'}`} />
          <span className="font-semibold text-zinc-600 dark:text-zinc-400">
            ASCII_PIXEL // 60×80
          </span>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleMicToggle}
            className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider font-semibold border transition-all cursor-pointer ${
              isMicActive
                ? 'bg-red-500/15 border-red-500/60 text-red-600'
                : isWhite
                ? 'bg-white border-black/8 text-zinc-600 hover:text-black shadow-xs'
                : 'bg-white/5 border-white/8 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {isMicActive ? 'MIC: LIVE' : 'MIC: SIM'}
          </button>

          <button
            onClick={handleMuteToggle}
            className={`px-2 py-1 rounded-full text-[10px] font-mono tracking-wider font-semibold border transition-all cursor-pointer ${
              isMuted
                ? 'bg-zinc-200/50 border-black/5 text-zinc-400'
                : isWhite
                ? 'bg-white border-black/8 text-zinc-800 hover:text-black shadow-xs'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
            }`}
            title="Toggle Web Audio Foley Clicks"
          >
            {isMuted ? 'FOLEY: OFF' : 'FOLEY: ON'}
          </button>

          {/* White vs Dark Theme Toggle */}
          <button
            onClick={() => setTheme((t) => (t === 'WHITE' ? 'DARK' : 'WHITE'))}
            className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-widest font-semibold border transition-all cursor-pointer ${
              isWhite
                ? 'bg-white border-black/8 text-zinc-800 hover:bg-zinc-100 shadow-xs'
                : 'bg-white/5 border-white/8 text-zinc-300 hover:bg-white/10'
            }`}
          >
            {isWhite ? 'WHITE' : 'DARK'}
          </button>
        </div>
      </div>

      {/* 390x844 MOBILE HARDWARE FRAME (Solid Matte Apple Chassis) */}
      <div
        className={`relative w-[390px] h-[844px] rounded-[48px] p-3 flex flex-col justify-between overflow-hidden transition-all duration-300 ${
          isWhite ? 'apple-frame-white' : 'apple-frame-dark'
        }`}
      >
        {/* TOP 2/3 (HEIGHT: 556PX): RECESSED ASCII PIXEL CANVAS (366x532px) */}
        <div
          className={`w-full h-[556px] rounded-[28px] p-3 flex flex-col justify-between transition-colors duration-200 ${
            isWhite ? 'white-card' : 'obsidian-card'
          }`}
        >
          {/* Inner Recessed 366x532px Canvas */}
          <div className="w-[366px] h-[532px] mx-auto overflow-hidden rounded-[16px]">
            <AsciiCanvas
              engine={engine}
              state={state}
              theme={theme}
              tapeName={tapeName}
              isZoomed={isZoomed}
              isSimulatingAudio={!isMicActive}
            />
          </div>
        </div>

        {/* BOTTOM 1/3 (HEIGHT: 264PX): THE TACTILE CONTROL PANEL */}
        <TactileControls
          state={state}
          theme={theme}
          timecode={formattedTimecode}
          tapeName={tapeName}
          setTapeName={setTapeName}
          onStateChange={(next) => setState(next)}
          onEject={handleEject}
          audioBands={audioBands}
          audioEnergy={audioEnergy}
        />
      </div>

      {/* Screen-Recording Quick Jump HUD */}
      <div className="w-full max-w-[390px] mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500 tracking-wider">
        <span>KEYS: 1:IDLE 2:REC 3:STOP 4:PLAY 5:SAVE</span>
        <button
          onClick={() => setIsZoomed((z) => !z)}
          className="hover:text-black dark:hover:text-white cursor-pointer transition-colors"
        >
          Z:ZOOM {isZoomed ? '[1.5×]' : '[1.0×]'}
        </button>
      </div>
    </div>
  );
}

export default App;
