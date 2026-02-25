import { useState } from 'react';
import { Download, deleteDownload, moveToLibrary, cancelDownload } from '../api/client';
import ProgressBar from './ProgressBar';
import VideoPlayer from './VideoPlayer';

interface Props {
  downloads: Download[];
  onDelete: () => void;
  showLibraryStatus?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-600 text-gray-200',
  downloading: 'bg-blue-600 text-blue-100',
  processing: 'bg-yellow-600 text-yellow-100',
  completed: 'bg-green-600 text-green-100',
  failed: 'bg-red-600 text-red-100',
  cancelled: 'bg-orange-600 text-orange-100',
};

export default function DownloadList({ downloads, onDelete, showLibraryStatus = false }: Props) {
  const [playing, setPlaying] = useState<Download | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());

  const handleMove = async (id: string) => {
    setMovingIds((prev) => new Set(prev).add(id));
    try {
      await moveToLibrary(id);
      onDelete();
    } catch (err) {
      console.error('Failed to move', err);
    } finally {
      setMovingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDownload(id);
      onDelete();
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {downloads.map((dl) => (
          <div key={dl.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{dl.title || dl.url}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{dl.url}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {dl.status === 'completed' && dl.file_path && (
                  <button
                    onClick={() => setPlaying(dl)}
                    className="text-gray-400 hover:text-blue-400 transition-colors p-1"
                    aria-label="Play video"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                {(dl.status === 'queued' || dl.status === 'downloading') && (
                  <button
                    onClick={async () => { await cancelDownload(dl.id); onDelete(); }}
                    className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-600/20 text-orange-400 hover:bg-orange-600/40 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[dl.status] || ''}`}>
                  {dl.status}
                </span>
                <button
                  onClick={() => handleDelete(dl.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-1"
                  aria-label="Remove download"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            {(dl.status === 'downloading' || dl.status === 'processing') && (
              <div className="mt-3">
                <ProgressBar percent={dl.progress} />
              </div>
            )}

            {dl.status === 'failed' && dl.error && (
              <p className="mt-2 text-xs text-red-400">{dl.error}</p>
            )}

          {dl.status === 'completed' && dl.file_path && (
            <div className="mt-2 flex items-center gap-2">
              {showLibraryStatus && (
                dl.moved_to_library ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-400 shrink-0">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    In library
                  </span>
                ) : movingIds.has(dl.id) ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 shrink-0">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Moving...
                  </span>
                ) : (
                  <button
                    onClick={() => handleMove(dl.id)}
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                    Move to library
                  </button>
                )
              )}
              <span className="text-xs text-gray-600 truncate">{dl.file_path}</span>
            </div>
          )}
          </div>
        ))}
      </div>

      {playing && (
        <VideoPlayer
          downloadId={playing.id}
          title={playing.title || playing.url}
          onClose={() => setPlaying(null)}
        />
      )}
    </>
  );
}
