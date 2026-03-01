export default function Docs() {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <h1 className="text-2xl font-bold mb-6">AnimeDB Documentation</h1>

      <nav className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-8 not-prose">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Contents</p>
        <ul className="columns-2 gap-6 text-sm space-y-1">
          <li><a href="#getting-started" className="text-blue-400 hover:text-blue-300">Getting Started</a></li>
          <li><a href="#downloading" className="text-blue-400 hover:text-blue-300">Downloading Videos</a></li>
          <li><a href="#library" className="text-blue-400 hover:text-blue-300">Media Library</a></li>
          <li><a href="#libraries-settings" className="text-blue-400 hover:text-blue-300">Library Folders</a></li>
          <li><a href="#playback" className="text-blue-400 hover:text-blue-300">Video Playback</a></li>
          <li><a href="#plex" className="text-blue-400 hover:text-blue-300">Plex Integration</a></li>
          <li><a href="#federation" className="text-blue-400 hover:text-blue-300">Federation &amp; Peers</a></li>
          <li><a href="#networking" className="text-blue-400 hover:text-blue-300">Networking &amp; UPnP</a></li>
          <li><a href="#upnp-troubleshooting" className="text-blue-400 hover:text-blue-300">UPnP Troubleshooting</a></li>
          <li><a href="#self-healing" className="text-blue-400 hover:text-blue-300">Self-Healing Mesh</a></li>
          <li><a href="#docker" className="text-blue-400 hover:text-blue-300">Docker &amp; Configuration</a></li>
        </ul>
      </nav>

      {/* ── Getting Started ── */}
      <section id="getting-started" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Getting Started</h2>
        <p>
          AnimeDB is a self-hosted anime download manager with a web UI.
          It downloads videos from YouTube via <strong>yt-dlp</strong>, organizes them into a Plex-compatible
          folder structure, and optionally triggers Plex library scans.
        </p>
        <p>The UI has five sections, accessible from the navigation bar:</p>
        <ul>
          <li><strong>Dashboard</strong> &mdash; Submit new downloads and monitor active/recent jobs.</li>
          <li><strong>Library</strong> &mdash; Browse and play completed downloads, move files to library folders.</li>
          <li><strong>Peers</strong> &mdash; Link instances together to share content across the network.</li>
          <li><strong>Settings</strong> &mdash; Configure library folders, integrations (Plex), and updates.</li>
          <li><strong>Docs</strong> &mdash; This page.</li>
        </ul>
      </section>

      {/* ── Downloading ── */}
      <section id="downloading" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Downloading Videos</h2>
        <p>From the <strong>Dashboard</strong>, paste a YouTube URL into the download form and configure:</p>
        <ul>
          <li><strong>Category</strong> &mdash; <em>Movies</em>, <em>TV</em>, or <em>Other</em>. This determines how the file is organized when moved to the library.</li>
          <li><strong>Title</strong> (optional) &mdash; A custom title. If left blank, the video title from YouTube is used.</li>
          <li><strong>Season / Episode</strong> (TV only) &mdash; Used to build Plex-compatible filenames like <code>Show - S01E03.mkv</code>.</li>
        </ul>
        <p>Click <strong>Add to Queue</strong>. The download appears under <em>Active Downloads</em> with a live progress bar. Downloads run one at a time in a queue.</p>
        <h3 className="text-lg font-medium mt-4">Managing downloads</h3>
        <ul>
          <li><strong>Cancel</strong> &mdash; Stop a queued or in-progress download.</li>
          <li><strong>Delete</strong> &mdash; Remove a download record (does not delete files on disk).</li>
          <li><strong>Re-classify</strong> &mdash; After completion, click the category label to change category, season, or episode before moving to the library.</li>
        </ul>
      </section>

      {/* ── Library ── */}
      <section id="library" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Media Library</h2>
        <p>The <strong>Library</strong> page shows all completed downloads.</p>
        <ul>
          <li><strong>Move to library</strong> &mdash; Copies the file into the organized media folder. If library folders are configured (see Settings), you can choose which one. The file is structured as:
            <ul>
              <li>Movies: <code>/media/Movies/Title/Title.mkv</code></li>
              <li>TV: <code>/media/Series/Title/Season 01/Title - S01E01.mkv</code></li>
            </ul>
          </li>
          <li><strong>Unmove</strong> &mdash; Click the green &ldquo;In library&rdquo; badge to move the file back to the downloads folder.</li>
          <li><strong>Play</strong> &mdash; Click the play icon to stream the video in the built-in player.</li>
          <li><strong>Delete</strong> &mdash; Remove the entry from the database.</li>
        </ul>
      </section>

      {/* ── Library Folders ── */}
      <section id="libraries-settings" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Library Folders (Settings)</h2>
        <p>On the <strong>Settings</strong> page you can create named library folders. Each library has:</p>
        <ul>
          <li><strong>Name</strong> &mdash; A display name (e.g., &ldquo;Anime Movies&rdquo;).</li>
          <li><strong>Path</strong> &mdash; Relative to the media root, or an absolute path.</li>
          <li><strong>Type</strong> &mdash; Movies, TV, or Other. Controls file organization structure.</li>
          <li><strong>Plex Section ID</strong> (optional) &mdash; Links to a Plex library section for automatic scans.</li>
        </ul>
        <p>AnimeDB also auto-detects folders under the media root that aren&rsquo;t registered as libraries, shown in the <em>Detected Folders</em> section with an &ldquo;Add as library&rdquo; button.</p>
      </section>

      {/* ── Playback ── */}
      <section id="playback" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Video Playback</h2>
        <p>
          Completed downloads can be streamed directly in the browser. Click the play button on any completed
          download in the Dashboard or Library view. The player supports seeking via HTTP range requests.
        </p>
        <p>Supported formats: <code>.mkv</code>, <code>.mp4</code>, <code>.webm</code>, <code>.avi</code>.</p>
        <p className="text-yellow-400 text-xs">Note: Browser playback of <code>.mkv</code> files depends on your browser. Chromium-based browsers generally support it; Safari does not.</p>
      </section>

      {/* ── Plex ── */}
      <section id="plex" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Plex Integration</h2>
        <p>Plex integration is optional. To enable it, go to <strong>Settings → Integrations → Plex</strong> and click <strong>Link with Plex</strong>. You will be redirected to Plex to authorize AnimeDB; your token and server URL are then saved automatically.</p>
        <p className="mt-2">Alternatively, you can set these environment variables manually:</p>
        <div className="not-prose overflow-x-auto">
          <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
            <thead><tr className="bg-gray-900 text-gray-400 text-left"><th className="px-3 py-2">Variable</th><th className="px-3 py-2">Description</th></tr></thead>
            <tbody className="text-gray-300">
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_URL</td><td className="px-3 py-2">Your Plex server URL, e.g. <code>http://192.168.1.50:32400</code></td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_TOKEN</td><td className="px-3 py-2">Your Plex authentication token</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_SECTION_MOVIES</td><td className="px-3 py-2">Plex library section ID for movies (default: 1)</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_SECTION_TV</td><td className="px-3 py-2">Plex library section ID for TV shows (default: 2)</td></tr>
            </tbody>
          </table>
        </div>
        <p>When configured, moving a file to the library automatically triggers a Plex scan on the matching section. Per-library Plex section IDs can also be set under Settings → Libraries.</p>
      </section>

      {/* ── Federation ── */}
      <section id="federation" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Federation &amp; Peers</h2>
        <p>
          AnimeDB instances can link together so users can browse and copy media between them.
          Federation uses API key authentication &mdash; no passwords or accounts needed.
        </p>

        <h3 className="text-lg font-medium mt-4">Sharing your instance</h3>
        <ol>
          <li>Go to <strong>Peers &rarr; Networking</strong> and ensure your instance has an External URL (set manually or auto-detected via UPnP).</li>
          <li>Under <strong>API Keys</strong>, click <strong>Generate</strong> to create a key. Give it a descriptive label like the name of the person you&rsquo;re sharing with.</li>
          <li>Copy the key immediately &mdash; it is only shown once. Send the key and your External URL to the other person.</li>
        </ol>

        <h3 className="text-lg font-medium mt-4">Connecting to a peer</h3>
        <ol>
          <li>Go to <strong>Peers &rarr; Linked Instances</strong> and click <strong>Add peer</strong>.</li>
          <li>Enter a name, the peer&rsquo;s URL, and the API key they gave you.</li>
          <li>Click <strong>Connect</strong>. AnimeDB validates the connection before saving.</li>
        </ol>

        <h3 className="text-lg font-medium mt-4">Browsing &amp; pulling content</h3>
        <ol>
          <li>Click <strong>Browse</strong> on a linked peer to see their completed downloads.</li>
          <li>Click <strong>Pull</strong> on any item to download a copy to your local instance. The file streams directly from the peer and appears in your Dashboard as a download with progress tracking.</li>
          <li>Click <strong>Replicate Library</strong> to pull all items from the peer in one go.</li>
          <li>Enable <strong>Auto-sync</strong> on a peer to automatically pull new content as it is added on the remote. Optionally choose a target library for auto-move.</li>
        </ol>

        <h3 className="text-lg font-medium mt-4">Revoking access</h3>
        <p>Delete an API key under <strong>API Keys</strong> to immediately revoke a peer&rsquo;s access to your instance. Delete a peer under <strong>Linked Instances</strong> to stop connecting to them.</p>
      </section>

      {/* ── Networking ── */}
      <section id="networking" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Networking &amp; UPnP</h2>
        <p>For federation to work, your instance must be reachable from the internet (or at least from your peer&rsquo;s network).</p>

        <h3 className="text-lg font-medium mt-4">UPnP (automatic)</h3>
        <p>
          On startup, if no <code>EXTERNAL_URL</code> is set, AnimeDB attempts to create a UPnP port mapping on your
          router and detect your external IP. If successful, the External URL is set automatically.
        </p>
        <p className="text-yellow-400 text-xs">UPnP requires the container to have direct LAN access. In Docker, use <code>network_mode: host</code> (Linux only). On Docker Desktop for Windows/Mac, UPnP will not work &mdash; set <code>EXTERNAL_URL</code> manually instead.</p>

        <h3 className="text-lg font-medium mt-4">Manual URL</h3>
        <p>
          Set the <code>EXTERNAL_URL</code> environment variable, or enter it in the <strong>Peers &rarr; Networking</strong> section.
          Use this if you have a static IP, a domain name, a reverse proxy, or a tunnel service like Cloudflare Tunnel.
        </p>

        <h3 className="text-lg font-medium mt-4">Instance ID</h3>
        <p>
          Each instance has a permanent UUID (shown in the Networking section). This ID never changes, even if your
          IP or URL does. It is used by the self-healing mesh to track peers across address changes.
        </p>
      </section>

      {/* ── UPnP Troubleshooting ── */}
      <section id="upnp-troubleshooting" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">UPnP Troubleshooting</h2>
        <p>
          If UPnP shows <strong>Unavailable</strong> or times out on the Peers page, your instance cannot
          automatically open a port on your router. This prevents peers from connecting to you. Here are the
          most common causes and fixes:
        </p>

        <h3 className="text-lg font-medium mt-4">1. Router does not support or has disabled UPnP</h3>
        <p>Many routers ship with UPnP disabled by default. Log in to your router&rsquo;s admin panel (usually <code>192.168.1.1</code> or <code>192.168.0.1</code>) and look for a UPnP setting under <em>Advanced</em>, <em>NAT</em>, or <em>Firewall</em>. Enable it and restart AnimeDB.</p>

        <h3 className="text-lg font-medium mt-4">2. Docker networking blocks UPnP discovery</h3>
        <p>
          UPnP relies on multicast traffic on the local network. Docker&rsquo;s default bridge network isolates the
          container from LAN multicast. Solutions:
        </p>
        <ul>
          <li><strong>Linux:</strong> Add <code>network_mode: host</code> to your <code>docker-compose.yml</code>. This gives the container direct LAN access.</li>
          <li><strong>Docker Desktop (Windows/Mac):</strong> UPnP <strong>will not work</strong> because Docker Desktop runs containers inside a Linux VM that has no direct LAN access. Skip to option 5 below.</li>
        </ul>

        <h3 className="text-lg font-medium mt-4">3. Double NAT</h3>
        <p>
          If you&rsquo;re behind two routers (e.g., ISP modem + your own router), UPnP can only open a port on the
          closest router. You&rsquo;ll need to either put the ISP modem in bridge mode or manually forward the port
          on both devices.
        </p>

        <h3 className="text-lg font-medium mt-4">4. CGNAT (Carrier-Grade NAT)</h3>
        <p>
          Some ISPs place customers behind CGNAT, meaning you don&rsquo;t have a public IP at all. UPnP won&rsquo;t
          help in this case. You can check by comparing your router&rsquo;s WAN IP with your public IP
          (e.g., <code>curl ifconfig.me</code>). If they differ, you&rsquo;re behind CGNAT. Options:
        </p>
        <ul>
          <li>Ask your ISP for a dedicated public IP.</li>
          <li>Use a tunnel service (Cloudflare Tunnel, Tailscale, WireGuard) and set <code>EXTERNAL_URL</code> to the tunnel address.</li>
        </ul>

        <h3 className="text-lg font-medium mt-4">5. Set the External URL manually</h3>
        <p>
          If UPnP isn&rsquo;t an option, you can always bypass it entirely by setting the External URL yourself.
          There are two ways:
        </p>
        <ul>
          <li><strong>Environment variable:</strong> Set <code>EXTERNAL_URL=http://your-ip:3000</code> in your <code>.env</code> or <code>docker-compose.yml</code>. AnimeDB will skip UPnP entirely when this is set.</li>
          <li><strong>UI:</strong> On the <strong>Peers &rarr; Networking</strong> section, type your public address into the External URL field and click <strong>Set</strong>.</li>
        </ul>
        <p>
          If you set the URL manually, make sure the port is forwarded on your router (or you&rsquo;re using a
          tunnel/reverse proxy) so peers can actually reach it.
        </p>

        <h3 className="text-lg font-medium mt-4">6. Firewall blocking port 3000</h3>
        <p>
          Even if UPnP succeeds, a host or OS firewall may block inbound connections. On Linux, check
          with <code>sudo ufw status</code> or <code>sudo iptables -L</code>. On Windows, check Windows Defender
          Firewall. Allow inbound TCP on port 3000 (or whichever port you configured).
        </p>

        <h3 className="text-lg font-medium mt-4">Still stuck?</h3>
        <p>
          If none of the above works, the quickest path is to set up a Cloudflare Tunnel (free) or Tailscale
          (free for personal use), point it at <code>localhost:3000</code>, and enter the resulting public URL as
          your External URL. This avoids all router and NAT issues entirely.
        </p>
      </section>

      {/* ── Self-healing ── */}
      <section id="self-healing" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Self-Healing Mesh</h2>
        <p>AnimeDB instances form a self-healing peer mesh that handles dynamic IPs automatically.</p>

        <h3 className="text-lg font-medium mt-4">How it works</h3>
        <ul>
          <li><strong>Announce on startup</strong> &mdash; When your instance starts (or its External URL changes), it notifies all linked peers of its new address. Peers update their stored URL automatically.</li>
          <li><strong>Instance ID tracking</strong> &mdash; Peers are tracked by their permanent Instance ID, not by URL. So even if an address changes, the peer relationship is preserved.</li>
          <li><strong>Gossip resolve</strong> &mdash; If a peer becomes unreachable, click the <strong>Resolve</strong> button. Your instance asks all <em>other</em> known peers &ldquo;do you know the current URL for this instance ID?&rdquo; If any peer has a fresh address, it&rsquo;s used to update your connection.</li>
        </ul>

        <h3 className="text-lg font-medium mt-4">Failure mode</h3>
        <p>
          The mesh breaks only if <em>all</em> peers of a given instance go offline simultaneously <em>and</em> their IPs
          all change before any of them come back. In practice this is extremely unlikely. Even with just two peers, one will almost
          always be able to announce its new address to the other.
        </p>
      </section>

      {/* ── Docker ── */}
      <section id="docker" className="mb-10">
        <h2 className="text-xl font-semibold border-b border-gray-800 pb-2">Docker &amp; Configuration</h2>

        <h3 className="text-lg font-medium mt-4">Environment variables</h3>
        <div className="not-prose overflow-x-auto">
          <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
            <thead><tr className="bg-gray-900 text-gray-400 text-left"><th className="px-3 py-2">Variable</th><th className="px-3 py-2">Default</th><th className="px-3 py-2">Description</th></tr></thead>
            <tbody className="text-gray-300">
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PORT</td><td className="px-3 py-2">3000</td><td className="px-3 py-2">Server port</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">OUTPUT_FORMAT</td><td className="px-3 py-2">mkv</td><td className="px-3 py-2">Video container format</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">DB_PATH</td><td className="px-3 py-2">./data/animedb.sqlite</td><td className="px-3 py-2">SQLite database file path</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">DOWNLOAD_PATH</td><td className="px-3 py-2">./downloads</td><td className="px-3 py-2">Temporary download staging directory</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">MEDIA_PATH</td><td className="px-3 py-2">./media</td><td className="px-3 py-2">Organized media library root</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">INSTANCE_NAME</td><td className="px-3 py-2">AnimeDB</td><td className="px-3 py-2">Display name shown to peers</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">EXTERNAL_URL</td><td className="px-3 py-2"><em>none</em></td><td className="px-3 py-2">Public URL for federation (skips UPnP if set)</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_URL</td><td className="px-3 py-2"><em>none</em></td><td className="px-3 py-2">Plex server URL</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_TOKEN</td><td className="px-3 py-2"><em>none</em></td><td className="px-3 py-2">Plex authentication token</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_SECTION_MOVIES</td><td className="px-3 py-2">1</td><td className="px-3 py-2">Plex section ID for movies</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">PLEX_SECTION_TV</td><td className="px-3 py-2">2</td><td className="px-3 py-2">Plex section ID for TV shows</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-medium mt-4">Docker volumes</h3>
        <div className="not-prose overflow-x-auto">
          <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
            <thead><tr className="bg-gray-900 text-gray-400 text-left"><th className="px-3 py-2">Container path</th><th className="px-3 py-2">Purpose</th></tr></thead>
            <tbody className="text-gray-300">
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">/data</td><td className="px-3 py-2">SQLite database (persist with a volume)</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">/downloads</td><td className="px-3 py-2">Temporary download staging area</td></tr>
              <tr className="border-t border-gray-800"><td className="px-3 py-2 font-mono text-xs">/media</td><td className="px-3 py-2">Organized media library</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-medium mt-4">UPnP in Docker</h3>
        <p>
          UPnP requires direct LAN access. On Linux, add <code>network_mode: host</code> to your
          <code> docker-compose.yml</code>. On Docker Desktop (Windows/Mac), UPnP won&rsquo;t work &mdash;
          set <code>EXTERNAL_URL</code> manually and handle port forwarding yourself.
        </p>
      </section>

      <footer className="border-t border-gray-800 pt-4 text-gray-600 text-xs">
        AnimeDB &mdash; Self-hosted anime download manager
      </footer>
    </div>
  );
}
