import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LandingHero } from '@/pages/Landing/LandingHero';
import { renderWithRouter } from '../../utils/renderWithRouter';
import { paths } from '../../../../app/frontend/src/routes/paths';

describe('LandingHero', () => {
  it('renders the main heading and description', () => {
    renderWithRouter(<LandingHero />);
    
    expect(
      screen.getByRole('heading', {
        name: /Manage Canvas Workflows Using Natural Language/i,
      }),
    ).toBeDefined();
    expect(
      screen.getByText(/Streamline your course management with AI-powered assistance/i),
    ).toBeDefined();
  });

  it('renders call-to-action buttons with correct routing links', () => {
    renderWithRouter(<LandingHero />);
    
    const getStartedLink = screen.getByRole('link', { name: /Get Started/i });
    const learnMoreLink = screen.getByRole('link', { name: /Learn More/i });

    expect(getStartedLink.getAttribute('href')).toBe(paths.register);
    expect(learnMoreLink.getAttribute('href')).toBe('#features');
  });
});
