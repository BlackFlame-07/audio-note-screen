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
  theme,
  timecode,
  tapeName,
  setTapeName,
  onStateChange,
  onEject,
  audioBands,
  audioEnergy,
}) => {
  const isWhite = theme === 'WHITE';
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

  const getStateLabel = () => {
    switch (state) {
      case 'RECORDING':
        return 'RECORDING';
      case 'TRANSCRIBED':
        return 'TRANSCRIBED';
      case 'PLAYING':
        return 'PLAYBACK';
      case 'SAVING':
        return 'CASSETTE';
      case 'IDLE':
      default:
        return 'STANDBY';
    }
  };

  const dbReadout =
    audioEnergy > 0.01 ? (-38 + audioEnergy * 32).toFixed(1) : '-48.0';

  return (
    <div
      className={`w-full h-[264px] rounded-[28px] p-4 flex flex-col justify-between transition-colors duration-200 ${
        isWhite ? 'white-control-deck' : 'obsidian-card'
      }`}
    >
      {/* 1. APPLE HIG TELEMETRY HEADER ROW */}
      <div className={`flex items-center justify-between pb-2 border-b ${
        isWhite ? 'border-black/6' : 'border-white/8'
      }`}>
        <div className="flex items-center gap-2">
          {/* Status Indicator Capsule */}
          <div
            className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-colors ${
              isWhite ? 'bg-[#F5F5F7] border border-black/8' : 'bg-white/5 border border-white/8'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                state === 'RECORDING'
                  ? 'bg-red-500 animate-pulse'
                  : state === 'PLAYING' || state === 'SAVING'
                  ? isWhite
                    ? 'bg-black animate-pulse'
                    : 'bg-emerald-400 animate-pulse'
                  : 'bg-zinc-400'
              }`}
            />
            <span
              className={`text-[10px] font-mono tracking-widest font-semibold uppercase ${
                isWhite ? 'text-[#1D1D1F]' : 'text-zinc-300'
              }`}
            >
              {getStateLabel()}
            </span>
          </div>
        </div>

        {/* Tabular Timecode */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-medium">
            TC
          </span>
          <span
            className={`text-sm font-mono font-semibold tabular-nums tracking-wider ${
              isWhite ? 'text-[#1D1D1F]' : 'text-[#FAFAFA]'
            }`}
          >
            {timecode}
          </span>
        </div>
      </div>

      {/* 2. DYNAMIC CONTEXT BAR (Solid Flat Apple Surface, Zero Gradients) */}
      <div className="relative h-[68px] flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          {state === 'SAVING' ? (
            <motion.div
              key="save-drawer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="w-full flex items-center gap-2"
            >
              <div className="relative flex-1">
                <span
                  className={`absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-mono font-semibold tracking-wider ${
                    isWhite ? 'text-zinc-600' : 'text-zinc-400'
                  }`}
                >
                  NAME:
                </span>
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
                  className={`w-full pl-14 pr-3 py-2 text-xs font-mono tracking-wider uppercase rounded-xl border outline-none transition-all ${
                    isWhite
                      ? 'bg-white border-black/12 text-[#1D1D1F] focus:border-black'
                      : 'bg-[#141418] border-white/10 text-[#FAFAFA] focus:border-emerald-400'
                  }`}
                />
              </div>

              {/* Solid Apple HIG Action Button */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleEjectClick}
                className={`px-4 py-2 rounded-xl text-xs font-sans font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isWhite
                    ? 'bg-black hover:bg-zinc-800 text-white shadow-xs'
                    : 'bg-white hover:bg-zinc-200 text-black shadow-xs'
                }`}
              >
                <span>Eject Tape</span>
                <span className="text-[13px] leading-none">→</span>
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="meter-drawer"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16 }}
              className={`w-full h-full rounded-2xl p-2.5 flex flex-col justify-between transition-colors ${
                isWhite ? 'bg-white border border-black/8 shadow-xs' : 'bg-[#101014] border border-white/5'
              }`}
            >
              {/* Frequency Spectrum / dB VU Bars */}
              <div className="flex items-end justify-between gap-1.5 h-6 px-1">
                {(audioBands.length ? audioBands : [0.1, 0.2, 0.4, 0.7, 0.5, 0.3, 0.2, 0.1]).map(
                  (val, idx) => {
                    const heightPercent = Math.max(12, Math.min(100, val * 100));
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-sm transition-all duration-75 ${
                          isWhite
                            ? val > 0.75
                              ? 'bg-black'
                              : val > 0.4
                              ? 'bg-zinc-600'
                              : 'bg-zinc-200'
                            : val > 0.75
                            ? 'bg-emerald-400'
                            : val > 0.4
                            ? 'bg-zinc-400'
                            : 'bg-zinc-800'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    );
                  }
                )}
              </div>

              {/* Status Meta Row */}
              <div className="flex items-center justify-between text-[9px] font-mono tracking-wider px-1 text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                    isWhite ? 'bg-black' : 'bg-emerald-400'
                  }`} />
                  60×80 BITMAP // 4,800 PX
                </span>
                <span>LEVEL: {dbReadout} dBFS</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. APPLE HIG 4 TACTILE HARDWARE KEYS (Solid Surfaces, Zero Gradients) */}
      <div className={`grid grid-cols-4 gap-2 pt-2 border-t ${
        isWhite ? 'border-black/6' : 'border-white/8'
      }`}>
        {/* [ REC ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('RECORDING')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-sans text-xs font-semibold transition-all cursor-pointer ${
            state === 'RECORDING'
              ? 'bg-red-500 text-white border border-red-500 shadow-xs'
              : isWhite
              ? 'apple-key-idle-white'
              : 'apple-key-idle-dark'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              state === 'RECORDING' ? 'bg-white animate-ping' : 'bg-red-500'
            }`}
          />
          <span className="text-[10px] tracking-wider uppercase font-mono">REC</span>
        </motion.button>

        {/* [ STOP ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('TRANSCRIBED')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-sans text-xs font-semibold transition-all cursor-pointer ${
            state === 'TRANSCRIBED'
              ? isWhite
                ? 'bg-black text-white border border-black shadow-xs'
                : 'bg-white text-black border border-white shadow-xs'
              : isWhite
              ? 'apple-key-idle-white'
              : 'apple-key-idle-dark'
          }`}
        >
          <span className={`w-2 h-2 rounded-xs ${
            state === 'TRANSCRIBED'
              ? isWhite
                ? 'bg-white'
                : 'bg-black'
              : 'bg-zinc-400'
          }`} />
          <span className="text-[10px] tracking-wider uppercase font-mono">STOP</span>
        </motion.button>

        {/* [ PLAY ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('PLAYING')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-sans text-xs font-semibold transition-all cursor-pointer ${
            state === 'PLAYING'
              ? isWhite
                ? 'bg-black text-white border border-black shadow-xs'
                : 'bg-emerald-500 text-white border border-emerald-500 shadow-xs'
              : isWhite
              ? 'apple-key-idle-white'
              : 'apple-key-idle-dark'
          }`}
        >
          <span className="text-[11px] leading-none">►</span>
          <span className="text-[10px] tracking-wider uppercase font-mono">PLAY</span>
        </motion.button>

        {/* [ SAVE ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('SAVING')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-sans text-xs font-semibold transition-all cursor-pointer ${
            state === 'SAVING'
              ? isWhite
                ? 'bg-black text-white border border-black shadow-xs'
                : 'bg-emerald-500 text-white border border-emerald-500 shadow-xs'
              : isWhite
              ? 'apple-key-idle-white'
              : 'apple-key-idle-dark'
          }`}
        >
          <span className="text-[11px] leading-none">💾</span>
          <span className="text-[10px] tracking-wider uppercase font-mono">SAVE</span>
        </motion.button>
      </div>
    </div>
  );
};
