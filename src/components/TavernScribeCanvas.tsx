import React, { useEffect, useRef } from 'react';
import { TavernPixelWorld, TavernState } from '../lib/tavernPixelWorld';

interface TavernScribeCanvasProps {
  isSpeaking: boolean;
  audioEnergy: number;
  audioBands: number[];
  onCanvasClick?: () => void;
  onTriggerComment?: () => void;
}

export const TavernScribeCanvas: React.FC<TavernScribeCanvasProps> = ({
  isSpeaking,
  audioEnergy,
  audioBands,
  onCanvasClick,
  onTriggerComment,
}) => {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TavernPixelWorld | null>(null);
  const stateRef = useRef<TavernState>({ isSpeaking, audioEnergy });

  // Keep stateRef up to date without re-triggering the loop
  useEffect(() => {
    stateRef.current = { isSpeaking, audioEnergy };
  }, [isSpeaking, audioEnergy]);

  // Instantiate engine ONCE and run continuous 60fps loop
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new TavernPixelWorld();
    }
    const engine = engineRef.current;

    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    canvas.width = TavernPixelWorld.W * 2;
    canvas.height = TavernPixelWorld.H * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Update engine with current live state
      engine.update(dt, stateRef.current);

      // Render pixel art frame
      const art = engine.render();

      // Blit to display canvas at crisp 2x scale
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(art, 0, 0, canvas.width, canvas.height);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  // Click on tavern canvas to trigger patron comment Easter egg
  const handleClick = () => {
    if (engineRef.current) {
      engineRef.current.triggerRandomComment();
    }
    if (onCanvasClick) onCanvasClick();
    if (onTriggerComment) onTriggerComment();
  };

  return (
    <div className="relative flex flex-col shrink-0 w-full overflow-hidden rounded-2xl border-2 border-[#543b23] bg-[#0c0d18] shadow-[0_8px_32px_rgba(0,0,0,0.85)]">
      {/* Tavern Bezel Header */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#3d2918] bg-gradient-to-r from-[#21140c] via-[#331e12] to-[#21140c] px-3.5 text-[10px] font-mono tracking-wider text-[#d4a02c]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f39c12] shadow-[0_0_8px_#f39c12]" />
          <span className="font-semibold uppercase text-[#fef1cb]">YE OLDE CHRONICLER'S BAR</span>
        </div>
        <div className="flex items-center gap-2 text-[#a69989]">
          <span className="text-[9px] text-[#f3aa57]">
            {isSpeaking ? '✍️ SCRIBING' : '👁 LISTENING'}
          </span>
          <span className="hidden sm:inline text-[#796e62]">|</span>
          <span className="hidden sm:inline text-[#879bc4]">NIGHTFALL</span>
        </div>
      </div>

      {/* Main Pixel Canvas Viewport */}
      <div className="relative w-full shrink-0 cursor-pointer bg-[#05050c]" style={{ height: '176px' }}>
        <canvas
          ref={displayCanvasRef}
          onClick={handleClick}
          title="Click tavern patrons to hear their comments!"
          className="h-full w-full object-contain [image-rendering:pixelated]"
          style={{ imageRendering: 'pixelated', width: '100%', height: '100%' }}
        />

        {/* Subtle Candlelight Vignette Overlay */}
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(5,5,12,0.7)]" />
      </div>

      {/* Audio Reactive VU Meter Bar */}
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-[#3d2918] bg-[#16100a] px-3">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono font-medium uppercase tracking-widest text-[#a69989]">
            VOICE FREQ
          </span>
        </div>

        {/* 16 Pixel VU Meter Bars */}
        <div className="flex items-end gap-[3px] h-3.5">
          {audioBands.slice(0, 16).map((band, idx) => {
            const heightPct = Math.max(15, Math.min(100, Math.round(band * 100)));
            const isHigh = heightPct > 70;
            const isMid = heightPct > 40;
            const barBg = isSpeaking
              ? isHigh
                ? '#ea7462'
                : isMid
                ? '#f3aa57'
                : '#6fd1ab'
              : '#36302a';

            return (
              <div
                key={idx}
                className="w-1.5 rounded-xs transition-all duration-75"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: barBg,
                  boxShadow: isSpeaking && isMid ? `0 0 6px ${barBg}` : 'none',
                }}
              />
            );
          })}
        </div>

        <div className="text-[10px] font-mono text-[#ab6630]">
          {isSpeaking ? `${Math.round(audioEnergy * 100)}% VOL` : 'CALM'}
        </div>
      </div>
    </div>
  );
};
