import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LandingPage } from '@/pages/Landing/LandingPage';
import { renderWithRouter } from '@test/utils/renderWithRouter';

describe('LandingPage', () => {
  it('renders the LandingHeader, LandingHero, and LandingFeatures sections', () => {
    renderWithRouter(<LandingPage />);
    
    expect(
      screen.getByText(/Safe AI-Powered Canvas Workflow Assistant/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Manage Canvas Workflows Using Natural Language/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Conversational AI/i)).toBeInTheDocument();
  });
});
