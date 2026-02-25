import { useEffect, useRef } from 'react';

interface Props {
  downloadId: string;
  title: string;
  onClose: () => void;
}

export default function VideoPlayer({ downloadId, title, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-5xl mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white text-sm font-medium truncate pr-4">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors shrink-0 p-1"
            aria-label="Close player"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <video
          ref={videoRef}
          src={`/api/downloads/${downloadId}/stream`}
          controls
          autoPlay
          className="w-full rounded-lg bg-black shadow-2xl"
        >
          Your browser does not support video playback.
        </video>
      </div>
    </div>
  );
}
