import React, { useState, useEffect } from 'react';
import { Globe, Layers, User, Clock, Activity } from 'lucide-react';
import { getAuthHeaders } from '../utils/auth.ts';

const Dashboard = ({ zones, auth, t }) => {
    const [auditLog, setAuditLog] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);

    const zoneCount = zones.length;
    const accountCount = (() => {
        if (auth.mode === 'server') {
            const sessions = auth.sessions || [];
            let count = 0;
            for (const s of sessions) {
                count += (s.accounts || []).length || 1;
            }
            return count;
        }
        // Client/local mode: count local tokens
        const localTokens = JSON.parse(localStorage.getItem('local_cf_tokens') || '{}');
        return Math.max(Object.keys(localTokens).length, 1);
    })();

    const lastLogin = new Date().toLocaleString();

    // Fetch recent audit log entries for admin users
    useEffect(() => {
        if (auth.mode === 'server' && auth.role === 'admin') {
            setAuditLoading(true);
            fetch('/api/admin/audit-log?limit=5', {
                headers: getAuthHeaders(auth)
            })
                .then(res => res.ok ? res.json() : { entries: [] })
                .then(data => {
                    setAuditLog(data.entries || data.logs || []);
                })
                .catch(() => setAuditLog([]))
                .finally(() => setAuditLoading(false));
        }
    }, [auth.mode, auth.role, auth.token]);

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return t('dashboardJustNow');
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
        return date.toLocaleDateString();
    };

    return (
        <div className="dashboard-stats fade-in">
            <div className="dashboard-grid">
                <div className="glass-card dashboard-card">
                    <div className="dashboard-card-icon" style={{ background: 'rgba(243, 128, 32, 0.1)' }}>
                        <Globe size={20} color="var(--primary)" />
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-value">{zoneCount}</span>
                        <span className="dashboard-card-label">{t('dashboardZones')}</span>
                    </div>
                </div>

                <div className="glass-card dashboard-card">
                    <div className="dashboard-card-icon" style={{ background: 'var(--badge-blue-bg)' }}>
                        <Layers size={20} color="var(--badge-blue-text)" />
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-value">{t('dnsRecords')}</span>
                        <span className="dashboard-card-label">{t('dashboardRecords')}</span>
                    </div>
                </div>

                <div className="glass-card dashboard-card">
                    <div className="dashboard-card-icon" style={{ background: 'var(--badge-green-bg)' }}>
                        <User size={20} color="var(--badge-green-text)" />
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-value">{accountCount}</span>
                        <span className="dashboard-card-label">{t('dashboardAccounts')}</span>
                    </div>
                </div>

                <div className="glass-card dashboard-card">
                    <div className="dashboard-card-icon" style={{ background: 'var(--badge-orange-bg)' }}>
                        <Clock size={20} color="var(--badge-orange-text)" />
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-value" style={{ fontSize: '0.85rem' }}>{lastLogin}</span>
                        <span className="dashboard-card-label">{t('dashboardLastLogin')}</span>
                    </div>
                </div>
            </div>

            {auth.mode === 'server' && auth.role === 'admin' && (
                <div className="glass-card dashboard-activity">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <Activity size={16} color="var(--primary)" />
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{t('dashboardRecentActivity')}</h4>
                    </div>
                    {auditLoading ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>...</p>
                    ) : auditLog.length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('dashboardNoActivity')}</p>
                    ) : (
                        <div className="dashboard-activity-list">
                            {auditLog.slice(0, 5).map((entry, idx) => (
                                <div key={idx} className="dashboard-activity-item">
                                    <span className="dashboard-activity-time">{formatTime(entry.time || entry.timestamp)}</span>
                                    <span className="dashboard-activity-user">{entry.user || entry.username || '-'}</span>
                                    <span className="dashboard-activity-action">{entry.action || entry.type || '-'}</span>
                                    <span className="dashboard-activity-detail">{entry.detail || entry.details || ''}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
