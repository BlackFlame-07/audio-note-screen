import React, { useEffect, useRef } from 'react';
import { AsciiPixelEngine, AppState, ThemeMode } from '../lib/asciiPixelEngine';
import { audioSynth } from '../lib/audioSynth';

interface AsciiCanvasProps {
  engine: AsciiPixelEngine;
  state: AppState;
  theme: ThemeMode;
  tapeName: string;
  isZoomed: boolean;
  isSimulatingAudio: boolean;
}

export const AsciiCanvas: React.FC<AsciiCanvasProps> = ({
  engine,
  state,
  theme,
  tapeName,
  isZoomed,
  isSimulatingAudio,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    engine.theme = theme;
  }, [engine, theme]);

  useEffect(() => {
    engine.setState(state);
  }, [engine, state]);

  useEffect(() => {
    engine.tapeName = tapeName;
  }, [engine, tapeName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 2;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      engine.resize(w, h);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const renderLoop = (now: number) => {
      const needVocalCadence = state === 'RECORDING' || state === 'PLAYING' || isSimulatingAudio;
      const audioData = audioSynth.getLiveAudioEnergy(now * 0.001, needVocalCadence);

      engine.update(now, audioData.energy);
      engine.render(ctx, isZoomed);

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [engine, isZoomed, state, isSimulatingAudio]);

  const isWhite = theme === 'WHITE';

  return (
    <div
      ref={containerRef}
      className={`relative w-[366px] h-[532px] rounded-[16px] overflow-hidden transition-colors duration-200 ${
        isWhite ? 'white-canvas-well' : 'obsidian-canvas-well'
      }`}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair select-none"
      />

      {/* Hardware Corner Registration Marks */}
      <div
        className={`pointer-events-none absolute top-2 left-2 text-[8px] font-mono select-none ${
          isWhite ? 'text-zinc-400 opacity-60' : 'text-zinc-500 opacity-40'
        }`}
      >
        ┌ 60×80 BITMAP
      </div>
      <div
        className={`pointer-events-none absolute top-2 right-2 text-[8px] font-mono select-none ${
          isWhite ? 'text-zinc-400 opacity-60' : 'text-zinc-500 opacity-40'
        }`}
      >
        4,800 PIXELS ┐
      </div>
      <div
        className={`pointer-events-none absolute bottom-2 left-2 text-[8px] font-mono select-none ${
          isWhite ? 'text-zinc-400 opacity-60' : 'text-zinc-500 opacity-40'
        }`}
      >
        └ 60FPS SWARM
      </div>
      <div
        className={`pointer-events-none absolute bottom-2 right-2 text-[8px] font-mono select-none ${
          isWhite ? 'text-zinc-400 opacity-60' : 'text-zinc-500 opacity-40'
        }`}
      >
        RASTER ┘
      </div>

      {/* 1.5x Macro Zoom Pill */}
      {isZoomed && (
        <div
          className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-mono tracking-widest uppercase shadow-xs ${
            isWhite
              ? 'bg-black text-white'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
          }`}
        >
          1.5× MACRO ZOOM ACTIVE [Z]
        </div>
      )}
    </div>
  );
};
