import { useState, useEffect, useCallback } from 'react';
import { getDownloads, getConfig, Download } from '../api/client';
import DownloadForm from '../components/DownloadForm';
import DownloadList from '../components/DownloadList';

export default function Dashboard() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [plexConnected, setPlexConnected] = useState(false);

  const fetchDownloads = useCallback(async () => {
    try {
      const data = await getDownloads();
      setDownloads(data);
    } catch (err) {
      console.error('Failed to fetch downloads', err);
    }
  }, []);

  useEffect(() => {
    fetchDownloads();
    getConfig().then((c) => setPlexConnected(c.plexConnected)).catch(() => {});
    const interval = setInterval(fetchDownloads, 2000);
    return () => clearInterval(interval);
  }, [fetchDownloads]);

  const active = downloads.filter((d) =>
    ['queued', 'downloading', 'processing'].includes(d.status)
  );

  const recent = downloads
    .filter((d) => ['completed', 'failed', 'cancelled'].includes(d.status))
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <DownloadForm onSubmitted={fetchDownloads} />

      {active.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Active Downloads</h2>
          <DownloadList downloads={active} onDelete={fetchDownloads} showLibraryStatus={plexConnected} />
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent</h2>
          <DownloadList downloads={recent} onDelete={fetchDownloads} showLibraryStatus={plexConnected} />
        </section>
      )}
    </div>
  );
}
