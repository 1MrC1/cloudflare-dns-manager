import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../src/components/ErrorBoundary.jsx';

const t = (key) => key;

// Suppress console.error from ErrorBoundary's componentDidCatch during tests
beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * Component that throws an error during render.
 */
function ThrowingChild({ shouldThrow = true }) {
    if (shouldThrow) {
        throw new Error('Test render error');
    }
    return <div>Child rendered successfully</div>;
}

/**
 * Component that throws on demand (via state change).
 */
function ConditionalThrow() {
    const [shouldThrow, setShouldThrow] = React.useState(false);
    if (shouldThrow) {
        throw new Error('Conditional error');
    }
    return (
        <div>
            <span>No error yet</span>
            <button onClick={() => setShouldThrow(true)}>Trigger error</button>
        </div>
    );
}

describe('ErrorBoundary component', () => {
    it('renders children normally when no error occurs', () => {
        render(
            <ErrorBoundary t={t}>
                <div>Hello World</div>
            </ErrorBoundary>
        );

        expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders multiple children normally', () => {
        render(
            <ErrorBoundary t={t}>
                <div>Child A</div>
                <div>Child B</div>
            </ErrorBoundary>
        );

        expect(screen.getByText('Child A')).toBeInTheDocument();
        expect(screen.getByText('Child B')).toBeInTheDocument();
    });

    it('catches errors and shows fallback error UI', () => {
        render(
            <ErrorBoundary t={t}>
                <ThrowingChild shouldThrow={true} />
            </ErrorBoundary>
        );

        // Children should not be rendered
        expect(screen.queryByText('Child rendered successfully')).not.toBeInTheDocument();

        // Default error boundary UI should show translated keys
        expect(screen.getByText('errorBoundaryTitle')).toBeInTheDocument();
        expect(screen.getByText('errorBoundaryMessage')).toBeInTheDocument();
        expect(screen.getByText('errorBoundaryRetry')).toBeInTheDocument();
    });

    it('retry button resets error state and re-renders children', () => {
        // Use an external flag that the test controls to decide whether to throw.
        const control = { shouldThrow: true };

        function MaybeThrow() {
            if (control.shouldThrow) {
                throw new Error('First render error');
            }
            return <div>Recovered successfully</div>;
        }

        render(
            <ErrorBoundary t={t}>
                <MaybeThrow />
            </ErrorBoundary>
        );

        // First render should show error UI
        expect(screen.getByText('errorBoundaryTitle')).toBeInTheDocument();

        // Set the flag so the child will succeed on the next render
        control.shouldThrow = false;

        // Click the retry button
        const retryButton = screen.getByText('errorBoundaryRetry');
        fireEvent.click(retryButton);

        // After retry, the component should re-render successfully
        expect(screen.getByText('Recovered successfully')).toBeInTheDocument();
        expect(screen.queryByText('errorBoundaryTitle')).not.toBeInTheDocument();
    });

    it('uses custom fallback when provided', () => {
        const customFallback = ({ error, resetError }) => (
            <div>
                <span>Custom error: {error.message}</span>
                <button onClick={resetError}>Custom retry</button>
            </div>
        );

        render(
            <ErrorBoundary t={t} fallback={customFallback}>
                <ThrowingChild shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByText('Custom error: Test render error')).toBeInTheDocument();
        expect(screen.getByText('Custom retry')).toBeInTheDocument();
    });

    it('custom fallback retry resets error state', () => {
        const control = { shouldThrow: true };

        function MaybeThrowCustom() {
            if (control.shouldThrow) {
                throw new Error('Custom throw');
            }
            return <div>Custom recovered</div>;
        }

        const customFallback = ({ resetError }) => (
            <div>
                <button onClick={resetError}>Custom reset</button>
            </div>
        );

        render(
            <ErrorBoundary t={t} fallback={customFallback}>
                <MaybeThrowCustom />
            </ErrorBoundary>
        );

        expect(screen.getByText('Custom reset')).toBeInTheDocument();

        // Set the flag so the child will succeed on re-render
        control.shouldThrow = false;

        fireEvent.click(screen.getByText('Custom reset'));

        expect(screen.getByText('Custom recovered')).toBeInTheDocument();
    });

    it('calls console.error when an error is caught', () => {
        render(
            <ErrorBoundary t={t}>
                <ThrowingChild shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(console.error).toHaveBeenCalled();
    });

    it('works with t as a non-function (falls back to key identity)', () => {
        render(
            <ErrorBoundary t={null}>
                <ThrowingChild shouldThrow={true} />
            </ErrorBoundary>
        );

        // When t is null, the component uses (key) => key as fallback
        expect(screen.getByText('errorBoundaryTitle')).toBeInTheDocument();
    });
});
