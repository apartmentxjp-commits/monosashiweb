import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('MONO-SASHI story', () => {
  it('renders the story landmarks and final action', () => {
    render(<Home />);
    expect(screen.getByText('まだ、見ぬ未来へ。')).toBeInTheDocument();
    expect(screen.getAllByText('未来は、自分で選ぶ。').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: '未来をシミュレーションする' })[0])
      .toHaveAttribute('href', 'https://real-estate-investment-simulator.vercel.app/');
  });

  it('contains the full 50-year ruler', () => {
    render(<Home />);
    for (const year of ['0年', '5年', '10年', '20年', '30年', '40年', '50年']) {
      expect(screen.getAllByText(year).length).toBeGreaterThan(0);
    }
  });
});
