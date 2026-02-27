import { useState, useEffect } from 'react';
import { getPeerLibrary, pullFromPeer, RemoteLibraryItem } from '../api/client';

interface Props {
  peerId: string;
  peerName: string;
  onClose: () => void;
}

export default function RemoteLibrary({ peerId, peerName, onClose }: Props) {
  const [items, setItems] = useState<RemoteLibraryItem[]>([]);
  const [instanceName, setInstanceName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState<Set<string>>(new Set());
  const [pulled, setPulled] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError('');
    getPeerLibrary(peerId)
      .then((data) => {
        setItems(data.items);
        setInstanceName(data.instanceName);
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [peerId]);

  const handlePull = async (remoteId: string) => {
    setPulling((prev) => new Set(prev).add(remoteId));
    try {
      await pullFromPeer(peerId, remoteId);
      setPulled((prev) => new Set(prev).add(remoteId));
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Pull failed';
      if (err.response?.status === 409) {
        setPulled((prev) => new Set(prev).add(remoteId));
      } else {
        alert(msg);
      }
    } finally {
      setPulling((prev) => { const s = new Set(prev); s.delete(remoteId); return s; });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="font-semibold text-lg">{peerName}</h3>
            {instanceName && (
              <p className="text-xs text-gray-500">{instanceName}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-gray-500 text-center py-8">Loading remote library...</p>}
          {error && <p className="text-red-400 text-center py-8">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-gray-500 text-center py-8">No media on this peer.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2.5 pr-3 font-medium">{item.title || 'Untitled'}</td>
                    <td className="py-2.5 pr-3 capitalize text-gray-400">{item.category}</td>
                    <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5">
                      {pulled.has(item.id) ? (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Pulled
                        </span>
                      ) : (
                        <button
                          onClick={() => handlePull(item.id)}
                          disabled={pulling.has(item.id)}
                          className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                        >
                          {pulling.has(item.id) ? 'Pulling...' : 'Pull'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
