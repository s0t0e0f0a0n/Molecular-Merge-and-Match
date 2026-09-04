import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock SVG imports so exercise data and spectrum viewers don't require real assets in tests.
vi.mock('*.svg', () => ({ default: '/mock-spectrum.svg' }));
