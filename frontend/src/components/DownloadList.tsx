import { useState, useEffect } from 'react';
import { Download, Library, deleteDownload, moveToLibrary, unmoveFromLibrary, cancelDownload, updateDownload, getLibraries } from '../api/client';
import ProgressBar from './ProgressBar';
import VideoPlayer from './VideoPlayer';

interface Props {
  downloads: Download[];
  onDelete: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-600 text-gray-200',
  downloading: 'bg-blue-600 text-blue-100',
  processing: 'bg-yellow-600 text-yellow-100',
  completed: 'bg-green-600 text-green-100',
  failed: 'bg-red-600 text-red-100',
  cancelled: 'bg-orange-600 text-orange-100',
};

export default function DownloadList({ downloads, onDelete }: Props) {
  const [playing, setPlaying] = useState<Download | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<'movies' | 'tv' | 'other'>('other');
  const [editSeason, setEditSeason] = useState('');
  const [editEpisode, setEditEpisode] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    getLibraries().then(setLibraries).catch(() => {});
  }, []);

  const startEditing = (dl: Download) => {
    setEditingId(dl.id);
    setEditCategory(dl.category as 'movies' | 'tv' | 'other');
    setEditSeason(dl.season?.toString() || '');
    setEditEpisode(dl.episode?.toString() || '');
  };

  const handleSaveCategory = async (id: string) => {
    setSavingId(id);
    try {
      await updateDownload(id, {
        category: editCategory,
        season: editCategory === 'tv' && editSeason ? parseInt(editSeason, 10) : null,
        episode: editCategory === 'tv' && editEpisode ? parseInt(editEpisode, 10) : null,
      });
      setEditingId(null);
      onDelete();
    } catch (err) {
      console.error('Failed to reclassify', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleMove = async (id: string, libraryId?: string) => {
    setMovingIds((prev) => new Set(prev).add(id));
    setMoveTargetId(null);
    try {
      await moveToLibrary(id, libraryId);
      onDelete();
    } catch (err) {
      console.error('Failed to move', err);
    } finally {
      setMovingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleUnmove = async (id: string) => {
    setMovingIds((prev) => new Set(prev).add(id));
    try {
      await unmoveFromLibrary(id);
      onDelete();
    } catch (err) {
      console.error('Failed to unmove', err);
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

          {dl.status === 'completed' && (
            <div className="mt-3">
              {editingId === dl.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Category</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as 'movies' | 'tv' | 'other')}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="other">Other</option>
                      <option value="movies">Movies</option>
                      <option value="tv">TV</option>
                    </select>
                  </div>
                  {editCategory === 'tv' && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Season</label>
                        <input type="number" min="1" value={editSeason} onChange={(e) => setEditSeason(e.target.value)} placeholder="1" className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Episode</label>
                        <input type="number" min="1" value={editEpisode} onChange={(e) => setEditEpisode(e.target.value)} placeholder="1" className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => handleSaveCategory(dl.id)}
                    disabled={savingId === dl.id}
                    className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
                  >
                    {savingId === dl.id ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditing(dl)}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  {dl.category}{dl.category === 'tv' && dl.season ? ` S${dl.season}` : ''}{dl.category === 'tv' && dl.episode ? `E${dl.episode}` : ''}
                </button>
              )}
            </div>
          )}

          {dl.status === 'completed' && dl.file_path && (
            <div className="mt-2 flex items-center gap-2">
              {dl.moved_to_library ? (
                <button
                  onClick={() => handleUnmove(dl.id)}
                  disabled={movingIds.has(dl.id)}
                  className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-orange-400 transition-colors shrink-0 disabled:opacity-50"
                  title="Remove from library (move back to downloads)"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {movingIds.has(dl.id) ? 'Moving...' : 'In library'}
                </button>
              ) : movingIds.has(dl.id) ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 shrink-0">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Moving...
                </span>
              ) : moveTargetId === dl.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedLibrary}
                    onChange={(e) => setSelectedLibrary(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Default location</option>
                    {libraries.map((lib) => (
                      <option key={lib.id} value={lib.id}>{lib.name} ({lib.type})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleMove(dl.id, selectedLibrary || undefined)}
                    className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    Move
                  </button>
                  <button
                    onClick={() => setMoveTargetId(null)}
                    className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (libraries.length === 0) {
                      handleMove(dl.id);
                    } else {
                      setMoveTargetId(dl.id);
                      setSelectedLibrary('');
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  Move to library
                </button>
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
