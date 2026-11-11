import React from 'react';
import { motion } from 'motion/react';
import { AppState, ThemeMode } from '../lib/asciiPixelEngine';

interface TactileControlsProps {
  state: AppState;
  isRecordingPaused: boolean;
  isPlaying: boolean;
  isTranscribing: boolean;
  theme: ThemeMode;
  timecode: string;
  onToggleRecord: () => void;
  onTranscribe: () => void;
  onTogglePlay: () => void;
  onClear: () => void;
  audioBands: number[];
  audioEnergy: number;
}

export const TactileControls: React.FC<TactileControlsProps> = ({
  state,
  isRecordingPaused,
  isPlaying,
  isTranscribing,
  theme,
  timecode,
  onToggleRecord,
  onTranscribe,
  onTogglePlay,
  onClear,
  audioBands,
  audioEnergy,
}) => {
  const isWhite = theme === 'WHITE';

  const getStateLabel = () => {
    if (isTranscribing) return 'TRANSCRIBING';
    if (state === 'RECORDING') {
      return isRecordingPaused ? 'REC PAUSED' : 'RECORDING';
    }
    if (state === 'TRANSCRIBED') return 'TRANSCRIBED';
    if (state === 'PLAYING') return 'PLAYING';
    return 'READY';
  };

  const dbReadout =
    audioEnergy > 0.01 && state === 'RECORDING' && !isRecordingPaused
      ? (-38 + audioEnergy * 32).toFixed(1)
      : '-48.0';

  const canTranscribe = state === 'RECORDING' || isTranscribing;
  const canPlay = state === 'TRANSCRIBED' || state === 'PLAYING';

  return (
    <div className="w-full h-[264px] rounded-[28px] p-4 flex flex-col justify-between carbon-control-deck relative select-none">
      {/* 1. ULTRA-MINIMAL MONOCHROME TELEMETRY HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          {/* Status Indicator Capsule */}
          <div className="px-2 py-0.5 rounded-md flex items-center gap-1.5 bg-[#141418] border border-white/10">
            <span
              className={`w-1.5 h-1.5 rounded-xs transition-all duration-300 ${
                state === 'RECORDING' && !isRecordingPaused
                  ? 'bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.95)]'
                  : isTranscribing
                  ? 'bg-white animate-ping shadow-[0_0_8px_rgba(255,255,255,0.95)]'
                  : 'bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.6)]'
              }`}
            />
            <span className="text-[9px] font-pixel tracking-widest text-[#EEEEEE] uppercase">
              {getStateLabel()}
            </span>
          </div>
        </div>

        {/* Technical Wireframe Tab Line */}
        <div className="flex-1 mx-3 h-[1px] bg-white/10 relative overflow-hidden">
          <motion.span
            animate={{
              left:
                state === 'RECORDING'
                  ? '12%'
                  : isTranscribing
                  ? '38%'
                  : state === 'TRANSCRIBED'
                  ? '62%'
                  : state === 'PLAYING'
                  ? '86%'
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

      {/* 2. DYNAMIC CONTEXT SPECTRUM / TELEMETRY DRAWER */}
      <div className="relative h-[68px] flex items-center justify-center overflow-hidden">
        <div className="w-full h-full rounded-2xl p-2.5 flex flex-col justify-between bg-[#131317] border border-white/8">
          {/* Frequency Spectrum / dB VU Bars (Monochrome: White & Graphite) */}
          <div className="flex items-end justify-between gap-1.5 h-6 px-1">
            {(audioBands.length ? audioBands : [0.1, 0.2, 0.4, 0.7, 0.5, 0.3, 0.2, 0.1]).map(
              (val, idx) => {
                const heightPercent = Math.max(12, Math.min(100, val * 100));
                const isActive = state === 'RECORDING' && !isRecordingPaused;
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-xs transition-all duration-75 ${
                      isActive && val > 0.70
                        ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]'
                        : isActive && val > 0.35
                        ? 'bg-[#A1A1AA]'
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
              50×72 OLED MATRIX
            </span>
            <span>LEVEL: {dbReadout} dBFS</span>
          </div>
        </div>
      </div>

      {/* 3. LEAN TACTILE HARDWARE KEYS: [ REC/PAUSE ] [ TRANSCRIBE ] [ PLAY ] [ CLEAR ] */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/8">
        {/* KEY 1: MERGED [ REC / PAUSE ] BUTTON */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onToggleRecord}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all cursor-pointer relative ${
            state === 'RECORDING' && !isRecordingPaused
              ? 'carbon-key-active shadow-[0_0_14px_rgba(255,255,255,0.35)]'
              : state === 'RECORDING' && isRecordingPaused
              ? 'bg-white/10 border border-white/40 text-white'
              : 'carbon-key-idle'
          }`}
          title="Start / Pause Recording"
        >
          {state !== 'RECORDING' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
              <span className="uppercase">REC</span>
            </>
          ) : isRecordingPaused ? (
            <>
              <span className="text-[10px] leading-none text-white font-bold">►</span>
              <span className="uppercase">RESUME</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-2.5 bg-[#0C0C0E] rounded-xs" />
                <span className="w-1 h-2.5 bg-[#0C0C0E] rounded-xs" />
              </span>
              <span className="uppercase text-[#0C0C0E] font-bold">PAUSE</span>
            </>
          )}
        </motion.button>

        {/* KEY 2: [ TRANSCRIBE ] BUTTON */}
        <motion.button
          whileTap={canTranscribe ? { scale: 0.96 } : {}}
          onClick={canTranscribe ? onTranscribe : undefined}
          disabled={!canTranscribe}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all relative ${
            isTranscribing
              ? 'carbon-key-active shadow-[0_0_14px_rgba(255,255,255,0.4)] cursor-pointer'
              : canTranscribe
              ? 'carbon-key-idle hover:bg-white/10 border-white/20 cursor-pointer'
              : 'opacity-30 cursor-not-allowed border-white/5 bg-[#141418] text-zinc-600'
          }`}
          title="Transform pixels into text line-by-line"
        >
          <span className="text-[11px] leading-none font-bold">▤</span>
          <span className="uppercase">TRANSCRIBE</span>
        </motion.button>

        {/* KEY 3: [ PLAY / PAUSE ] BUTTON (Replaces old stop mode) */}
        <motion.button
          whileTap={canPlay ? { scale: 0.96 } : {}}
          onClick={canPlay ? onTogglePlay : undefined}
          disabled={!canPlay}
          className={`h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all relative ${
            isPlaying
              ? 'carbon-key-active shadow-[0_0_14px_rgba(255,255,255,0.4)] cursor-pointer'
              : canPlay
              ? 'carbon-key-idle hover:bg-white/10 border-white/20 cursor-pointer'
              : 'opacity-30 cursor-not-allowed border-white/5 bg-[#141418] text-zinc-600'
          }`}
          title="Play voice note with letter-by-letter glowing halation"
        >
          {isPlaying ? (
            <>
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-2.5 bg-[#0C0C0E] rounded-xs" />
                <span className="w-1 h-2.5 bg-[#0C0C0E] rounded-xs" />
              </span>
              <span className="uppercase text-[#0C0C0E] font-bold">PAUSE</span>
            </>
          ) : (
            <>
              <span className="text-[10px] leading-none">►</span>
              <span className="uppercase">PLAY</span>
            </>
          )}
        </motion.button>

        {/* KEY 4: [ CLEAR / NEW ] BUTTON */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onClear}
          className="h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider transition-all cursor-pointer relative carbon-key-idle hover:bg-white/10"
          title="Clear screen and start fresh"
        >
          <span className="text-[11px] leading-none font-bold">↺</span>
          <span className="uppercase">CLEAR</span>
        </motion.button>
      </div>
    </div>
  );
};
