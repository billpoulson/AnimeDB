import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

const TOKEN_KEY = 'animedb_token';

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

let onAuthFailure: (() => void) | null = null;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && onAuthFailure) {
      localStorage.removeItem(TOKEN_KEY);
      onAuthFailure();
    }
    return Promise.reject(err);
  },
);

export function setOnAuthFailure(cb: () => void) {
  onAuthFailure = cb;
}

// Auth

export interface AuthStatus {
  setup: boolean;
  authenticated: boolean;
  authRequired: boolean;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await api.get('/auth/status');
  const data = res.data;
  if (typeof data !== 'object' || data === null || typeof data.authRequired !== 'boolean') {
    throw new Error('Invalid auth status response');
  }
  return data;
}

export async function authSetup(password: string): Promise<string> {
  const res = await api.post('/auth/setup', { password });
  const token: string = res.data.token;
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export async function authLogin(password: string): Promise<string> {
  const res = await api.post('/auth/login', { password });
  const token: string = res.data.token;
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export async function authLogout(): Promise<void> {
  await api.post('/auth/logout');
  localStorage.removeItem(TOKEN_KEY);
}

export async function authChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await api.post('/auth/change-password', { currentPassword, newPassword });
  const token: string = res.data.token;
  localStorage.setItem(TOKEN_KEY, token);
}

export interface Download {
  id: string;
  url: string;
  title: string | null;
  category: string;
  season: number | null;
  episode: number | null;
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'failed';
  progress: number;
  file_path: string | null;
  error: string | null;
  moved_to_library: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDownloadRequest {
  url: string;
  category: 'movies' | 'tv' | 'other';
  title?: string;
  season?: number;
  episode?: number;
}

export async function createDownload(data: CreateDownloadRequest): Promise<{ id: string; status: string }> {
  const res = await api.post('/downloads', data);
  return res.data;
}

export async function getDownloads(): Promise<Download[]> {
  const res = await api.get('/downloads');
  return res.data;
}

export async function getDownload(id: string): Promise<Download> {
  const res = await api.get(`/downloads/${id}`);
  return res.data;
}

export async function cancelDownload(id: string): Promise<void> {
  await api.post(`/downloads/${id}/cancel`);
}

export async function moveToLibrary(id: string, libraryId?: string): Promise<void> {
  await api.post(`/downloads/${id}/move`, libraryId ? { library_id: libraryId } : {});
}

export async function unmoveFromLibrary(id: string): Promise<void> {
  await api.post(`/downloads/${id}/unmove`);
}

export interface UpdateDownloadRequest {
  category?: 'movies' | 'tv' | 'other';
  title?: string;
  season?: number | null;
  episode?: number | null;
}

export async function updateDownload(id: string, data: UpdateDownloadRequest): Promise<Download> {
  const res = await api.patch(`/downloads/${id}`, data);
  return res.data;
}

export async function deleteDownload(id: string): Promise<void> {
  await api.delete(`/downloads/${id}`);
}

export async function getConfig(): Promise<{ outputFormat: string; plexConnected: boolean; plexUrl: string | null }> {
  const res = await api.get('/config');
  return res.data;
}

// Libraries

export interface Library {
  id: string;
  name: string;
  path: string;
  type: 'movies' | 'tv' | 'other';
  plex_section_id: number | null;
  created_at: string;
}

export interface ScannedFolder {
  name: string;
  path: string;
  suggested_type: 'movies' | 'tv' | 'other';
}

export interface CreateLibraryRequest {
  name: string;
  path: string;
  type?: 'movies' | 'tv' | 'other';
  plex_section_id?: number | null;
}

export async function getLibraries(): Promise<Library[]> {
  const res = await api.get('/libraries');
  return res.data;
}

export async function createLibrary(data: CreateLibraryRequest): Promise<Library> {
  const res = await api.post('/libraries', data);
  return res.data;
}

export async function updateLibrary(id: string, data: Partial<CreateLibraryRequest>): Promise<Library> {
  const res = await api.patch(`/libraries/${id}`, data);
  return res.data;
}

export async function deleteLibrary(id: string): Promise<void> {
  await api.delete(`/libraries/${id}`);
}

export async function scanForFolders(): Promise<ScannedFolder[]> {
  const res = await api.get('/libraries/scan');
  return res.data;
}

// API Keys

export interface ApiKey {
  id: string;
  label: string;
  created_at: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
  connectionString: string | null;
}

export async function getApiKeys(): Promise<ApiKey[]> {
  const res = await api.get('/keys');
  return res.data;
}

export async function createApiKey(label: string): Promise<ApiKeyCreated> {
  const res = await api.post('/keys', { label });
  return res.data;
}

export async function deleteApiKey(id: string): Promise<void> {
  await api.delete(`/keys/${id}`);
}

// Peers

export interface Peer {
  id: string;
  name: string;
  url: string;
  instance_id: string | null;
  last_seen: string | null;
  created_at: string;
}

export interface RemoteLibraryItem {
  id: string;
  title: string | null;
  category: string;
  season: number | null;
  episode: number | null;
  status: string;
  created_at: string;
}

export interface RemoteLibraryResponse {
  instanceName: string;
  items: RemoteLibraryItem[];
}

export async function getPeers(): Promise<Peer[]> {
  const res = await api.get('/peers');
  return res.data;
}

export async function addPeer(data: { name: string; url: string; api_key: string }): Promise<Peer> {
  const res = await api.post('/peers', data);
  return res.data;
}

export async function deletePeer(id: string): Promise<void> {
  await api.delete(`/peers/${id}`);
}

export async function getPeerLibrary(peerId: string): Promise<RemoteLibraryResponse> {
  const res = await api.get(`/peers/${peerId}/library`);
  return res.data;
}

export async function pullFromPeer(
  peerId: string,
  downloadId: string,
  opts?: { autoMove?: boolean; libraryId?: string },
): Promise<{ id: string; status: string }> {
  const res = await api.post(`/peers/${peerId}/pull/${downloadId}`, opts || {});
  return res.data;
}

export async function replicateLibrary(
  peerId: string,
  opts?: { libraryId?: string },
): Promise<{ queued: number; skipped: number; total: number }> {
  const res = await api.post(`/peers/${peerId}/replicate`, opts || {});
  return res.data;
}

// Networking

export interface NetworkingInfo {
  instanceId: string;
  instanceName: string;
  externalUrl: string | null;
  upnp: {
    active: boolean;
    externalIp: string | null;
    externalPort: number | null;
    error: string | null;
  };
}

export async function getNetworking(): Promise<NetworkingInfo> {
  const res = await api.get('/networking');
  return res.data;
}

export async function setExternalUrl(url: string | null): Promise<{ externalUrl: string | null }> {
  const res = await api.put('/networking/external-url', { url });
  return res.data;
}

export async function retryUpnp(port?: number): Promise<{
  externalUrl: string | null;
  upnp: NetworkingInfo['upnp'];
}> {
  const res = await api.post('/networking/upnp-retry', port ? { port } : {});
  return res.data;
}

export async function resolvePeer(peerId: string): Promise<{ resolved: boolean; via?: string; peer?: Peer }> {
  const res = await api.post(`/peers/${peerId}/resolve`);
  return res.data;
}

export async function connectPeer(connectionString: string): Promise<Peer> {
  const res = await api.post('/peers/connect', { connectionString });
  return res.data;
}

// System

export interface UpdateCheckResult {
  currentSha: string;
  remoteSha: string;
  remoteDate: string;
  remoteMessage: string;
  updateAvailable: boolean;
  updateInProgress: boolean;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const res = await api.get('/system/update-check');
  return res.data;
}

export async function applyUpdate(): Promise<{ status: string; message: string }> {
  const res = await api.post('/system/update');
  return res.data;
}
