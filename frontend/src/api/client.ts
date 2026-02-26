import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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
