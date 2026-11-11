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

    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        engine.markCharLayoutDirty();
      });
    }

    const renderLoop = (now: number) => {
      const needVocalCadence = isSimulatingAudio || state === 'PLAYING';
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

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (state === 'TRANSCRIBED') {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      
      let clickedLine = -1;
      if (Math.abs(clickY - 145) < 26) clickedLine = 0;
      else if (Math.abs(clickY - 223) < 20) clickedLine = 1;
      else if (Math.abs(clickY - 263) < 20) clickedLine = 2;
      else if (Math.abs(clickY - 303) < 20) clickedLine = 3;
      else if (Math.abs(clickY - 343) < 20) clickedLine = 4;

      if (clickedLine >= 0) {
        engine.seekToLine(clickedLine);
        audioSynth.playClick(960);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-[366px] h-[532px] rounded-[16px] overflow-hidden carbon-canvas-well"
    >
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="block w-full h-full cursor-pointer select-none"
      />

      {/* Technical Wireframe Corner Registration Marks */}
      <div className={`pointer-events-none absolute top-2.5 left-2.5 text-[8px] font-pixel select-none transition-colors ${theme === 'WHITE' ? 'text-zinc-400' : 'text-zinc-700'}`}>
        + 50×72
      </div>
      <div className={`pointer-events-none absolute top-2.5 right-2.5 text-[8px] font-pixel select-none transition-colors ${theme === 'WHITE' ? 'text-zinc-400' : 'text-zinc-700'}`}>
        HALFTONE +
      </div>
      <div className={`pointer-events-none absolute bottom-2.5 left-2.5 text-[8px] font-pixel select-none transition-colors ${theme === 'WHITE' ? 'text-zinc-400' : 'text-zinc-700'}`}>
        + 60FPS
      </div>
      <div className={`pointer-events-none absolute bottom-2.5 right-2.5 text-[8px] font-pixel select-none transition-colors ${theme === 'WHITE' ? 'text-zinc-400' : 'text-zinc-700'}`}>
        FLUID +
      </div>

      {/* 1.5x Macro Zoom Pill */}
      {isZoomed && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[8px] font-pixel tracking-widest uppercase bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.4)]">
          1.5× ZOOM ACTIVE [Z]
        </div>
      )}
    </div>
  );
};
