import { useState, useEffect } from 'react';
import {
  Library, ScannedFolder, CreateLibraryRequest,
  getLibraries, createLibrary, updateLibrary, deleteLibrary, scanForFolders, getConfig,
} from '../api/client';

const TYPE_LABELS: Record<string, string> = { movies: 'Movies', tv: 'TV', other: 'Other' };

export default function Settings() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [scanned, setScanned] = useState<ScannedFolder[]>([]);
  const [plexConnected, setPlexConnected] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<CreateLibraryRequest>({ name: '', path: '', type: 'other', plex_section_id: null });
  const [error, setError] = useState('');

  const refresh = async () => {
    const [libs, folders, cfg] = await Promise.all([getLibraries(), scanForFolders(), getConfig()]);
    setLibraries(libs);
    setScanned(folders);
    setPlexConnected(cfg.plexConnected);
  };

  useEffect(() => { refresh(); }, []);

  const resetForm = () => {
    setForm({ name: '', path: '', type: 'other', plex_section_id: null });
    setError('');
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.path.trim()) {
      setError('Name and path are required');
      return;
    }
    setError('');
    try {
      if (editingId) {
        await updateLibrary(editingId, form);
      } else {
        await createLibrary(form);
      }
      resetForm();
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save library');
    }
  };

  const handleEdit = (lib: Library) => {
    setEditingId(lib.id);
    setShowAdd(true);
    setForm({ name: lib.name, path: lib.path, type: lib.type, plex_section_id: lib.plex_section_id });
  };

  const handleDelete = async (id: string) => {
    await deleteLibrary(id);
    refresh();
  };

  const handleAdopt = (folder: ScannedFolder) => {
    setEditingId(null);
    setShowAdd(true);
    setForm({ name: folder.name, path: folder.path, type: folder.suggested_type, plex_section_id: null });
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Libraries</h2>
          <button
            onClick={() => { resetForm(); setShowAdd(true); }}
            className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Add library
          </button>
        </div>

        {showAdd && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-300">{editingId ? 'Edit Library' : 'New Library'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Anime Movies"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Path (relative to media root)</label>
                <input
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  placeholder="Anime Movies"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'movies' | 'tv' | 'other' })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="movies">Movies</option>
                  <option value="tv">TV</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {plexConnected && (
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Plex Section ID (optional)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.plex_section_id ?? ''}
                    onChange={(e) => setForm({ ...form, plex_section_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                    placeholder="Leave empty if not a Plex library"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                {editingId ? 'Save' : 'Create'}
              </button>
              <button onClick={resetForm} className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {libraries.length === 0 && !showAdd ? (
          <p className="text-gray-500 text-sm">No libraries configured. Add one to organize your media.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-left text-gray-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Path</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  {plexConnected && <th className="px-4 py-3 font-medium">Plex Section</th>}
                  <th className="px-4 py-3 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {libraries.map((lib) => (
                  <tr key={lib.id} className="border-t border-gray-800/50 hover:bg-gray-900/50">
                    <td className="px-4 py-3 font-medium">{lib.name}</td>
                    <td className="px-4 py-3 text-gray-400">{lib.path}</td>
                    <td className="px-4 py-3 text-gray-400">{TYPE_LABELS[lib.type] || lib.type}</td>
                    {plexConnected && (
                      <td className="px-4 py-3 text-gray-400">
                        {lib.plex_section_id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            Section {lib.plex_section_id}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">--</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(lib)} className="text-gray-400 hover:text-blue-400 transition-colors p-1" aria-label="Edit">
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(lib.id)} className="text-gray-400 hover:text-red-400 transition-colors p-1" aria-label="Delete">
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {scanned.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Detected Folders</h2>
          <p className="text-sm text-gray-500 mb-3">These folders exist under the media root but aren't registered as libraries.</p>
          <div className="space-y-2">
            {scanned.map((f) => (
              <div key={f.path} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-gray-500">{f.path} &middot; detected as <span className="text-gray-400">{TYPE_LABELS[f.suggested_type]}</span></p>
                </div>
                <button
                  onClick={() => handleAdopt(f)}
                  className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  Add as library
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
