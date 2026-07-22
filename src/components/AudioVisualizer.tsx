import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export default function AudioVisualizer({ stream, isActive }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isActive || !stream) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) return;

      const draw = () => {
        if (!canvasRef.current) return;
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        animationRef.current = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        canvasCtx.clearRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i] / 1.7;

          // Draw double-sided mirror bars for beautiful wave effect
          canvasCtx.fillStyle = `rgba(73, 38, 111, ${0.4 + barHeight / 150})`; // Purple opacity gradient
          canvasCtx.fillRect(x, height / 2 - barHeight / 2, barWidth - 1, barHeight);

          // Center yellow glow accent line
          if (barHeight > 30) {
            canvasCtx.fillStyle = `rgba(242, 192, 87, 0.9)`; // Gold accent
            canvasCtx.fillRect(x, height / 2 - 1, barWidth - 1, 2);
          }

          x += barWidth;
        }
      };

      draw();
    } catch (e) {
      console.error('Audio Visualizer error:', e);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [stream, isActive]);

  return (
    <div className="bg-white/30 backdrop-blur-md rounded-xl border border-white/40 p-2 overflow-hidden h-20 shadow-inner flex items-center justify-center relative">
      <canvas 
        ref={canvasRef} 
        width={400} 
        height={64} 
        className="w-full h-full block rounded-lg"
      />
      {!stream && (
        <div className="absolute inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center text-xs text-gray-500 font-medium italic">
          Microphone offline
        </div>
      )}
    </div>
  );
}
