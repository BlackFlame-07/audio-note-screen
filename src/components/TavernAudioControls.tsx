import React, { useState, useEffect } from 'react';
import { tavernFoley } from '../lib/tavernFoley';

interface TavernAudioControlsProps {
  isSpeaking: boolean;
  onToggleSpeaking: () => void;
  onPlayPreset: (presetName: string, transcript: string) => void;
  onAudioScratch?: () => void;
  isMicActive: boolean;
  onToggleMic: () => void;
}

export const TavernAudioControls: React.FC<TavernAudioControlsProps> = ({
  isSpeaking,
  onToggleSpeaking,
  onPlayPreset,
  isMicActive,
  onToggleMic,
}) => {
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFireOn, setIsFireOn] = useState<boolean>(true);
  const [isHolding, setIsHolding] = useState<boolean>(false);

  // Periodic quill scratching sound when speaking
  useEffect(() => {
    if (!isSpeaking) return;
    const interval = setInterval(() => {
      tavernFoley.playQuillScratch();
    }, 280 + Math.random() * 200);

    return () => clearInterval(interval);
  }, [isSpeaking]);

  const handleToggleMute = () => {
    tavernFoley.playWoodClick(520);
    const muted = tavernFoley.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleFire = () => {
    tavernFoley.playWoodClick(440);
    const fire = tavernFoley.toggleFireplace();
    setIsFireOn(fire);
  };

  // Preset stories to dictate to the scribe
  const presets = [
    {
      id: 'deploy',
      label: '⚔️ The Midnight Deploy',
      desc: 'Battle through merge conflicts',
      text: 'Night fell upon the kingdom. We faced twenty recursive merge conflicts in the shadows of the git repository. By candlelight, the tests turned green at last, and the build was deployed to the realm.',
    },
    {
      id: 'bug',
      label: '🛡️ The Ghostly Bug',
      desc: 'The bug that vanished at noon',
      text: 'A phantom race condition haunted our production gates all morning. We traced the memory leaks through the ancient logs. With quiet patience and an iron will, the phantom was sealed in our tomb.',
    },
    {
      id: 'toast',
      label: '🍺 End-of-Day Soliloquy',
      desc: 'A grateful reflection at the inn',
      text: 'The code is committed, the servers hum with steady warmth, and the tavern fire crackles. Another day of honest craftsmanship complete. Rest now, tomorrow the quest begins anew.',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Primary Push-to-Talk / Toggle Speaking Action */}
      <div className="flex flex-col items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            tavernFoley.playWoodClick(isSpeaking ? 340 : 680);
            onToggleSpeaking();
          }}
          className={`relative group flex w-full max-w-[280px] items-center justify-center gap-3 rounded-2xl border-2 px-6 py-4 font-mono text-sm font-bold tracking-wider shadow-lg transition-all duration-150 active:translate-y-1 ${
            isSpeaking
              ? 'border-[#ea7462] bg-gradient-to-b from-[#7e2029] to-[#54151c] text-[#fef1cb] shadow-[0_0_24px_rgba(234,116,98,0.5)]'
              : 'border-[#d4a02c] bg-gradient-to-b from-[#442614] to-[#2c190f] text-[#fad089] hover:border-[#f3aa57] shadow-[0_4px_16px_rgba(0,0,0,0.6)]'
          }`}
        >
          {/* Animated Glow Halo */}
          {isSpeaking && (
            <span className="absolute -inset-1 animate-pulse rounded-2xl bg-[#ea7462]/20 blur-sm" />
          )}

          {/* Icon */}
          <span className="text-xl">
            {isSpeaking ? '🛑' : isMicActive ? '🎙️' : '🗣️'}
          </span>

          <div className="flex flex-col items-start leading-tight">
            <span>{isSpeaking ? 'STOP RECORDING' : 'SPEAK THY TALE'}</span>
            <span className="text-[10px] font-normal text-[#d1c6b6]/80">
              {isSpeaking ? 'Scribe is scribbling...' : 'Scribe awaits your voice'}
            </span>
          </div>

          {/* Pulse Dot */}
          <span
            className={`ml-auto h-2.5 w-2.5 rounded-full ${
              isSpeaking
                ? 'animate-ping bg-[#ea7462]'
                : 'bg-[#6fd1ab] shadow-[0_0_8px_#6fd1ab]'
            }`}
          />
        </button>

        <span className="text-[10px] font-mono text-[#a69989]">
          Tap button above or choose a prompt below to dictate
        </span>
      </div>

      {/* Auxiliary Controls: Real Mic, Ambient Fire, Foley Mute */}
      <div className="grid grid-cols-3 gap-2">
        {/* Toggle Real Mic */}
        <button
          type="button"
          onClick={() => {
            tavernFoley.playWoodClick(580);
            onToggleMic();
          }}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-colors ${
            isMicActive
              ? 'border-[#42a780] bg-[#143829]/60 text-[#6fd1ab]'
              : 'border-[#36302a] bg-[#1a100a]/80 text-[#a69989] hover:border-[#61371b]'
          }`}
        >
          <span className="text-base">{isMicActive ? '🎙️' : '🎙️'}</span>
          <span className="mt-1 text-[10px] font-mono font-medium">
            {isMicActive ? 'MIC LIVE' : 'USE REAL MIC'}
          </span>
        </button>

        {/* Ambient Fireplace Sound */}
        <button
          type="button"
          onClick={handleToggleFire}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-colors ${
            isFireOn
              ? 'border-[#d4843d] bg-[#442614]/60 text-[#fad089]'
              : 'border-[#36302a] bg-[#1a100a]/80 text-[#796e62]'
          }`}
        >
          <span className="text-base">{isFireOn ? '🔥' : '💨'}</span>
          <span className="mt-1 text-[10px] font-mono font-medium">
            {isFireOn ? 'HEARTH ON' : 'HEARTH OFF'}
          </span>
        </button>

        {/* Sound Effects Mute */}
        <button
          type="button"
          onClick={handleToggleMute}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-colors ${
            !isMuted
              ? 'border-[#596996] bg-[#1c2138]/60 text-[#cad5ea]'
              : 'border-[#ab2d38] bg-[#300d11]/60 text-[#ea7462]'
          }`}
        >
          <span className="text-base">{isMuted ? '🔇' : '🔊'}</span>
          <span className="mt-1 text-[10px] font-mono font-medium">
            {isMuted ? 'MUTED' : 'TAVERN SFX'}
          </span>
        </button>
      </div>

      {/* Preset Tales Drawer / Chips for instant dictation testing */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-[#36302a] bg-[#16100a]/90 p-2.5">
        <div className="flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-[#d4a02c]">
          <span>⚡ QUICK DICTATION STORIES</span>
          <span className="text-[9px] text-[#796e62]">TAP TO STREAM</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                tavernFoley.playWoodClick(620);
                onPlayPreset(preset.label, preset.text);
              }}
              className="group flex items-center justify-between rounded-lg border border-[#3d2918] bg-[#21140c]/70 px-2.5 py-1.5 text-left transition-colors hover:border-[#ab6630] hover:bg-[#2c190f]"
            >
              <div className="flex flex-col">
                <span className="text-xs font-serif font-bold text-[#fef1cb] group-hover:text-[#fad089]">
                  {preset.label}
                </span>
                <span className="text-[10px] font-mono text-[#a69989]">
                  {preset.desc}
                </span>
              </div>
              <span className="text-xs text-[#d4843d] opacity-60 group-hover:opacity-100">
                ▶
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
