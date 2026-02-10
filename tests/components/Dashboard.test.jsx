import React from 'react';
import { render, screen } from '@testing-library/react';
import Dashboard from '../../src/components/Dashboard.jsx';
import { AuthProvider } from '../../src/contexts/AuthContext.jsx';
import { ToastProvider } from '../../src/contexts/ToastContext.jsx';
import { ThemeProvider } from '../../src/contexts/ThemeContext.jsx';

// Mock fetch for the audit log useEffect
beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
        Promise.resolve(
            new Response(JSON.stringify({ entries: [] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        )
    );
    // localStorage mock
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{}');
});

afterEach(() => {
    vi.restoreAllMocks();
});

const t = (key) => key;

const defaultZones = [
    { id: 'z1', name: 'example.com' },
    { id: 'z2', name: 'example.org' },
    { id: 'z3', name: 'example.net' },
];

const defaultAuth = {
    mode: 'client',
    token: 'test-token',
};

const renderWithProviders = (ui, { auth = defaultAuth } = {}) => {
    return render(
        <AuthProvider auth={auth} setAuth={() => {}}>
            <ToastProvider showToast={() => {}}>
                <ThemeProvider t={t} lang="en" changeLang={() => {}} toggleLang={() => {}} darkMode={false} setDarkMode={() => {}}>
                    {ui}
                </ThemeProvider>
            </ToastProvider>
        </AuthProvider>
    );
};

describe('Dashboard component', () => {
    it('renders without crashing', () => {
        renderWithProviders(<Dashboard zones={defaultZones} />);
    });

    it('renders stat cards', () => {
        renderWithProviders(<Dashboard zones={defaultZones} />);

        // Check that dashboard card labels are rendered via translation keys
        expect(screen.getByText('dashboardZones')).toBeInTheDocument();
        expect(screen.getByText('dashboardRecords')).toBeInTheDocument();
        expect(screen.getByText('dashboardAccounts')).toBeInTheDocument();
        expect(screen.getByText('dashboardLastLogin')).toBeInTheDocument();
    });

    it('shows the correct zone count', () => {
        renderWithProviders(<Dashboard zones={defaultZones} />);

        // Zone count should be rendered as text "3"
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows zone count of 0 for empty zones array', () => {
        renderWithProviders(<Dashboard zones={[]} />);
        expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('renders dnsRecords translation key as records card value', () => {
        renderWithProviders(<Dashboard zones={defaultZones} />);
        // The records card shows t('dnsRecords') as its value
        expect(screen.getByText('dnsRecords')).toBeInTheDocument();
    });

    it('does not show activity section for non-admin client mode', () => {
        renderWithProviders(<Dashboard zones={defaultZones} />);
        // The recent activity section is only shown for server mode admins
        expect(screen.queryByText('dashboardRecentActivity')).not.toBeInTheDocument();
    });

    it('shows activity section for server mode admin', async () => {
        const adminAuth = {
            mode: 'server',
            token: 'admin-jwt',
            role: 'admin',
            sessions: [],
        };

        renderWithProviders(<Dashboard zones={defaultZones} />, { auth: adminAuth });

        // The recent activity heading should appear
        expect(screen.getByText('dashboardRecentActivity')).toBeInTheDocument();
    });

    it('shows loading indicator while audit log is loading', () => {
        // Make fetch never resolve to keep loading state
        globalThis.fetch = vi.fn(() => new Promise(() => {}));

        const adminAuth = {
            mode: 'server',
            token: 'admin-jwt',
            role: 'admin',
            sessions: [],
        };

        renderWithProviders(<Dashboard zones={defaultZones} />, { auth: adminAuth });

        // Loading indicator is "..."
        expect(screen.getByText('...')).toBeInTheDocument();
    });

    it('shows "no activity" message when audit log is empty', async () => {
        // fetch resolves immediately with empty entries
        globalThis.fetch = vi.fn(() =>
            Promise.resolve(
                new Response(JSON.stringify({ entries: [] }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            )
        );

        const adminAuth = {
            mode: 'server',
            token: 'admin-jwt',
            role: 'admin',
            sessions: [],
        };

        renderWithProviders(<Dashboard zones={defaultZones} />, { auth: adminAuth });

        // Wait for the async fetch to complete
        const noActivity = await screen.findByText('dashboardNoActivity');
        expect(noActivity).toBeInTheDocument();
    });
});
