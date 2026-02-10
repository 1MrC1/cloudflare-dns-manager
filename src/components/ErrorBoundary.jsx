import React from 'react';
import { AlertCircle, ChevronDown, RefreshCw } from 'lucide-react';

/**
 * React Error Boundary component.
 *
 * Catches render errors in its children and displays a friendly error card
 * styled with the project's glass-card pattern and CSS variables.
 *
 * Props:
 *   - t           (key => string)  Translation function — same signature used
 *                                  throughout the app.
 *   - children    React children to wrap.
 *   - fallback    (optional) Custom render when an error occurs.
 *                  Receives { error, resetError }.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, showDetails: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Log to console in all environments; production logging hooks could
        // be added here in the future.
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, showDetails: false });
    };

    toggleDetails = () => {
        this.setState((prev) => ({ showDetails: !prev.showDetails }));
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        // Allow a custom fallback renderer
        if (this.props.fallback) {
            return this.props.fallback({
                error: this.state.error,
                resetError: this.handleReset,
            });
        }

        const { t } = this.props;
        const translate = typeof t === 'function' ? t : (key) => key;
        const { error, showDetails } = this.state;
        const isDev =
            typeof import.meta !== 'undefined' &&
            import.meta.env &&
            import.meta.env.DEV;

        return (
            <div
                className="glass-card fade-in"
                style={{
                    maxWidth: '480px',
                    margin: '2rem auto',
                    padding: '2rem',
                    textAlign: 'center',
                }}
            >
                {/* Error icon */}
                <div
                    style={{
                        display: 'inline-flex',
                        padding: '0.75rem',
                        background: 'var(--error-bg)',
                        borderRadius: '12px',
                        marginBottom: '1rem',
                    }}
                >
                    <AlertCircle size={32} color="var(--error)" />
                </div>

                {/* Heading */}
                <h3
                    style={{
                        fontSize: '1.125rem',
                        marginBottom: '0.5rem',
                        color: 'var(--text)',
                    }}
                >
                    {translate('errorBoundaryTitle')}
                </h3>

                {/* Friendly description */}
                <p
                    style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-muted)',
                        marginBottom: '1.25rem',
                        lineHeight: '1.5',
                    }}
                >
                    {translate('errorBoundaryMessage')}
                </p>

                {/* Try Again button */}
                <button
                    className="btn btn-primary"
                    onClick={this.handleReset}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    <RefreshCw size={14} />
                    {translate('errorBoundaryRetry')}
                </button>

                {/* Collapsible error details — only visible in dev mode */}
                {isDev && error && (
                    <div style={{ marginTop: '1.25rem', textAlign: 'left' }}>
                        <button
                            onClick={this.toggleDetails}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '4px 0',
                                width: '100%',
                            }}
                        >
                            <ChevronDown
                                size={14}
                                style={{
                                    transform: showDetails
                                        ? 'rotate(180deg)'
                                        : 'rotate(0deg)',
                                    transition: 'transform 0.2s',
                                }}
                            />
                            {translate('errorBoundaryDetails')}
                        </button>
                        {showDetails && (
                            <pre
                                style={{
                                    marginTop: '0.5rem',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    background: 'var(--hover-bg)',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.7rem',
                                    color: 'var(--error)',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    textAlign: 'left',
                                }}
                            >
                                {error.toString()}
                                {error.stack ? '\n\n' + error.stack : ''}
                            </pre>
                        )}
                    </div>
                )}
            </div>
        );
    }
}

export default ErrorBoundary;
