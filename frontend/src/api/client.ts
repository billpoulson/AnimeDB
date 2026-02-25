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

export async function moveToLibrary(id: string): Promise<void> {
  await api.post(`/downloads/${id}/move`);
}

export async function deleteDownload(id: string): Promise<void> {
  await api.delete(`/downloads/${id}`);
}

export async function getConfig(): Promise<{ outputFormat: string; plexConnected: boolean; plexUrl: string | null }> {
  const res = await api.get('/config');
  return res.data;
}
