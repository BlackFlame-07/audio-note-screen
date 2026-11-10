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
        return 'REC';
      case 'TRANSCRIBED':
        return 'TEXT';
      case 'PLAYING':
        return 'PLAY';
      case 'SAVING':
        return 'TAPE';
      case 'IDLE':
      default:
        return 'READY';
    }
  };

  const dbReadout =
    audioEnergy > 0.01 ? (-38 + audioEnergy * 32).toFixed(1) : '-48.0';

  return (
    <div className="w-full h-[264px] rounded-[28px] p-4 flex flex-col justify-between carbon-control-deck relative select-none">
      {/* 1. DARK CARBON BITMAP TELEMETRY HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          {/* Status Indicator Capsule */}
          <div className="px-2 py-0.5 rounded-md flex items-center gap-1.5 bg-[#141418] border border-white/10">
            <span
              className={`w-1.5 h-1.5 rounded-xs transition-all duration-300 ${
                state === 'RECORDING'
                  ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                  : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]'
              }`}
            />
            <span className="text-[9px] font-pixel tracking-widest text-[#EEEEEE] uppercase">
              {getStateLabel()}
            </span>
          </div>
        </div>

        {/* Technical Wireframe Tab Line with White Pill Indicator */}
        <div className="flex-1 mx-3 h-[1px] bg-white/10 relative overflow-hidden">
          <motion.span
            animate={{
              left:
                state === 'RECORDING'
                  ? '10%'
                  : state === 'TRANSCRIBED'
                  ? '35%'
                  : state === 'PLAYING'
                  ? '62%'
                  : state === 'SAVING'
                  ? '88%'
                  : '2%',
            }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="absolute top-0 w-4 h-[1px] bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]"
          />
        </div>

        {/* Tabular Timecode */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase font-pixel tracking-wider text-zinc-500">
            TC
          </span>
          <span className="text-xs font-mono font-bold tabular-nums tracking-widest text-white">
            {timecode}
          </span>
        </div>
      </div>

      {/* 2. DYNAMIC CONTEXT BAR */}
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
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-pixel text-zinc-400">
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
                  className="w-full pl-14 pr-3 py-2 text-[10px] font-pixel tracking-wider uppercase rounded-xl border border-white/12 bg-[#141418] text-[#EEEEEE] outline-none focus:border-white/40"
                />
              </div>

              {/* Active Halation Eject Button (Matching reference checkbox style) */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleEjectClick}
                className="px-4 py-2 rounded-xl text-[10px] font-pixel tracking-wider font-bold bg-[#E2E2E6] hover:bg-white text-[#0C0C0E] shadow-[0_0_16px_rgba(255,255,255,0.22)] flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              >
                <span>EJECT</span>
                <span className="text-xs">→</span>
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="meter-drawer"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16 }}
              className="w-full h-full rounded-2xl p-2.5 flex flex-col justify-between bg-[#131317] border border-white/8"
            >
              {/* Frequency Spectrum / dB VU Bars */}
              <div className="flex items-end justify-between gap-1.5 h-6 px-1">
                {(audioBands.length ? audioBands : [0.1, 0.2, 0.4, 0.7, 0.5, 0.3, 0.2, 0.1]).map(
                  (val, idx) => {
                    const heightPercent = Math.max(12, Math.min(100, val * 100));
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-xs transition-all duration-75 ${
                          val > 0.75
                            ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]'
                            : val > 0.4
                            ? 'bg-[#82828C]'
                            : 'bg-[#272730]'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    );
                  }
                )}
              </div>

              {/* Status Meta Row */}
              <div className="flex items-center justify-between text-[8px] font-pixel tracking-widest px-1 text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-xs bg-white inline-block shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                  60×80 BITMAP // 4,800 PX
                </span>
                <span>LEVEL: {dbReadout} dBFS</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. TACTILE HARDWARE KEYS (Matching reference checkbox & task buttons) */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/8">
        {/* [ REC ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('RECORDING')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all cursor-pointer relative ${
            state === 'RECORDING' ? 'carbon-key-active-rec' : 'carbon-key-idle'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-xs ${
              state === 'RECORDING' ? 'bg-white animate-ping' : 'bg-red-500'
            }`}
          />
          <span className="uppercase">REC</span>
        </motion.button>

        {/* [ STOP ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('TRANSCRIBED')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all cursor-pointer relative ${
            state === 'TRANSCRIBED' ? 'carbon-key-active' : 'carbon-key-idle'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-xs ${
              state === 'TRANSCRIBED' ? 'bg-[#0C0C0E]' : 'bg-zinc-400'
            }`}
          />
          <span className="uppercase">STOP</span>
        </motion.button>

        {/* [ PLAY ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('PLAYING')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all cursor-pointer relative ${
            state === 'PLAYING' ? 'carbon-key-active' : 'carbon-key-idle'
          }`}
        >
          <span className="text-[10px] leading-none">►</span>
          <span className="uppercase">PLAY</span>
        </motion.button>

        {/* [ SAVE ] */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleKeyPress('SAVING')}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all cursor-pointer relative ${
            state === 'SAVING' ? 'carbon-key-active' : 'carbon-key-idle'
          }`}
        >
          <span className="text-[10px] leading-none">💾</span>
          <span className="uppercase">SAVE</span>
        </motion.button>
      </div>
    </div>
  );
};
