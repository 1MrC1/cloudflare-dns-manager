import React, { useState, useRef } from 'react';
import { X, Upload, Search, RefreshCw } from 'lucide-react';

const VALID_TYPES = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR', 'SOA', 'SPF', 'TLSA', 'SSHFP', 'DS', 'NAPTR', 'HTTPS', 'SVCB', 'URI', 'LOC', 'CERT']);

const DnsImportModal = ({ zone, show, onClose, onImportComplete, auth, getHeaders, t, showToast }) => {
    const [bulkImportJson, setBulkImportJson] = useState('');
    const [bulkImportPreview, setBulkImportPreview] = useState(null);
    const [bulkImportLoading, setBulkImportLoading] = useState(false);
    const [bulkImportResult, setBulkImportResult] = useState(null);
    const [detectedFormat, setDetectedFormat] = useState(null);
    const jsonFileInputRef = useRef(null);

    const resetState = () => {
        setBulkImportJson('');
        setBulkImportPreview(null);
        setBulkImportLoading(false);
        setBulkImportResult(null);
        setDetectedFormat(null);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    // Detect format from content
    const detectFormat = (text) => {
        const trimmed = text.trim();
        if (!trimmed) return null;
        // JSON: starts with [ or {
        if (trimmed[0] === '[' || trimmed[0] === '{') return 'json';
        // CSV: first line has comma-separated headers including common DNS fields
        const firstLine = trimmed.split('\n')[0].toLowerCase();
        if (firstLine.includes(',') && (firstLine.includes('type') || firstLine.includes('name') || firstLine.includes('content'))) return 'csv';
        // BIND: contains lines with IN keyword
        const lines = trimmed.split('\n').filter(l => l.trim() && !l.trim().startsWith(';') && !l.trim().startsWith('$'));
        const bindPattern = /\bIN\s+(A|AAAA|CNAME|MX|TXT|NS|SRV|CAA|PTR|SOA)\b/i;
        if (lines.some(l => bindPattern.test(l))) return 'bind';
        return 'json'; // default fallback
    };

    // Parse JSON format
    const parseJsonFormat = (text) => {
        try {
            const parsed = JSON.parse(text);
            const records = parsed.records || parsed;
            if (!Array.isArray(records)) return { error: t('invalidJson') };
            if (records.length === 0) return { error: t('noRecordsFound') };
            return { records };
        } catch {
            return { error: t('invalidJson') };
        }
    };

    // Parse BIND zone file format
    const parseBindFormat = (text) => {
        const records = [];
        const lines = text.split('\n');
        let lastOwner = '@';

        for (const rawLine of lines) {
            const line = rawLine.replace(/;.*$/, '').trim();
            if (!line || line.startsWith('$')) continue;

            // Match patterns like: name [TTL] [CLASS] TYPE content
            // or: [TTL] [CLASS] TYPE content (using last owner)
            const bindRegex = /^(\S+)?\s+(?:(\d+)\s+)?(?:IN\s+)?(\S+)\s+(.+)$/i;
            const match = line.match(bindRegex);
            if (!match) continue;

            let [, owner, ttlStr, type, content] = match;
            type = type.toUpperCase();

            if (!VALID_TYPES.has(type)) {
                // Try without owner: TTL IN TYPE content
                const altRegex = /^(?:(\d+)\s+)?IN\s+(\S+)\s+(.+)$/i;
                const altMatch = line.match(altRegex);
                if (altMatch) {
                    ttlStr = altMatch[1];
                    type = altMatch[2].toUpperCase();
                    content = altMatch[3];
                    owner = null;
                } else {
                    continue;
                }
            }

            if (owner) lastOwner = owner;
            const name = (owner || lastOwner || '@').replace(/\.$/, '');
            const ttl = ttlStr ? parseInt(ttlStr) : 1;

            // Clean content - remove trailing dot, surrounding quotes for TXT
            let cleanContent = content.trim().replace(/\.$/, '');
            if (type === 'TXT' && cleanContent.startsWith('"') && cleanContent.endsWith('"')) {
                cleanContent = cleanContent.slice(1, -1);
            }

            const record = { type, name, content: cleanContent, ttl };

            // Handle MX priority
            if (type === 'MX') {
                const mxMatch = cleanContent.match(/^(\d+)\s+(.+)$/);
                if (mxMatch) {
                    record.priority = parseInt(mxMatch[1]);
                    record.content = mxMatch[2].replace(/\.$/, '');
                }
            }

            records.push(record);
        }

        if (records.length === 0) return { error: t('noRecordsFound') };
        return { records };
    };

    // Parse CSV format
    const parseCsvFormat = (text) => {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return { error: t('noRecordsFound') };

        // Parse header
        const headerLine = lines[0].toLowerCase().trim();
        const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

        const typeIdx = headers.indexOf('type');
        const nameIdx = headers.indexOf('name');
        const contentIdx = headers.indexOf('content');
        const ttlIdx = headers.indexOf('ttl');
        const proxiedIdx = headers.indexOf('proxied');
        const priorityIdx = headers.indexOf('priority');

        if (typeIdx === -1 || nameIdx === -1 || contentIdx === -1) {
            return { error: t('importCsvMissingHeaders') };
        }

        const records = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple CSV parsing (handles quoted fields with commas)
            const fields = [];
            let current = '';
            let inQuotes = false;
            for (const ch of line) {
                if (ch === '"') { inQuotes = !inQuotes; continue; }
                if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
                current += ch;
            }
            fields.push(current.trim());

            const type = (fields[typeIdx] || '').toUpperCase();
            const name = fields[nameIdx] || '@';
            const content = fields[contentIdx] || '';

            if (!type || !content) continue;

            const record = { type, name, content };
            if (ttlIdx !== -1 && fields[ttlIdx]) {
                const ttlVal = parseInt(fields[ttlIdx]);
                record.ttl = isNaN(ttlVal) ? 1 : ttlVal;
            }
            if (proxiedIdx !== -1 && fields[proxiedIdx]) {
                record.proxied = fields[proxiedIdx].toLowerCase() === 'true' || fields[proxiedIdx] === '1';
            }
            if (priorityIdx !== -1 && fields[priorityIdx]) {
                const pri = parseInt(fields[priorityIdx]);
                if (!isNaN(pri)) record.priority = pri;
            }

            records.push(record);
        }

        if (records.length === 0) return { error: t('noRecordsFound') };
        return { records };
    };

    // Auto-detect and parse
    const parseImportData = (text) => {
        const format = detectFormat(text);
        setDetectedFormat(format);

        switch (format) {
            case 'json': return parseJsonFormat(text);
            case 'bind': return parseBindFormat(text);
            case 'csv': return parseCsvFormat(text);
            default: return parseJsonFormat(text);
        }
    };

    const handleBulkImportPreview = () => {
        const result = parseImportData(bulkImportJson);
        if (result.error) {
            showToast(result.error, 'error');
            setBulkImportPreview(null);
            return;
        }
        setBulkImportPreview(result.records);
        setBulkImportResult(null);
    };

    const handleJsonFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setBulkImportJson(ev.target.result);
            setBulkImportPreview(null);
            setBulkImportResult(null);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleBulkImportSubmit = async () => {
        if (!bulkImportPreview || bulkImportPreview.length === 0) return;
        setBulkImportLoading(true);
        setBulkImportResult(null);
        try {
            const res = await fetch(`/api/zones/${zone.id}/dns_import`, {
                method: 'POST',
                headers: getHeaders(true),
                body: JSON.stringify({ records: bulkImportPreview })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setBulkImportResult({ created: data.created, total: data.total, errors: data.errors || [] });
                onImportComplete();
                if (data.created > 0) {
                    showToast(t('importResultCreated').replace('{count}', data.created));
                }
            } else {
                showToast(data.error || t('errorOccurred'), 'error');
            }
        } catch {
            showToast(t('errorOccurred'), 'error');
        }
        setBulkImportLoading(false);
    };

    if (!show) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
            <div className="glass-card fade-in modal-content" role="dialog" aria-label={t('bulkImport')} style={{ padding: '2rem', maxWidth: '600px', width: '90%', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ margin: 0 }}>{t('bulkImport')}</h2>
                    <button className="btn btn-outline" style={{ padding: '4px', border: 'none' }} onClick={handleClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t('bulkImportDesc')}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>{t('importFormatHint')}</p>

                {detectedFormat && (
                    <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('importDetectedFormat')}:</span>
                        <span className="badge badge-blue" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                            {detectedFormat.toUpperCase()}
                        </span>
                    </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>{t('importPasteData')}</label>
                    <textarea
                        value={bulkImportJson}
                        onChange={(e) => { setBulkImportJson(e.target.value); setBulkImportPreview(null); setBulkImportResult(null); }}
                        placeholder={t('importPlaceholder')}
                        style={{
                            width: '100%',
                            minHeight: '120px',
                            padding: '0.75rem',
                            fontSize: '0.8125rem',
                            fontFamily: 'monospace',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            resize: 'vertical',
                            background: 'var(--card-bg, white)',
                            color: 'var(--text)'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <input
                        type="file"
                        ref={jsonFileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleJsonFileUpload}
                        accept=".json,.csv,.txt,.zone"
                    />
                    <button type="button" className="btn btn-outline" style={{ fontSize: '0.8125rem' }} onClick={() => jsonFileInputRef.current.click()}>
                        <Upload size={14} />
                        {t('importUploadFile')}
                    </button>
                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.8125rem' }} onClick={handleBulkImportPreview} disabled={!bulkImportJson.trim()}>
                        <Search size={14} />
                        {t('previewRecords')}
                    </button>
                </div>

                {/* Preview Table */}
                {bulkImportPreview && bulkImportPreview.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            {bulkImportPreview.length} {t('dnsRecords').toLowerCase()}
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card-bg, white)' }}>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>#</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{t('type')}</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{t('name')}</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{t('content')}</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>TTL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bulkImportPreview.map((rec, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                            <td style={{ padding: '0.4rem 0.5rem' }}>
                                                <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{rec.type}</span>
                                            </td>
                                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.name}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.content}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)' }}>{rec.ttl || 'Auto'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Import Result */}
                {bulkImportResult && (
                    <div style={{
                        padding: '0.75rem',
                        borderRadius: '6px',
                        marginBottom: '1rem',
                        background: bulkImportResult.errors.length > 0 ? 'var(--error-bg)' : 'var(--success-bg)',
                        border: `1px solid ${bulkImportResult.errors.length > 0 ? 'var(--diff-removed-border)' : 'var(--success-border)'}`
                    }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: bulkImportResult.errors.length > 0 ? 'var(--error)' : 'var(--success-text)', marginBottom: bulkImportResult.errors.length > 0 ? '0.5rem' : 0 }}>
                            {t('importResultCreated').replace('{count}', bulkImportResult.created)}
                            {bulkImportResult.errors.length > 0 && (
                                <span style={{ marginLeft: '8px' }}>
                                    | {t('importResultErrors').replace('{count}', bulkImportResult.errors.length)}
                                </span>
                            )}
                        </div>
                        {bulkImportResult.errors.length > 0 && (
                            <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '0.75rem', color: 'var(--error)' }}>
                                {bulkImportResult.errors.map((err, idx) => (
                                    <div key={idx} style={{ padding: '2px 0' }}>
                                        #{err.index + 1}: {err.error}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={handleClose}>{t('cancel')}</button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                        onClick={handleBulkImportSubmit}
                        disabled={!bulkImportPreview || bulkImportPreview.length === 0 || bulkImportLoading}
                    >
                        {bulkImportLoading ? (
                            <><RefreshCw size={14} className="spin" /> {t('importing')}</>
                        ) : (
                            <><Upload size={14} /> {t('importRecords')}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DnsImportModal;
