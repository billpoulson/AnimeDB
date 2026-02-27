import { useState, useEffect } from 'react';
import {
  ApiKey, Peer, NetworkingInfo,
  getApiKeys, createApiKey, deleteApiKey,
  getPeers, addPeer, deletePeer,
  getNetworking, setExternalUrl, resolvePeer,
} from '../api/client';
import RemoteLibrary from '../components/RemoteLibrary';

export default function Peers() {
  const [networking, setNetworking] = useState<NetworkingInfo | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlSaving, setUrlSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState('');

  const [peers, setPeers] = useState<Peer[]>([]);
  const [showAddPeer, setShowAddPeer] = useState(false);
  const [peerForm, setPeerForm] = useState({ name: '', url: '', api_key: '' });
  const [peerError, setPeerError] = useState('');
  const [peerSaving, setPeerSaving] = useState(false);

  const [browsingPeer, setBrowsingPeer] = useState<Peer | null>(null);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [resolveResults, setResolveResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const refresh = async () => {
    const [net, k, p] = await Promise.all([getNetworking(), getApiKeys(), getPeers()]);
    setNetworking(net);
    setUrlInput(net.externalUrl || '');
    setKeys(k);
    setPeers(p);
  };

  useEffect(() => { refresh(); }, []);

  const handleSetUrl = async () => {
    setUrlSaving(true);
    try {
      const result = await setExternalUrl(urlInput.trim() || null);
      setNetworking((prev) => prev ? { ...prev, externalUrl: result.externalUrl } : prev);
    } finally {
      setUrlSaving(false);
    }
  };

  const handleCopy = () => {
    if (networking?.externalUrl) {
      navigator.clipboard.writeText(networking.externalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyLabel.trim()) { setKeyError('Label is required'); return; }
    setKeyError('');
    try {
      const result = await createApiKey(newKeyLabel.trim());
      setCreatedKey(result.key);
      setNewKeyLabel('');
      refresh();
    } catch (err: any) {
      setKeyError(err.response?.data?.error || 'Failed to create key');
    }
  };

  const handleDeleteKey = async (id: string) => {
    await deleteApiKey(id);
    refresh();
  };

  const handleAddPeer = async () => {
    if (!peerForm.name.trim() || !peerForm.url.trim() || !peerForm.api_key.trim()) {
      setPeerError('All fields are required');
      return;
    }
    setPeerError('');
    setPeerSaving(true);
    try {
      await addPeer(peerForm);
      setPeerForm({ name: '', url: '', api_key: '' });
      setShowAddPeer(false);
      refresh();
    } catch (err: any) {
      setPeerError(err.response?.data?.error || 'Failed to add peer');
    } finally {
      setPeerSaving(false);
    }
  };

  const handleDeletePeer = async (id: string) => {
    await deletePeer(id);
    refresh();
  };

  const handleResolve = async (id: string) => {
    setResolvingIds((prev) => new Set(prev).add(id));
    setResolveResults((prev) => { const r = { ...prev }; delete r[id]; return r; });
    try {
      const result = await resolvePeer(id);
      if (result.resolved) {
        setResolveResults((prev) => ({ ...prev, [id]: { ok: true, msg: `Resolved via ${result.via}` } }));
        refresh();
      } else {
        setResolveResults((prev) => ({ ...prev, [id]: { ok: false, msg: 'Could not resolve' } }));
      }
    } catch (err: any) {
      setResolveResults((prev) => ({
        ...prev,
        [id]: { ok: false, msg: err.response?.data?.error || 'Resolve failed' },
      }));
    } finally {
      setResolvingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  return (
    <div className="space-y-8">
      {/* Networking */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Networking</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          {networking && (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28 shrink-0">Instance ID</span>
                <code className="text-xs bg-gray-800 rounded px-2 py-0.5 text-gray-300 select-all">{networking.instanceId}</code>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28 shrink-0">Instance name</span>
                <span className="text-sm">{networking.instanceName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28 shrink-0">UPnP</span>
                {networking.upnp.active ? (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    Active ({networking.upnp.externalIp})
                  </span>
                ) : networking.upnp.error ? (
                  <span className="text-xs text-yellow-400">Unavailable: {networking.upnp.error}</span>
                ) : (
                  <span className="text-xs text-gray-500">Not active (manual URL set)</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28 shrink-0">External URL</span>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="http://your-ip:3000"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSetUrl}
                    disabled={urlSaving}
                    className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                  >
                    {urlSaving ? 'Saving...' : 'Set'}
                  </button>
                  {networking.externalUrl && (
                    <button
                      onClick={handleCopy}
                      className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
              {!networking.externalUrl && (
                <p className="text-xs text-yellow-400 ml-[7.5rem]">
                  No external URL detected. Set one manually or enable UPnP (Linux Docker with host networking).
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* API Keys */}
      <section>
        <h2 className="text-lg font-semibold mb-4">API Keys</h2>
        <p className="text-sm text-gray-500 mb-3">Generate keys so other instances can connect to yours.</p>

        <div className="flex items-center gap-2 mb-4">
          <input
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder={"Label, e.g. \"Bob's instance\""}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
          />
          <button
            onClick={handleCreateKey}
            className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Generate
          </button>
        </div>
        {keyError && <p className="text-xs text-red-400 mb-2">{keyError}</p>}

        {createdKey && (
          <div className="bg-green-900/30 border border-green-800 rounded-lg p-4 mb-4">
            <p className="text-sm text-green-300 mb-1">Key created -- copy it now, it won't be shown again:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-800 rounded px-3 py-2 text-green-200 break-all select-all">
                {createdKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdKey);
                }}
                className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors shrink-0"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-xs text-gray-400 hover:text-gray-300 mt-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-gray-600 text-sm">No keys yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-left text-gray-400">
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-gray-800/50 hover:bg-gray-900/50">
                    <td className="px-4 py-3 font-medium">{k.label}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors p-1"
                        aria-label="Revoke key"
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
        )}
      </section>

      {/* Linked Instances */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Linked Instances</h2>
          <button
            onClick={() => { setShowAddPeer(true); setPeerError(''); }}
            className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Add peer
          </button>
        </div>

        {showAddPeer && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Connect to a peer</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Name</label>
                <input
                  value={peerForm.name}
                  onChange={(e) => setPeerForm({ ...peerForm, name: e.target.value })}
                  placeholder="Bob's AnimeDB"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">URL</label>
                <input
                  value={peerForm.url}
                  onChange={(e) => setPeerForm({ ...peerForm, url: e.target.value })}
                  placeholder="http://1.2.3.4:3000"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">API Key</label>
                <input
                  value={peerForm.api_key}
                  onChange={(e) => setPeerForm({ ...peerForm, api_key: e.target.value })}
                  placeholder="adb_..."
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            {peerError && <p className="text-xs text-red-400">{peerError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAddPeer}
                disabled={peerSaving}
                className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {peerSaving ? 'Connecting...' : 'Connect'}
              </button>
              <button
                onClick={() => setShowAddPeer(false)}
                className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {peers.length === 0 && !showAddPeer ? (
          <p className="text-gray-500 text-sm">No linked instances. Add a peer to browse and pull their media.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-left text-gray-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                  <th className="px-4 py-3 font-medium w-44"></th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => (
                  <tr key={p.id} className="border-t border-gray-800/50 hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <span className="font-medium">{p.name}</span>
                      {p.instance_id && (
                        <span className="block text-[10px] text-gray-600 font-mono mt-0.5 truncate max-w-[10rem]" title={p.instance_id}>
                          {p.instance_id}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 truncate max-w-xs">{p.url}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {p.last_seen ? new Date(p.last_seen).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setBrowsingPeer(p)}
                          className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                        >
                          Browse
                        </button>
                        {p.instance_id && (
                          <button
                            onClick={() => handleResolve(p.id)}
                            disabled={resolvingIds.has(p.id)}
                            className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
                            title="Ask other peers for this instance's current URL"
                          >
                            {resolvingIds.has(p.id) ? 'Resolving...' : 'Resolve'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeletePeer(p.id)}
                          className="text-gray-400 hover:text-red-400 transition-colors p-1"
                          aria-label="Remove peer"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                      {resolveResults[p.id] && (
                        <p className={`text-[11px] mt-1 ${resolveResults[p.id].ok ? 'text-green-400' : 'text-red-400'}`}>
                          {resolveResults[p.id].msg}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {browsingPeer && (
        <RemoteLibrary
          peerId={browsingPeer.id}
          peerName={browsingPeer.name}
          onClose={() => setBrowsingPeer(null)}
        />
      )}
    </div>
  );
}
