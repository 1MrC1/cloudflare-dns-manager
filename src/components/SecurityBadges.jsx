import React from 'react';
import { Shield, Key, Fingerprint } from 'lucide-react';

const SecurityBadges = ({ t }) => {
    const badges = [
        { icon: <Shield size={10} />, label: t('badgeE2E'), bg: 'var(--badge-green-bg)', border: 'var(--badge-green-border)', fg: 'var(--badge-green-text)' },
        { icon: <Key size={10} />, label: t('badgeSHA256'), bg: 'var(--badge-blue-bg)', border: 'var(--badge-blue-border)', fg: 'var(--badge-blue-text)' },
        { icon: <Shield size={10} />, label: t('badgeZeroKnowledge'), bg: 'var(--badge-blue-bg)', border: 'var(--badge-blue-border)', fg: 'var(--badge-blue-text)' },
        { icon: <Key size={10} />, label: t('badgeJWT'), bg: 'var(--badge-orange-bg)', border: 'var(--badge-orange-border)', fg: 'var(--badge-orange-text)' },
        { icon: <Shield size={10} />, label: t('badgeHTTPS'), bg: 'var(--badge-green-bg)', border: 'var(--badge-green-border)', fg: 'var(--badge-green-text)' },
        { icon: <Key size={10} />, label: t('badgeNoPlaintext'), bg: 'var(--badge-orange-bg)', border: 'var(--badge-orange-border)', fg: 'var(--badge-orange-text)' },
        { icon: <Fingerprint size={10} />, label: t('badgePasskey'), bg: 'var(--badge-blue-bg)', border: 'var(--badge-blue-border)', fg: 'var(--badge-blue-text)' },
    ];
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center' }}>
            {badges.map((b, i) => (
                <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                    fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.01em',
                    padding: '2px 7px', borderRadius: '999px',
                    background: b.bg, color: b.fg, border: `1px solid ${b.border}`,
                }}>
                    {b.icon} {b.label}
                </span>
            ))}
        </div>
    );
};

export default SecurityBadges;
