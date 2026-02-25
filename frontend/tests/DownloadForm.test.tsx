import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DownloadForm from '../src/components/DownloadForm';
import * as api from '../src/api/client';

vi.mock('../src/api/client');

describe('DownloadForm', () => {
  const onSubmitted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all form fields', () => {
    render(<DownloadForm onSubmitted={onSubmitted} />);

    expect(screen.getByLabelText(/youtube url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to queue/i })).toBeInTheDocument();
  });

  it('shows error when submitting empty URL', async () => {
    const user = userEvent.setup();
    render(<DownloadForm onSubmitted={onSubmitted} />);

    await user.click(screen.getByRole('button', { name: /add to queue/i }));

    expect(screen.getByText(/url is required/i)).toBeInTheDocument();
    expect(api.createDownload).not.toHaveBeenCalled();
  });

  it('submits valid form data', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createDownload).mockResolvedValue({ id: '1', status: 'queued' });

    render(<DownloadForm onSubmitted={onSubmitted} />);

    await user.type(
      screen.getByLabelText(/youtube url/i),
      'https://youtube.com/watch?v=test'
    );
    await user.click(screen.getByRole('button', { name: /add to queue/i }));

    await waitFor(() => {
      expect(api.createDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://youtube.com/watch?v=test',
          category: 'other',
        })
      );
      expect(onSubmitted).toHaveBeenCalled();
    });
  });

  it('clears form after successful submit', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createDownload).mockResolvedValue({ id: '1', status: 'queued' });

    render(<DownloadForm onSubmitted={onSubmitted} />);

    const urlInput = screen.getByLabelText(/youtube url/i);
    await user.type(urlInput, 'https://youtube.com/watch?v=test');
    await user.click(screen.getByRole('button', { name: /add to queue/i }));

    await waitFor(() => {
      expect(urlInput).toHaveValue('');
    });
  });

  it('shows season/episode fields when TV category selected', async () => {
    const user = userEvent.setup();
    render(<DownloadForm onSubmitted={onSubmitted} />);

    expect(screen.queryByLabelText(/season/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/episode/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/category/i), 'tv');

    expect(screen.getByLabelText(/season/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/episode/i)).toBeInTheDocument();
  });

  it('hides season/episode when switching away from TV', async () => {
    const user = userEvent.setup();
    render(<DownloadForm onSubmitted={onSubmitted} />);

    await user.selectOptions(screen.getByLabelText(/category/i), 'tv');
    expect(screen.getByLabelText(/season/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/category/i), 'movies');
    expect(screen.queryByLabelText(/season/i)).not.toBeInTheDocument();
  });

  it('shows API error message on failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createDownload).mockRejectedValue({
      response: { data: { error: 'Invalid YouTube URL' } },
    });

    render(<DownloadForm onSubmitted={onSubmitted} />);

    await user.type(
      screen.getByLabelText(/youtube url/i),
      'https://youtube.com/watch?v=bad'
    );
    await user.click(screen.getByRole('button', { name: /add to queue/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid youtube url/i)).toBeInTheDocument();
    });
  });

  it('disables button while submitting', async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: any) => void;
    vi.mocked(api.createDownload).mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve; })
    );

    render(<DownloadForm onSubmitted={onSubmitted} />);

    await user.type(
      screen.getByLabelText(/youtube url/i),
      'https://youtube.com/watch?v=test'
    );
    await user.click(screen.getByRole('button', { name: /add to queue/i }));

    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();

    resolvePromise!({ id: '1', status: 'queued' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add to queue/i })).toBeEnabled();
    });
  });
});
