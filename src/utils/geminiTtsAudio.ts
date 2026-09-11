/**
 * Singleton Web Audio Context & Gemini Text-To-Speech (TTS) Utility.
 *
 * Resolves browser Autoplay restrictions and double-click issues by
 * synchronously initializing/resuming the Web Audio Context on the user's
 * very first click event prior to triggering asynchronous network requests.
 */

// Singleton module variables
let globalAudioContext: AudioContext | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;

/**
 * Retrieves or instantiates the singleton AudioContext and synchronously resumes it.
 * MUST be invoked synchronously inside a user gesture handler (e.g. onClick).
 */
export function getOrCreateAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("Web Audio API is only available in browser environments.");
  }

  if (!globalAudioContext || globalAudioContext.state === "closed") {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    try {
      globalAudioContext = new AudioContextClass({ sampleRate: 24000 });
    } catch (_err) {
      globalAudioContext = new AudioContextClass();
    }
  }

  if (globalAudioContext.state === "suspended") {
    // Synchronously resume AudioContext to bind user gesture token
    globalAudioContext.resume().catch((err) => {
      console.warn("[Gemini TTS] AudioContext resume failed:", err);
    });
  }

  return globalAudioContext;
}

/**
 * Converts a Base64 encoded string into an ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts raw 16-bit Little Endian PCM byte buffer into a Web Audio AudioBuffer.
 */
function pcm16ToAudioBuffer(
  audioCtx: AudioContext,
  arrayBuffer: ArrayBuffer,
  sampleRate = 24000,
  numChannels = 1
): AudioBuffer {
  const int16Array = new Int16Array(arrayBuffer);
  const totalSamples = int16Array.length / numChannels;
  const audioBuffer = audioCtx.createBuffer(numChannels, totalSamples, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < totalSamples; i++) {
      // Normalize Int16 range [-32768, 32767] to Float32 range [-1.0, 1.0]
      channelData[i] = int16Array[i * numChannels + channel] / 32768.0;
    }
  }
  return audioBuffer;
}

/**
 * Decodes base64 audio data into an AudioBuffer using browser decodeAudioData
 * with a fallback to 16-bit PCM decoding.
 */
export async function decodeAudioPayload(
  audioCtx: AudioContext,
  base64Data: string,
  mimeType?: string
): Promise<AudioBuffer> {
  const arrayBuffer = base64ToArrayBuffer(base64Data);

  // If MIME type explicitly specifies PCM/raw format
  if (mimeType && (mimeType.includes("pcm") || mimeType.includes("raw"))) {
    const match = mimeType.match(/rate=(\d+)/);
    const sampleRate = match ? parseInt(match[1], 10) : 24000;
    return pcm16ToAudioBuffer(audioCtx, arrayBuffer, sampleRate, 1);
  }

  try {
    // Standard Web Audio decoder (handles WAV, MP3, AAC, OGG)
    return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (_e) {
    // Fallback: decode as raw 16-bit PCM at 24kHz
    return pcm16ToAudioBuffer(audioCtx, arrayBuffer, 24000, 1);
  }
}

/**
 * Stops any active audio source node or browser speech synthesis immediately.
 */
export function stopTtsAudio(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (_e) {
      // ignore error
    }
  }

  if (activeBufferSource) {
    try {
      activeBufferSource.onended = null;
      activeBufferSource.stop();
      activeBufferSource.disconnect();
    } catch (_e) {
      // ignore error if already stopped
    }
    activeBufferSource = null;
  }
}

/**
 * Fallback native browser speech synthesis using Web Speech API
 */
function speakWithWebSpeech(
  text: string,
  onStart?: () => void,
  onEnded?: () => void,
  onError?: (error: Error) => void
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const englishVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Samantha") ||
            v.name.includes("Daniel") ||
            v.name.includes("Karen") ||
            v.name.includes("Siri"))
      ) || voices.find((v) => v.lang.startsWith("en"));

    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      onEnded?.();
    };

    utterance.onerror = (e) => {
      console.warn("[Web Speech API Fallback Error]:", e);
      onEnded?.();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err: any) {
    console.warn("[Web Speech API Exception]:", err);
    return false;
  }
}

export interface PlayTtsOptions {
  text: string;
  voice?: string;
  onLoading?: () => void;
  onStart?: () => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Main TTS play function. Call synchronously inside onClick handler to ensure
 * single-click execution without audio context suspension.
 */
export async function playGeminiTts(options: PlayTtsOptions): Promise<void> {
  const { text, voice, onLoading, onStart, onEnded, onError } = options;

  if (!text || !text.trim()) {
    onError?.(new Error("No text provided for speech synthesis"));
    return;
  }

  // Stop any currently playing TTS track or speech synthesis
  stopTtsAudio();

  // 1. SYNCHRONOUS: Instantly initialize & resume AudioContext on user gesture
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = getOrCreateAudioContext();
  } catch (err: any) {
    console.warn("[Gemini TTS] AudioContext initialization failed, will try Web Speech fallback:", err);
  }

  // Notify UI that TTS fetch is starting
  onLoading?.();

  try {
    // 2. ASYNCHRONOUS: Fetch audio data from Gemini TTS endpoint
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      console.warn("[Gemini TTS] Server returned non-200 status, using Web Speech API fallback...", errJson);
      if (speakWithWebSpeech(text, onStart, onEnded, onError)) {
        return;
      }
      throw new Error(errJson.error || `TTS API request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.audio) {
      console.warn("[Gemini TTS] Server response missing audio payload, using Web Speech API fallback...");
      if (speakWithWebSpeech(text, onStart, onEnded, onError)) {
        return;
      }
      throw new Error("Invalid response from Gemini TTS service");
    }

    if (audioCtx) {
      // Ensure AudioContext is running
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      // 3. DECODE & PLAY: Decode base64 payload into AudioBuffer
      const audioBuffer = await decodeAudioPayload(audioCtx, data.audio, data.mimeType);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      source.onended = () => {
        activeBufferSource = null;
        onEnded?.();
      };

      activeBufferSource = source;

      // Notify UI that playback has officially started
      onStart?.();

      // Trigger audio buffer playback
      source.start(0);
      return;
    }

    // Fallback if no audioCtx
    if (speakWithWebSpeech(text, onStart, onEnded, onError)) {
      return;
    }
  } catch (error: any) {
    console.warn("[Gemini TTS] Audio generation failed, attempting Web Speech API fallback...", error);
    if (speakWithWebSpeech(text, onStart, onEnded, onError)) {
      return;
    }
    stopTtsAudio();
    const errObj = error instanceof Error ? error : new Error(String(error));
    console.error("[Gemini TTS Playback Error]:", errObj);
    onError?.(errObj);
  }
}
