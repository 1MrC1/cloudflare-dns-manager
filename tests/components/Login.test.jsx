import React from 'react';
import { render, screen } from '@testing-library/react';
import Login from '../../src/components/Login.jsx';

// Mock fetch for the useEffect that calls /api/public-settings
beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
        Promise.resolve({
            json: () => Promise.resolve({ openRegistration: false }),
        })
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

const t = (key) => key;

describe('Login component', () => {
    it('renders without crashing', () => {
        render(<Login onLogin={vi.fn()} t={t} lang="en" onLangChange={vi.fn()} />);
    });

    it('shows the DNS Manager heading', () => {
        render(<Login onLogin={vi.fn()} t={t} lang="en" onLangChange={vi.fn()} />);
        expect(screen.getByText('title')).toBeInTheDocument();
    });

    it('has login form elements (username and password inputs)', () => {
        render(<Login onLogin={vi.fn()} t={t} lang="en" onLangChange={vi.fn()} />);
        // The server mode tab is active by default, showing username and password fields
        const usernameInput = screen.getByPlaceholderText('usernamePlaceholder');
        const passwordInput = screen.getByPlaceholderText('passwordPlaceholder');
        expect(usernameInput).toBeInTheDocument();
        expect(passwordInput).toBeInTheDocument();
    });
});
