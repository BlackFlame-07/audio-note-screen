import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AsciiCanvas } from './components/AsciiCanvas';
import { TactileControls } from './components/TactileControls';
import { AsciiPixelEngine, AppState, ThemeMode } from './lib/asciiPixelEngine';
import { audioSynth } from './lib/audioSynth';

export function App() {
  const [theme, setTheme] = useState<ThemeMode>('DARK');
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

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-8 bg-[#0C0C0E] text-[#EEEEEE] font-pixel select-none technical-grid relative">
      {/* Studio Workbench Header & Telemetry Pill */}
      <div className="w-full max-w-[390px] mb-3 flex items-center justify-between text-[9px] tracking-widest text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-white rounded-xs shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          <span className="font-pixel text-[#EEEEEE]">
            ASCII_PIXEL // 60×80
          </span>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleMicToggle}
            className={`px-2 py-0.5 rounded-md text-[8.5px] font-pixel tracking-wider border transition-all cursor-pointer ${
              isMicActive
                ? 'bg-red-500/15 border-red-500/60 text-red-400'
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

      {/* 390x844 MOBILE HARDWARE FRAME (Dark Carbon Slate Chassis) */}
      <div className="relative w-[390px] h-[844px] rounded-[48px] p-3 flex flex-col justify-between overflow-hidden carbon-frame shadow-2xl">
        {/* Subtle Corner Crosshairs */}
        <div className="absolute top-3 left-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>
        <div className="absolute top-3 right-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>
        <div className="absolute bottom-3 left-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>
        <div className="absolute bottom-3 right-3 text-[8px] text-zinc-600 font-mono select-none pointer-events-none">+</div>

        {/* TOP 2/3 (HEIGHT: 556PX): RECESSED ASCII PIXEL CANVAS (366x532px) */}
        <div className="w-full h-[556px] rounded-[28px] p-3 flex flex-col justify-between carbon-card relative">
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
      <div className="w-full max-w-[390px] mt-3 flex items-center justify-between text-[9px] font-pixel text-zinc-500 tracking-wider">
        <span>KEYS: 1:IDLE 2:REC 3:STOP 4:PLAY 5:SAVE</span>
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
