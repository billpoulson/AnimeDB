import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getPlexSettings, savePlexSettings, testPlexConnection,
  createPlexPin, pollPlexPin, getPlexServers, getPlexSections,
  type PlexSettingsResponse,
  type PlexServer,
  type PlexSection,
} from '../api/client';

type LinkStep = 'idle' | 'pin' | 'server-pick';

export default function SettingsPlex() {
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

  const [sections, setSections] = useState<PlexSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  const configured = settings?.url && settings?.hasToken;

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

  const SECTIONS_AUTO_FETCH_MS = 15 * 60 * 1000;

  const fetchSections = useCallback(async (refresh = false) => {
    const hasUrl = !!url.trim();
    const hasToken = settings?.hasToken || (tokenEdited && !!token);
    if (!hasUrl || !hasToken) return;

    setSectionsLoading(true);
    setSectionsError(null);
    try {
      const opts: { url?: string; token?: string; refresh?: boolean } = refresh ? { refresh: true } : {};
      if (tokenEdited && token) {
        opts.url = url.trim();
        opts.token = token;
      }
      const list = await getPlexSections(opts);
      setSections(list);
    } catch (err: any) {
      setSectionsError(err.response?.data?.error || 'Failed to fetch sections');
      setSections([]);
    } finally {
      setSectionsLoading(false);
    }
  }, [url, settings?.hasToken, tokenEdited, token]);

  useEffect(() => {
    if ((showManual || configured) && url.trim() && (settings?.hasToken || (tokenEdited && token))) {
      fetchSections();
    } else {
      setSections([]);
      setSectionsError(null);
    }
  }, [showManual, configured, url, settings?.hasToken, tokenEdited, token, fetchSections]);

  useEffect(() => {
    if (!configured) return;
    const interval = setInterval(() => fetchSections(), SECTIONS_AUTO_FETCH_MS);
    return () => clearInterval(interval);
  }, [configured, fetchSections]);

  const handleLinkWithPlex = async () => {
    setLinkErr('');
    setLinkStep('idle');
    try {
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
            } catch { /* server list may fail */ }
            setLinkServers(servers);
            if (servers.length === 1) setSelectedServerUri(servers[0].uri);
            setLinkStep('server-pick');
          }
        } catch { /* keep polling */ }
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
      await savePlexSettings({ url: serverUrl, token: linkToken, sectionMovies, sectionTv });
      cancelLink();
      setSaveMsg('Plex linked successfully');
      load();
    } catch (err: any) {
      setLinkErr(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!url || (!tokenEdited && !settings?.hasToken)) {
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
    } catch (err: any) {
      setSaveErr(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/settings#integrations"
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Back to Settings"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </Link>
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
            <a href={linkPin.authUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 break-all">
              {linkPin.authUrl}
            </a>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Waiting for authorization...
            </p>
            <button onClick={cancelLink} className="text-xs text-gray-500 hover:text-gray-400">Cancel</button>
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
                  <option key={s.uri} value={s.uri}>{s.name} — {s.uri}</option>
                ))}
              </select>
            ) : (
              <>
                <p className="text-xs text-gray-500">No servers found. Enter the URL manually below.</p>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Plex Server URL</label>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="http://192.168.1.50:32400"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveFromLink}
                disabled={saving || (linkServers.length > 0 ? !selectedServerUri : !url.trim())}
                className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Complete Setup'}
              </button>
              <button onClick={cancelLink} className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">Cancel</button>
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
                <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs text-gray-500 mb-0.5">Movies Section</label>
                    {sectionsLoading ? (
                      <p className="text-xs text-gray-500 py-1.5">Loading...</p>
                    ) : sectionsError ? (
                      <input
                        type="number"
                        min="1"
                        value={sectionMovies}
                        onChange={(e) => { setSectionMovies(parseInt(e.target.value, 10) || 1); setSaveMsg(''); }}
                        placeholder="Fallback: enter ID"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <select
                        value={sectionMovies}
                        onChange={(e) => { setSectionMovies(parseInt(e.target.value, 10) || 1); setSaveMsg(''); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {(() => {
                          const movieSections = sections.filter((s) => s.type === 'movie');
                          if (movieSections.length === 0) return <option value={sectionMovies}>No movie sections found</option>;
                          const hasCurrent = movieSections.some((s) => s.id === sectionMovies);
                          return (
                            <>
                              {!hasCurrent && <option value={sectionMovies}>Section {sectionMovies}</option>}
                              {movieSections.map((s) => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                              ))}
                            </>
                          );
                        })()}
                      </select>
                    )}
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs text-gray-500 mb-0.5">TV Section</label>
                    {sectionsLoading ? (
                      <p className="text-xs text-gray-500 py-1.5">Loading...</p>
                    ) : sectionsError ? (
                      <input
                        type="number"
                        min="1"
                        value={sectionTv}
                        onChange={(e) => { setSectionTv(parseInt(e.target.value, 10) || 2); setSaveMsg(''); }}
                        placeholder="Fallback: enter ID"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <select
                        value={sectionTv}
                        onChange={(e) => { setSectionTv(parseInt(e.target.value, 10) || 2); setSaveMsg(''); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {(() => {
                          const tvSections = sections.filter((s) => s.type === 'show');
                          if (tvSections.length === 0) return <option value={sectionTv}>No TV sections found</option>;
                          const hasCurrent = tvSections.some((s) => s.id === sectionTv);
                          return (
                            <>
                              {!hasCurrent && <option value={sectionTv}>Section {sectionTv}</option>}
                              {tvSections.map((s) => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                              ))}
                            </>
                          );
                        })()}
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchSections(true)}
                    disabled={sectionsLoading || !url.trim()}
                    className="text-xs px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
                  >
                    {sectionsLoading ? 'Refreshing...' : 'Refresh sections'}
                  </button>
                </div>
                {sectionsError && <p className="text-xs text-amber-500 sm:col-span-2">Using fallback: {sectionsError}</p>}
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
    </div>
  );
}
