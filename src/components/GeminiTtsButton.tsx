import React, { useState, useEffect, useRef } from "react";
import { Volume2, Loader2, Square, VolumeX, Sparkles } from "lucide-react";
import { playGeminiTts, stopTtsAudio } from "../utils/geminiTtsAudio";

export interface GeminiTtsButtonProps {
  /** The text to synthesize and read aloud */
  text: string;
  /** Optional speaker voice override ('Kore', 'Puck', 'Fenrir', 'Zephyr', 'Charon') */
  voice?: string;
  /** Optional custom button label for idle state (defaults to 'Listen') */
  label?: string;
  /** Optional CSS class name overrides */
  className?: string;
  /** Optional variant style ('primary' | 'secondary' | 'compact') */
  variant?: "primary" | "secondary" | "compact";
  /** Optional auto play trigger when text changes */
  autoPlay?: boolean;
}

/**
 * Maps panel speaker names or interview role context to optimal Gemini TTS prebuilt voices
 */
export function getGeminiVoiceForText(text: string, customVoice?: string): string {
  if (customVoice) return customVoice;
  if (text.includes("Marcus (Technical Lead):")) return "Fenrir"; // Deeper male technical lead
  if (text.includes("Elena (Director of Product):")) return "Kore"; // Expressive female product leader
  if (text.includes("Sarah (HR):")) return "Zephyr"; // Balanced, warm female HR lead
  return "Kore"; // Default natural voice
}

export const GeminiTtsButton: React.FC<GeminiTtsButtonProps> = ({
  text,
  voice,
  label = "Listen",
  className = "",
  variant = "secondary",
  autoPlay = false,
}) => {
  const [playbackState, setPlaybackState] = useState<"idle" | "loading" | "speaking">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopTtsAudio();
    };
  }, []);

  // Stop playback if text changes
  useEffect(() => {
    stopTtsAudio();
    if (isMountedRef.current) {
      setPlaybackState("idle");
      setErrorMessage(null);
    }
  }, [text]);

  const handleTogglePlayback = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (playbackState === "speaking" || playbackState === "loading") {
      // User clicked stop during speaking or loading
      stopTtsAudio();
      if (isMountedRef.current) {
        setPlaybackState("idle");
      }
      return;
    }

    setErrorMessage(null);
    const selectedVoice = getGeminiVoiceForText(text, voice);

    // CRITICAL: playGeminiTts MUST be invoked directly in this synchronous event handler
    // to capture the user gesture on AudioContext before asynchronous fetch.
    playGeminiTts({
      text,
      voice: selectedVoice,
      onLoading: () => {
        if (isMountedRef.current) setPlaybackState("loading");
      },
      onStart: () => {
        if (isMountedRef.current) setPlaybackState("speaking");
      },
      onEnded: () => {
        if (isMountedRef.current) setPlaybackState("idle");
      },
      onError: (err) => {
        if (isMountedRef.current) {
          setPlaybackState("idle");
          setErrorMessage(err.message || "Speech synthesis error");
        }
      },
    });
  };

  // Styling variants
  const getButtonStyles = () => {
    if (className) return className;

    if (variant === "compact") {
      if (playbackState === "speaking") {
        return "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer";
      }
      if (playbackState === "loading") {
        return "bg-purple-50 text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg text-xs font-bold opacity-80 cursor-wait flex items-center gap-1.5";
      }
      return "bg-purple-100 hover:bg-purple-200 text-albion-purple px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer";
    }

    if (variant === "primary") {
      if (playbackState === "speaking") {
        return "bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-md cursor-pointer text-xs";
      }
      if (playbackState === "loading") {
        return "bg-purple-800 text-purple-200 font-bold px-4 py-2.5 rounded-xl opacity-90 cursor-wait flex items-center gap-2 text-xs shadow-md";
      }
      return "bg-albion-purple hover:bg-albion-purple-light text-white font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-md cursor-pointer text-xs";
    }

    // Default 'secondary'
    if (playbackState === "speaking") {
      return "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer";
    }
    if (playbackState === "loading") {
      return "bg-purple-100 text-purple-700 border border-purple-200 px-3.5 py-2 rounded-xl text-xs font-bold cursor-wait flex items-center gap-2";
    }
    return "bg-purple-100 hover:bg-purple-200 text-albion-purple px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer";
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleTogglePlayback}
        className={getButtonStyles()}
        title={playbackState === "speaking" ? "Stop audio playback" : "Listen to question via Gemini TTS"}
      >
        {playbackState === "loading" && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-purple-600 shrink-0" />
            <span>Preparing Audio...</span>
          </>
        )}

        {playbackState === "speaking" && (
          <>
            {/* Active Soundwave Indicator */}
            <span className="flex items-center gap-0.5 h-3.5 px-0.5" aria-hidden="true">
              <span className="w-1 bg-amber-600 h-full animate-bounce rounded-full" style={{ animationDelay: "0ms" }} />
              <span className="w-1 bg-amber-600 h-2/3 animate-bounce rounded-full" style={{ animationDelay: "150ms" }} />
              <span className="w-1 bg-amber-600 h-full animate-bounce rounded-full" style={{ animationDelay: "300ms" }} />
            </span>
            <span>Speaking...</span>
            <Square className="w-3 h-3 fill-current ml-1 text-amber-800 shrink-0" />
          </>
        )}

        {playbackState === "idle" && (
          <>
            <Volume2 className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </>
        )}
      </button>

      {errorMessage && (
        <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-200">
          {errorMessage}
        </span>
      )}
    </div>
  );
};

export default GeminiTtsButton;
