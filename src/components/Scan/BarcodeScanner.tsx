import { useEffect, useRef, useState } from 'react';
import { Loader2, ScanBarcode, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { haptic } from '@/lib/utils';

interface DetectorLike {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/** Scanner de code-barres en direct : BarcodeDetector natif (Chrome Android) ou ZXing en secours. */
export function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopZxing: (() => void) | null = null;
    let cancelled = false;

    const finish = (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      haptic(60);
      onDetected(code);
    };

    (async () => {
      try {
        const Native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
        let supported = false;
        if (Native?.getSupportedFormats) {
          const f = await Native.getSupportedFormats();
          supported = f.includes('ean_13');
        }
        if (Native && supported) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
          if (cancelled) return;
          const v = videoRef.current!;
          v.srcObject = stream;
          await v.play();
          setStatus('scanning');
          const detector = new Native({ formats: FORMATS });
          let last = 0;
          const loop = async (t: number) => {
            if (cancelled || doneRef.current) return;
            if (t - last > 180 && v.readyState >= 2) {
              last = t;
              try {
                const codes = await detector.detect(v);
                if (codes[0]?.rawValue) return finish(codes[0].rawValue);
              } catch {
                /* frame ignorée */
              }
            }
            raf = requestAnimationFrame(loop);
          };
          raf = requestAnimationFrame(loop);
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } } },
            videoRef.current!,
            (result) => {
              if (result) finish(result.getText());
            },
          );
          stopZxing = () => controls.stop();
          if (cancelled) controls.stop();
          else setStatus('scanning');
        }
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError((e as Error).name === 'NotAllowedError' ? "Accès à la caméra refusé. Autorise-le dans les paramètres du navigateur." : "Caméra indisponible. Saisis le code manuellement.");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-32 w-64 rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-rose-500 shadow-[0_0_10px_#f43f5e]" />
            </div>
          </div>
        )}
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-300">
            <ScanBarcode className="h-8 w-8 text-slate-500" />
            {error}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-400">Place le code-barres dans le cadre. La détection est automatique.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.replace(/\D/g, '').length >= 6) {
            doneRef.current = true;
            onDetected(manual.replace(/\D/g, ''));
          }
        }}
      >
        <Input inputMode="numeric" placeholder="Ou saisis le code (ex. 3017620422003)" value={manual} onChange={(e) => setManual(e.target.value)} />
        <Button type="submit" size="icon" variant="secondary" aria-label="Rechercher">
          <Search />
        </Button>
      </form>
    </div>
  );
}
