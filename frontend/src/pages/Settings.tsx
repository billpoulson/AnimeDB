import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Library, ScannedFolder, CreateLibraryRequest,
  getLibraries, createLibrary, updateLibrary, deleteLibrary, scanForFolders, getConfig,
  authChangePassword, getAuthStatus,
  checkForUpdate, applyUpdate, type UpdateCheckResult,
  getPlexSections,
  type PlexSection,
} from '../api/client';

const TYPE_LABELS: Record<string, string> = { movies: 'Movies', tv: 'TV', other: 'Other' };

export default function Settings() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [scanned, setScanned] = useState<ScannedFolder[]>([]);
  const [plexConnected, setPlexConnected] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [form, setForm] = useState<CreateLibraryRequest>({ name: '', path: '', type: 'other', plex_section_id: null });
  const [error, setError] = useState('');
  const [plexSections, setPlexSections] = useState<PlexSection[]>([]);

  const [hash, setHash] = useState(() => window.location.hash.slice(1) || 'libraries');
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash.slice(1) || 'libraries');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const refresh = async () => {
    const [libs, folders, cfg] = await Promise.all([getLibraries(), scanForFolders(), getConfig()]);
    setLibraries(libs);
    setScanned(folders);
    setPlexConnected(cfg.plexConnected);
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    getAuthStatus().then((s) => setAuthRequired(s.authRequired)).catch(() => {});
  }, []);

  useEffect(() => {
    if (showAdd && plexConnected && plexSections.length === 0) {
      getPlexSections()
        .then(setPlexSections)
        .catch(() => {});
    }
  }, [showAdd, plexConnected]);

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

  const navLinkClass = (section: string) =>
    `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      hash === section ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
      <aside className="w-full md:w-48 shrink-0">
        <nav className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 md:overflow-visible">
          <a href="#libraries" className={navLinkClass('libraries')}>Libraries</a>
          <a href="#integrations" className={navLinkClass('integrations')}>Integrations</a>
          <a href="#updates" className={navLinkClass('updates')}>Updates</a>
          {authRequired && <a href="#security" className={navLinkClass('security')}>Security</a>}
        </nav>
      </aside>
      <div className="flex-1 min-w-0 space-y-8">
        <div id="libraries" className="scroll-mt-24">
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
                  <label className="block text-xs text-gray-500 mb-0.5">Plex Section (optional)</label>
                  <select
                    value={form.plex_section_id ?? ''}
                    onChange={(e) => setForm({ ...form, plex_section_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {(() => {
                      const filtered =
                        form.type === 'movies'
                          ? plexSections.filter((s) => s.type === 'movie')
                          : form.type === 'tv'
                            ? plexSections.filter((s) => s.type === 'show')
                            : plexSections.filter((s) => s.type === 'movie' || s.type === 'show');
                      return filtered.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ));
                    })()}
                  </select>
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
                            {plexSections.find((s) => s.id === lib.plex_section_id)?.title ?? `Section ${lib.plex_section_id}`}
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
            <section className="mt-8">
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

        <div id="integrations" className="scroll-mt-24">
          <section>
            <h2 className="text-lg font-semibold mb-4">Integrations</h2>
            <div className="space-y-4">
              <Link
                to="/settings/plex"
                className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 hover:bg-gray-800/50 transition-colors group"
              >
                <div className="w-12 h-12 rounded-lg bg-[#E5A00D]/20 flex items-center justify-center shrink-0">
                  <svg className="w-8 h-8 text-[#E5A00D]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M11.643 0H4.68l7.679 12 7.679-12h-6.964l-3.678 6 3.679 6H4.68l7.679-12-7.68 12h6.965l3.678-6-3.678-6z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-100 group-hover:text-white">Plex</p>
                  <p className="text-sm text-gray-500">
                    {plexConnected ? 'Connected' : 'Not configured'}
                  </p>
                </div>
                <span className="text-gray-500 group-hover:text-gray-400 transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              </Link>
              <div className="border border-dashed border-gray-700 rounded-lg p-6 text-center">
                <p className="text-sm text-gray-500 mb-1">Add integration</p>
                <p className="text-xs text-gray-600">More integrations coming soon</p>
              </div>
            </div>
          </section>
        </div>
        <div id="updates" className="scroll-mt-24">
          <UpdateCheck />
        </div>
        <div id="security" className="scroll-mt-24">
          <ChangePassword />
        </div>
      </div>
    </div>
  );
}

function UpdateCheck() {
  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [updateErr, setUpdateErr] = useState('');

  const check = async () => {
    setChecking(true);
    setUpdateErr('');
    try {
      const result = await checkForUpdate();
      setInfo(result);
      if (result.updateInProgress) setUpdating(true);
    } catch (err: any) {
      setUpdateErr(err.response?.data?.error || 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { check(); }, []);

  const handleUpdate = async () => {
    if (!info) return;
    const targetSha = info.remoteSha;
    setUpdating(true);
    setUpdateMsg('');
    setUpdateErr('');
    try {
      const result = await applyUpdate();
      setUpdateMsg(result.message);
      pollForNewVersion(targetSha);
    } catch (err: any) {
      setUpdateErr(err.response?.data?.error || 'Update failed');
      setUpdating(false);
    }
  };

  const pollForNewVersion = (targetSha: string) => {
    let attempts = 0;
    const maxAttempts = 120;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setUpdateErr('Update is taking longer than expected. The app may still be restarting — try refreshing the page.');
        setUpdating(false);
        return;
      }
      try {
        const result = await checkForUpdate();
        if (result.currentSha === targetSha) {
          clearInterval(interval);
          setInfo(result);
          setUpdateMsg('');
          setUpdating(false);
        } else if (!result.updateInProgress && result.currentSha !== targetSha) {
          clearInterval(interval);
          setUpdateErr('Update failed. Check server logs for details.');
          setUpdating(false);
        }
      } catch {
        // server is restarting, keep polling
      }
    }, 3000);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Updates</h2>
        <button
          onClick={check}
          disabled={checking}
          className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Check now'}
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        {info && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-28 shrink-0">Current build</span>
              <code className="text-xs bg-gray-800 rounded px-2 py-0.5 text-gray-300">
                {info.currentSha === 'unknown' ? 'unknown' : info.currentSha.slice(0, 7)}
              </code>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-28 shrink-0">Latest</span>
              <code className="text-xs bg-gray-800 rounded px-2 py-0.5 text-gray-300">
                {info.remoteSha.slice(0, 7)}
              </code>
              <span className="text-xs text-gray-500">{info.remoteMessage}</span>
            </div>

            {info.updateAvailable ? (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-sm text-yellow-400">Update available</span>
                <button
                  onClick={handleUpdate}
                  disabled={updating}
                  className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {updating && (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {updating ? 'Updating...' : 'Install update'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-green-400 pt-1">
                {info.currentSha === 'unknown' ? 'Build SHA not set -- rebuild with BUILD_SHA to enable update tracking.' : 'Up to date'}
              </p>
            )}
          </>
        )}

        {updateMsg && <p className="text-xs text-blue-400">{updateMsg}</p>}
        {updating && updateMsg && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Waiting for the app to restart with the new version...
          </p>
        )}
        {updateErr && <p className="text-xs text-red-400">{updateErr}</p>}
      </div>
    </section>
  );
}

function ChangePassword() {
  const [authRequired, setAuthRequired] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    getAuthStatus().then((s) => setAuthRequired(s.authRequired)).catch(() => {});
  }, []);

  if (!authRequired) return null;

  const handleChangePassword = async () => {
    setPwError('');
    setPwSuccess('');

    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (newPassword.length < 4) {
      setPwError('New password must be at least 4 characters');
      return;
    }

    setPwLoading(true);
    try {
      await authChangePassword(currentPassword, newPassword);
      setPwSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Change Password</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 max-w-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {pwError && <p className="text-xs text-red-400">{pwError}</p>}
        {pwSuccess && <p className="text-xs text-green-400">{pwSuccess}</p>}
        <button
          onClick={handleChangePassword}
          disabled={pwLoading}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
        >
          {pwLoading ? 'Saving...' : 'Change Password'}
        </button>
      </div>
    </section>
  );
}
