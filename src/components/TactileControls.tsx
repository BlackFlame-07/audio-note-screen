import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState, ThemeMode } from '../lib/asciiPixelEngine';
import { audioSynth } from '../lib/audioSynth';

interface TactileControlsProps {
  state: AppState;
  theme: ThemeMode;
  timecode: string;
  tapeName: string;
  setTapeName: (val: string) => void;
  onStateChange: (nextState: AppState) => void;
  onEject: () => void;
  audioBands: number[];
  audioEnergy: number;
}

export const TactileControls: React.FC<TactileControlsProps> = ({
  state,
  timecode,
  tapeName,
  setTapeName,
  onStateChange,
  onEject,
  audioEnergy,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state === 'SAVING' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [state]);

  const handleKeyPress = (targetState: AppState) => {
    audioSynth.playClick(850);
    onStateChange(targetState);
  };

  const handleEjectClick = () => {
    audioSynth.playClick(1100);
    onEject();
  };

  // Tab selection index for the slider indicator
  const getTabCol = () => {
    switch (state) {
      case 'RECORDING':
        return 0;
      case 'TRANSCRIBED':
        return 1;
      case 'PLAYING':
        return 2;
      case 'SAVING':
        return 3;
      default:
        return 0;
    }
  };

  const dbReadout =
    audioEnergy > 0.01 ? (-38 + audioEnergy * 32).toFixed(1) : '-48.0';

  return (
    <div className="w-full h-[286px] rounded-[24px] p-4 flex flex-col justify-between terminal-control-deck font-pixel select-none relative overflow-hidden">
      {/* Top Background Registration Crosshair */}
      <div className="pointer-events-none absolute top-2 left-2 text-[8px] text-white/20 select-none">
        +
      </div>

      {/* 1. HEADER & MODE TABS (Direct match to screenshot) */}
      <div className="w-full flex flex-col pt-0.5">
        <div className="flex items-center justify-between text-xs tracking-wider text-zinc-100 font-bold mb-1">
          <span>My Tasks</span>
          <span className="text-[10px] text-zinc-400 font-mono tracking-widest tabular-nums">
            {timecode}
          </span>
        </div>

        {/* Tab Row: Upcoming, Overdue, Completed (or Transport aliases) */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 tracking-wide pt-1">
          <button
            onClick={() => handleKeyPress('RECORDING')}
            className={`cursor-pointer transition-colors ${
              state === 'RECORDING' ? 'text-white font-bold' : 'hover:text-zinc-200'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => handleKeyPress('TRANSCRIBED')}
            className={`cursor-pointer transition-colors ${
              state === 'TRANSCRIBED' ? 'text-white font-bold' : 'hover:text-zinc-200'
            }`}
          >
            Overdue
          </button>
          <button
            onClick={() => handleKeyPress('PLAYING')}
            className={`cursor-pointer transition-colors ${
              state === 'PLAYING' ? 'text-white font-bold' : 'hover:text-zinc-200'
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => handleKeyPress('SAVING')}
            className={`cursor-pointer transition-colors ${
              state === 'SAVING' ? 'text-white font-bold' : 'hover:text-zinc-200'
            }`}
          >
            Archived
          </button>
        </div>

        {/* Hairline Track with Animated Slider Notch */}
        <div className="relative w-full h-[1px] bg-white/12 mt-2 mb-2.5">
          <motion.div
            className="absolute -top-[1px] h-[3px] w-6 bg-white rounded-xs shadow-[0_0_8px_rgba(255,255,255,0.7)]"
            animate={{
              left: `${getTabCol() * 26 + 2}%`,
            }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          />
        </div>
      </div>

      {/* 2. 4 TACTICAL 1-BIT TASK ROWS (Matching screenshot iconography & styling) */}
      <div className="flex flex-col gap-2 flex-1 justify-center">
        {/* ROW 1: [ + ] Create Task / Start Recording */}
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={() => handleKeyPress('RECORDING')}
          className="flex items-center justify-between py-1 px-1 rounded-sm cursor-pointer group hover:bg-white/4 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-7 h-7 flex items-center justify-center transition-all ${
                state === 'RECORDING'
                  ? 'pixel-box-active shadow-xs'
                  : 'pixel-box-idle'
              } relative`}
            >
              {/* Corner brackets */}
              {state !== 'RECORDING' && (
                <>
                  <span className="absolute -top-[1px] -left-[1px] w-1 h-1 border-t border-l border-white/50" />
                  <span className="absolute -top-[1px] -right-[1px] w-1 h-1 border-t border-r border-white/50" />
                  <span className="absolute -bottom-[1px] -left-[1px] w-1 h-1 border-b border-l border-white/50" />
                  <span className="absolute -bottom-[1px] -right-[1px] w-1 h-1 border-b border-r border-white/50" />
                </>
              )}
              {state === 'RECORDING' ? (
                <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-ping" />
              ) : (
                <span className="text-xs leading-none font-bold text-zinc-300">+</span>
              )}
            </div>

            <span
              className={`text-xs tracking-wider transition-colors ${
                state === 'RECORDING'
                  ? 'text-white font-bold'
                  : 'text-zinc-300 group-hover:text-white'
              }`}
            >
              {state === 'RECORDING' ? 'Recording live voice memo...' : 'Create Task'}
            </span>
          </div>

          <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
            {state === 'RECORDING' ? `${dbReadout} dBFS` : 'REC'}
          </span>
        </motion.div>

        {/* ROW 2: [ ✓ ] Write Q1 product roadmap (Checked solid block + strikethrough) */}
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={() => handleKeyPress('TRANSCRIBED')}
          className="flex items-center justify-between py-1 px-1 rounded-sm cursor-pointer group hover:bg-white/4 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-7 h-7 flex items-center justify-center transition-all ${
                state === 'TRANSCRIBED'
                  ? 'pixel-box-active shadow-xs'
                  : 'pixel-box-idle'
              } relative`}
            >
              {state === 'TRANSCRIBED' ? (
                /* 1-bit pixel checkmark */
                <svg
                  className="w-3.5 h-3.5 stroke-[2.5]"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M3 8.5L6.5 12L13 4" strokeLinecap="square" strokeLinejoin="miter" />
                </svg>
              ) : (
                <>
                  <span className="absolute -top-[1px] -left-[1px] w-1 h-1 border-t border-l border-white/40" />
                  <span className="absolute -top-[1px] -right-[1px] w-1 h-1 border-t border-r border-white/40" />
                  <span className="absolute -bottom-[1px] -left-[1px] w-1 h-1 border-b border-l border-white/40" />
                  <span className="absolute -bottom-[1px] -right-[1px] w-1 h-1 border-b border-r border-white/40" />
                  <span className="text-[10px] text-zinc-500">✓</span>
                </>
              )}
            </div>

            <span
              className={`text-xs tracking-wider transition-all ${
                state === 'TRANSCRIBED'
                  ? 'line-through text-zinc-300 font-bold decoration-white/70 decoration-1'
                  : 'text-zinc-300 group-hover:text-white'
              }`}
            >
              Write Q1 product roadmap
            </span>
          </div>

          <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
            {state === 'TRANSCRIBED' ? 'DONE' : 'STOP'}
          </span>
        </motion.div>

        {/* ROW 3: [ ◌ ] Call supplier (Clock/Metronome icon -> Playback) */}
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={() => handleKeyPress('PLAYING')}
          className="flex items-center justify-between py-1 px-1 rounded-sm cursor-pointer group hover:bg-white/4 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-7 h-7 flex items-center justify-center transition-all ${
                state === 'PLAYING'
                  ? 'pixel-box-active shadow-xs'
                  : 'pixel-box-idle'
              } relative`}
            >
              {state === 'PLAYING' ? (
                <span className="text-xs leading-none font-bold">►</span>
              ) : (
                <>
                  <span className="absolute -top-[1px] -left-[1px] w-1 h-1 border-t border-l border-white/40" />
                  <span className="absolute -top-[1px] -right-[1px] w-1 h-1 border-t border-r border-white/40" />
                  <span className="absolute -bottom-[1px] -left-[1px] w-1 h-1 border-b border-l border-white/40" />
                  <span className="absolute -bottom-[1px] -right-[1px] w-1 h-1 border-b border-r border-white/40" />
                  <span className="text-[11px] text-zinc-400">◌</span>
                </>
              )}
            </div>

            <span
              className={`text-xs tracking-wider transition-colors ${
                state === 'PLAYING'
                  ? 'text-white font-bold'
                  : 'text-zinc-300 group-hover:text-white'
              }`}
            >
              {state === 'PLAYING' ? 'Playing synth harmonics...' : 'Call supplier'}
            </span>
          </div>

          <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
            {state === 'PLAYING' ? timecode : 'PLAY'}
          </span>
        </motion.div>

        {/* ROW 4: [ ✎ ] Prepare design mockups (Pencil icon -> Save/Cassette) */}
        <div className="flex items-center justify-between py-1 px-1 rounded-sm">
          <div className="flex items-center gap-3 flex-1 mr-2">
            <button
              onClick={() => handleKeyPress('SAVING')}
              className={`w-7 h-7 flex items-center justify-center transition-all cursor-pointer ${
                state === 'SAVING'
                  ? 'pixel-box-active shadow-xs'
                  : 'pixel-box-idle'
              } relative shrink-0`}
            >
              {state === 'SAVING' ? (
                <span className="text-xs leading-none font-bold">💾</span>
              ) : (
                <>
                  <span className="absolute -top-[1px] -left-[1px] w-1 h-1 border-t border-l border-white/40" />
                  <span className="absolute -top-[1px] -right-[1px] w-1 h-1 border-t border-r border-white/40" />
                  <span className="absolute -bottom-[1px] -left-[1px] w-1 h-1 border-b border-l border-white/40" />
                  <span className="absolute -bottom-[1px] -right-[1px] w-1 h-1 border-b border-r border-white/40" />
                  <span className="text-[10px] text-zinc-400">✎</span>
                </>
              )}
            </button>

            {state === 'SAVING' ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={10}
                  value={tapeName}
                  onChange={(e) => setTapeName(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleEjectClick();
                    }
                  }}
                  placeholder="NOTE_01"
                  className="w-full bg-[#18181D] border border-white/20 px-2 py-0.5 text-xs text-white font-pixel outline-none focus:border-white uppercase"
                />
                <button
                  onClick={handleEjectClick}
                  className="px-2 py-0.5 bg-white hover:bg-zinc-200 text-black font-pixel text-[10px] font-bold cursor-pointer whitespace-nowrap"
                >
                  EJECT →
                </button>
              </div>
            ) : (
              <span
                onClick={() => handleKeyPress('SAVING')}
                className="text-xs text-zinc-300 hover:text-white cursor-pointer tracking-wider transition-colors"
              >
                Prepare design mockups
              </span>
            )}
          </div>

          {state !== 'SAVING' && (
            <span
              onClick={() => handleKeyPress('SAVING')}
              className="text-[9px] font-mono text-zinc-500 tracking-wider cursor-pointer"
            >
              SAVE
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
