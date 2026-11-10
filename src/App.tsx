import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AsciiCanvas } from './components/AsciiCanvas';
import { TactileControls } from './components/TactileControls';
import { AsciiPixelEngine, AppState, ThemeMode } from './lib/asciiPixelEngine';
import { audioSynth } from './lib/audioSynth';

export function App() {
  const [theme, setTheme] = useState<ThemeMode>('DARK');
  const [state, setState] = useState<AppState>('TRANSCRIBED');
  const [tapeName, setTapeName] = useState<string>('NOTE_01');
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(14820); // 00:14.82 default
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
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[#070709] text-[#E4E4E7] font-pixel select-none relative">
      {/* Background Registration Crosshairs */}
      <div className="pointer-events-none fixed top-4 left-4 text-[9px] text-white/20 select-none">
        +
      </div>
      <div className="pointer-events-none fixed top-4 right-4 text-[9px] text-white/20 select-none">
        +
      </div>
      <div className="pointer-events-none fixed bottom-4 left-4 text-[9px] text-white/20 select-none">
        +
      </div>
      <div className="pointer-events-none fixed bottom-4 right-4 text-[9px] text-white/20 select-none">
        +
      </div>

      {/* Top Telemetry & Control Bar */}
      <div className="w-full max-w-[390px] mb-2.5 flex items-center justify-between text-[10px] text-zinc-400 tracking-wider">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-white rounded-none shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
          <span className="font-bold text-zinc-300">
            TERMINAL // 60×80
          </span>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleMicToggle}
            className={`px-2 py-0.5 rounded-none text-[9px] font-pixel border transition-all cursor-pointer ${
              isMicActive
                ? 'bg-red-500/20 border-red-500 text-red-400'
                : 'bg-white/5 border-white/15 text-zinc-400 hover:text-white'
            }`}
          >
            {isMicActive ? 'MIC: LIVE' : 'MIC: SIM'}
          </button>

          <button
            onClick={handleMuteToggle}
            className={`px-2 py-0.5 rounded-none text-[9px] font-pixel border transition-all cursor-pointer ${
              isMuted
                ? 'bg-white/5 border-white/10 text-zinc-600'
                : 'bg-white/10 border-white/20 text-white'
            }`}
            title="Toggle Web Audio Foley Clicks"
          >
            {isMuted ? 'FOLEY: OFF' : 'FOLEY: ON'}
          </button>

          <button
            onClick={() => setTheme((t) => (t === 'WHITE' ? 'DARK' : 'WHITE'))}
            className="px-2 py-0.5 rounded-none text-[9px] font-pixel border border-white/15 bg-white/5 text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            {theme}
          </button>
        </div>
      </div>

      {/* 390x844 MOBILE CHASSIS (1-Bit Industrial Pixel Hardware Frame) */}
      <div className="relative w-[390px] h-[844px] rounded-[36px] p-3 flex flex-col justify-between overflow-hidden terminal-chassis">
        {/* TOP 2/3 (HEIGHT: 530PX): RECESSED ASCII PIXEL DISPLAY WELL */}
        <div className="w-full h-[526px] rounded-[20px] p-2 flex flex-col justify-between terminal-screen-well relative">
          {/* Inner Recessed 366x510px Canvas */}
          <div className="w-[366px] h-[510px] mx-auto overflow-hidden rounded-[14px]">
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

        {/* BOTTOM 1/3 (HEIGHT: 286PX): TACTICAL 1-BIT TASK & TRANSPORT DOCK */}
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
      <div className="w-full max-w-[390px] mt-2.5 flex items-center justify-between text-[10px] text-zinc-500 tracking-wider">
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
