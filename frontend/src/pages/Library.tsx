import { useState, useEffect } from 'react';
import { getDownloads, deleteDownload, moveToLibrary, unmoveFromLibrary, getLibraries, Download, Library as LibraryType } from '../api/client';
import VideoPlayer from '../components/VideoPlayer';

export default function Library() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Download | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const [libraries, setLibraries] = useState<LibraryType[]>([]);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<string>('');

  const handleMove = async (id: string, libraryId?: string) => {
    setMovingIds((prev) => new Set(prev).add(id));
    setMoveTargetId(null);
    try {
      await moveToLibrary(id, libraryId);
      fetchLibrary();
    } catch (err) {
      console.error('Failed to move', err);
    } finally {
      setMovingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const fetchLibrary = async () => {
    try {
      const data = await getDownloads();
      setDownloads(data.filter((d) => d.status === 'completed'));
    } catch (err) {
      console.error('Failed to fetch library', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
    getLibraries().then(setLibraries).catch(() => {});
  }, []);

  const handleUnmove = async (id: string) => {
    setMovingIds((prev) => new Set(prev).add(id));
    try {
      await unmoveFromLibrary(id);
      fetchLibrary();
    } catch (err) {
      console.error('Failed to unmove', err);
    } finally {
      setMovingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDownload(id);
    fetchLibrary();
  };

  if (loading) {
    return <p className="text-gray-500 text-center py-12">Loading...</p>;
  }

  if (downloads.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-lg">No media in library yet</p>
        <p className="text-gray-600 text-sm mt-1">
          Add a YouTube URL from the Dashboard to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Media Library</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-left text-gray-400">
              <th className="px-4 py-3 font-medium w-10"></th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Path</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {downloads.map((dl) => (
              <tr key={dl.id} className="border-t border-gray-800/50 hover:bg-gray-900/50">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setPlaying(dl)}
                    className="text-gray-400 hover:text-blue-400 transition-colors p-1"
                    aria-label="Play video"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </button>
                </td>
                <td className="px-4 py-3 font-medium">{dl.title || 'Untitled'}</td>
                <td className="px-4 py-3 capitalize text-gray-400">{dl.category}</td>
                <td className="px-4 py-3">
                  {dl.moved_to_library ? (
                    <button
                      onClick={() => handleUnmove(dl.id)}
                      disabled={movingIds.has(dl.id)}
                      className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-orange-400 transition-colors disabled:opacity-50"
                      title="Remove from library (move back to downloads)"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {movingIds.has(dl.id) ? 'Moving...' : 'In library'}
                    </button>
                  ) : movingIds.has(dl.id) ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-blue-400">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Moving...
                    </span>
                  ) : moveTargetId === dl.id ? (
                    <div className="flex items-center gap-2">
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
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      Move to library
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{dl.file_path}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(dl.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(dl.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1"
                    aria-label="Remove from library"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {playing && (
        <VideoPlayer
          downloadId={playing.id}
          title={playing.title || playing.url}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}
