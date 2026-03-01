import { useState, useEffect, useRef } from 'react';
import {
  Library, ScannedFolder, CreateLibraryRequest,
  getLibraries, createLibrary, updateLibrary, deleteLibrary, scanForFolders, getConfig,
  authChangePassword, getAuthStatus,
  checkForUpdate, applyUpdate, type UpdateCheckResult,
  getPlexSettings, savePlexSettings, testPlexConnection,
  createPlexPin, pollPlexPin, getPlexServers,
  type PlexSettingsResponse,
  type PlexServer,
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

      <PlexIntegration onConnectionChange={refresh} />
      <UpdateCheck />
      <ChangePassword />
    </div>
  );
}

type LinkStep = 'idle' | 'pin' | 'server-pick';

function PlexIntegration({ onConnectionChange }: { onConnectionChange: () => void }) {
  const [settings, setSettings] = useState<PlexSettingsResponse | null>(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [sectionMovies, setSectionMovies] = useState(1);
  const [sectionTv, setSectionTv] = useState(2);
  const [showToken, setShowToken] = useState(false);
  const [tokenEdited, setTokenEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; error: string | null } | null>(null);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [showManual, setShowManual] = useState(false);

  const [linkStep, setLinkStep] = useState<LinkStep>('idle');
  const [linkPin, setLinkPin] = useState<{ authUrl: string; code: string; pinId: number } | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkServers, setLinkServers] = useState<PlexServer[]>([]);
  const [selectedServerUri, setSelectedServerUri] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const s = await getPlexSettings();
    setSettings(s);
    setUrl(s.url);
    setToken(s.token);
    setSectionMovies(s.sectionMovies);
    setSectionTv(s.sectionTv);
    setTokenEdited(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleLinkWithPlex = async () => {
    setLinkErr('');
    setLinkStep('idle');
    try {
      // Do not pass forwardUrl: Plex would redirect back to our app in the popup tab,
      // which can trigger a login prompt (popup may not share auth state). Polling
      // handles the flow; user stays on Plex page and returns to Settings tab manually.
      const pin = await createPlexPin();
      setLinkPin(pin);
      setLinkStep('pin');
      setLinkToken(null);
      setLinkServers([]);
      setSelectedServerUri('');
      window.open(pin.authUrl, '_blank', 'noopener,noreferrer');
      pollRef.current = setInterval(async () => {
        try {
          const res = await pollPlexPin(pin.pinId, pin.code);
          if (res.token) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setLinkToken(res.token);
            let servers: PlexServer[] = [];
            try {
              servers = await getPlexServers(res.token);
            } catch {
              // Server list may fail (e.g. network, API changes); user can enter URL manually
            }
            setLinkServers(servers);
            if (servers.length === 1) setSelectedServerUri(servers[0].uri);
            setLinkStep('server-pick');
          }
        } catch {
          // keep polling
        }
      }, 2000);
    } catch (err: any) {
      setLinkErr(err.response?.data?.error || 'Failed to create PIN');
    }
  };

  const cancelLink = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setLinkStep('idle');
    setLinkPin(null);
    setLinkToken(null);
    setLinkServers([]);
    setSelectedServerUri('');
    setLinkErr('');
  };

  const handleSaveFromLink = async () => {
    if (!linkToken) return;
    const serverUrl = selectedServerUri || url.trim();
    if (!serverUrl) {
      setLinkErr('Select a server or enter the URL manually');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    setSaveErr('');
    setLinkErr('');
    try {
      await savePlexSettings({
        url: serverUrl,
        token: linkToken,
        sectionMovies,
        sectionTv,
      });
      cancelLink();
      setSaveMsg('Plex linked successfully');
      load();
      onConnectionChange();
    } catch (err: any) {
      setLinkErr(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const testToken = tokenEdited ? token : '';
    if (!url || (!testToken && !settings?.hasToken)) {
      setTestResult({ connected: false, error: 'URL and token are required' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testPlexConnection(url, tokenEdited ? token : '__use_saved__');
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ connected: false, error: err.response?.data?.error || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    setSaveErr('');
    try {
      const update: Record<string, any> = { url, sectionMovies, sectionTv };
      if (tokenEdited) update.token = token;
      const saved = await savePlexSettings(update);
      setSettings(saved);
      setToken(saved.token);
      setTokenEdited(false);
      setSaveMsg('Plex settings saved');
      setTestResult(null);
      onConnectionChange();
    } catch (err: any) {
      setSaveErr(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    setSaveMsg('');
    setSaveErr('');
    try {
      const saved = await savePlexSettings({ url: '', token: '', sectionMovies: 1, sectionTv: 2 });
      setSettings(saved);
      setUrl('');
      setToken('');
      setSectionMovies(1);
      setSectionTv(2);
      setTokenEdited(false);
      setTestResult(null);
      setSaveMsg('Plex integration removed');
      onConnectionChange();
    } catch (err: any) {
      setSaveErr(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const configured = settings?.url && settings?.hasToken;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Plex Integration</h2>
          {settings && (
            <span className={`inline-flex items-center gap-1 text-xs ${configured ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-green-400' : 'bg-gray-600'}`} />
              {configured ? 'Connected' : 'Not configured'}
            </span>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
        {linkStep === 'pin' && linkPin && (
          <div className="space-y-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm text-gray-300">Visit the link below and enter this PIN to authorize AnimeDB:</p>
            <div className="flex items-center gap-3">
              <code className="text-2xl font-mono font-bold tracking-widest text-white bg-gray-900 px-4 py-2 rounded">
                {linkPin.code}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(linkPin.code)}
                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
              >
                Copy
              </button>
            </div>
            <a
              href={linkPin.authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 break-all"
            >
              {linkPin.authUrl}
            </a>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Waiting for authorization...
            </p>
            <button onClick={cancelLink} className="text-xs text-gray-500 hover:text-gray-400">
              Cancel
            </button>
          </div>
        )}

        {linkStep === 'server-pick' && linkToken && (
          <div className="space-y-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm text-green-400">Authorized! Select your Plex server:</p>
            {linkServers.length > 0 ? (
              <select
                value={selectedServerUri}
                onChange={(e) => setSelectedServerUri(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a server...</option>
                {linkServers.map((s) => (
                  <option key={s.uri} value={s.uri}>
                    {s.name} — {s.uri}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-500">No servers found. Enter the URL manually below.</p>
            )}
            {linkServers.length === 0 && (
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Plex Server URL</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://192.168.1.50:32400"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveFromLink}
                disabled={saving || (linkServers.length > 0 ? !selectedServerUri : !url.trim())}
                className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Complete Setup'}
              </button>
              <button onClick={cancelLink} className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">
                Cancel
              </button>
            </div>
            {linkErr && <p className="text-xs text-red-400">{linkErr}</p>}
          </div>
        )}

        {(linkStep === 'idle' || configured) && (
          <>
            {linkStep === 'idle' && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={handleLinkWithPlex}
                  className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  {configured ? 'Re-link with Plex' : 'Link with Plex'}
                </button>
                <button
                  onClick={() => setShowManual(!showManual)}
                  className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  {showManual ? 'Hide manual entry' : 'Or enter manually'}
                </button>
              </div>
            )}
            {linkErr && linkStep === 'idle' && <p className="text-xs text-red-400">{linkErr}</p>}

            {(showManual || configured) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Plex Server URL</label>
                  <input
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setTestResult(null); setSaveMsg(''); }}
                    placeholder="http://192.168.1.50:32400"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Plex Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={token}
                      onChange={(e) => { setToken(e.target.value); setTokenEdited(true); setTestResult(null); setSaveMsg(''); }}
                      placeholder={settings?.hasToken ? 'Token saved (enter new value to change)' : 'Enter your Plex token'}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 pr-16 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {showToken ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Movies Section ID</label>
                  <input
                    type="number"
                    min="1"
                    value={sectionMovies}
                    onChange={(e) => { setSectionMovies(parseInt(e.target.value, 10) || 1); setSaveMsg(''); }}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">TV Section ID</label>
                  <input
                    type="number"
                    min="1"
                    value={sectionTv}
                    onChange={(e) => { setSectionTv(parseInt(e.target.value, 10) || 2); setSaveMsg(''); }}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {(showManual || configured) && (
              <>
                {testResult && (
                  <p className={`text-xs ${testResult.connected ? 'text-green-400' : 'text-red-400'}`}>
                    {testResult.connected ? 'Connection successful' : testResult.error || 'Connection failed'}
                  </p>
                )}
                {saveMsg && <p className="text-xs text-green-400">{saveMsg}</p>}
                {saveErr && <p className="text-xs text-red-400">{saveErr}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={handleTest}
                    disabled={testing || !url}
                    className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {testing && (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  {configured && (
                    <button
                      onClick={handleDisconnect}
                      disabled={saving}
                      className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors disabled:opacity-50 ml-auto"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
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
