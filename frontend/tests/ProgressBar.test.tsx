import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBar from '../src/components/ProgressBar';

describe('ProgressBar', () => {
  it('renders the correct percentage text', () => {
    render(<ProgressBar percent={50} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('clamps negative values to 0', () => {
    render(<ProgressBar percent={-10} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('clamps values over 100 to 100', () => {
    render(<ProgressBar percent={150} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('sets correct width on the progress bar', () => {
    render(<ProgressBar percent={75} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle({ width: '75%' });
  });

  it('renders 0% bar for zero progress', () => {
    render(<ProgressBar percent={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle({ width: '0%' });
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders full bar at 100%', () => {
    render(<ProgressBar percent={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('has correct aria attributes', () => {
    render(<ProgressBar percent={42} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });
});
