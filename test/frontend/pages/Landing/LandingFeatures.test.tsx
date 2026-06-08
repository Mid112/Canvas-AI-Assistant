import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LandingFeatures } from '@/pages/Landing/LandingFeatures';

describe('LandingFeatures', () => {
  it('renders all feature cards correctly', () => {
    render(<LandingFeatures />);
    
    expect(screen.getByText(/Conversational AI/i)).toBeDefined();
    expect(screen.getByText(/Workflow Previews/i)).toBeDefined();
    expect(screen.getByText(/Local AI Privacy/i)).toBeDefined();
    expect(screen.getByText(/Audit Logging/i)).toBeDefined();
  });
});
