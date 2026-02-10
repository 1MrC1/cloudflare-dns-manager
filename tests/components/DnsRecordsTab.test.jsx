import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DnsRecordsTab from '../../src/components/DnsRecordsTab.jsx';

// localStorage mock
beforeEach(() => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('none');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

const t = (key) => key;

const mockZone = { id: 'zone-1', name: 'example.com' };

const mockRecords = [
    { id: 'r1', type: 'A', name: 'example.com', content: '1.2.3.4', ttl: 1, proxied: true, tags: [] },
    { id: 'r2', type: 'CNAME', name: 'www.example.com', content: 'example.com', ttl: 3600, proxied: false, tags: [] },
    { id: 'r3', type: 'MX', name: 'example.com', content: 'mail.example.com', ttl: 1, proxied: false, priority: 10, tags: [] },
];

const defaultProps = {
    zone: mockZone,
    records: mockRecords,
    setRecords: vi.fn(),
    filteredRecords: mockRecords,
    loading: false,
    searchTerm: '',
    setSearchTerm: vi.fn(),
    selectedRecords: new Set(),
    setSelectedRecords: vi.fn(),
    fetchDNS: vi.fn(),
    onOpenAddRecord: vi.fn(),
    onOpenEditRecord: vi.fn(),
    onOpenBulkImport: vi.fn(),
    onShowHistory: vi.fn(),
    onUpdatePriority: vi.fn(),
    getHeaders: vi.fn(() => ({})),
    t,
    showToast: vi.fn(),
    openConfirm: vi.fn(),
};

describe('DnsRecordsTab component', () => {
    it('renders without crashing', () => {
        render(<DnsRecordsTab {...defaultProps} />);
    });

    it('renders records table with correct headers', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        // Table headers are rendered via t() keys
        expect(screen.getAllByText('type').length).toBeGreaterThan(0);
        expect(screen.getAllByText('content').length).toBeGreaterThan(0);
        expect(screen.getAllByText('ttl').length).toBeGreaterThan(0);
        expect(screen.getAllByText('proxied').length).toBeGreaterThan(0);
        expect(screen.getAllByText('actions').length).toBeGreaterThan(0);
    });

    it('renders record type badges', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        expect(screen.getAllByText('A').length).toBeGreaterThan(0);
        expect(screen.getAllByText('CNAME').length).toBeGreaterThan(0);
        expect(screen.getAllByText('MX').length).toBeGreaterThan(0);
    });

    it('renders record names', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        expect(screen.getAllByText('example.com').length).toBeGreaterThan(0);
        expect(screen.getAllByText('www.example.com').length).toBeGreaterThan(0);
    });

    it('renders record content', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        expect(screen.getAllByText('1.2.3.4').length).toBeGreaterThan(0);
        expect(screen.getAllByText('mail.example.com').length).toBeGreaterThan(0);
    });

    it('shows empty state when filteredRecords is empty', () => {
        render(
            <DnsRecordsTab
                {...defaultProps}
                records={[]}
                filteredRecords={[]}
            />
        );

        // Table body should have no record rows (no type badges rendered)
        expect(screen.queryByText('1.2.3.4')).not.toBeInTheDocument();
    });

    it('renders group by toggle buttons', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        // The three group-by options should be present
        expect(screen.getByText('groupByNone')).toBeInTheDocument();
        expect(screen.getByText('groupByType')).toBeInTheDocument();
        expect(screen.getByText('groupBySubdomain')).toBeInTheDocument();
    });

    it('group by type works when button is clicked', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        const typeButton = screen.getByText('groupByType');
        fireEvent.click(typeButton);

        // After clicking, localStorage should be updated
        expect(Storage.prototype.setItem).toHaveBeenCalledWith('dns_group_by', 'type');
    });

    it('shows TTL auto text for ttl=1', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        // Records with ttl === 1 show t('ttlAuto')
        expect(screen.getAllByText('ttlAuto').length).toBeGreaterThan(0);
    });

    it('shows numeric TTL for non-auto values', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        expect(screen.getAllByText('3600').length).toBeGreaterThan(0);
    });

    it('inline edit triggers on double-click of content cell', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        // Find a content cell (by the record content text, then its parent cell)
        const contentCells = document.querySelectorAll('.inline-edit-cell');
        expect(contentCells.length).toBeGreaterThan(0);

        // Double-click the first content cell
        fireEvent.doubleClick(contentCells[0]);

        // After double-click, an input should appear in the inline-edit-wrapper
        const editInput = document.querySelector('.inline-edit-wrapper input');
        expect(editInput).not.toBeNull();
    });

    it('renders checkboxes for record selection', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        // Each record row has a checkbox, plus the header checkbox
        const checkboxes = screen.getAllByRole('checkbox');
        // At minimum: 1 header + number of records (desktop table)
        expect(checkboxes.length).toBeGreaterThanOrEqual(mockRecords.length + 1);
    });

    it('renders edit and delete buttons for each record', () => {
        render(<DnsRecordsTab {...defaultProps} />);

        // Each record has an edit and delete button with aria-labels
        for (const record of mockRecords) {
            const editButtons = screen.getAllByLabelText(`Edit ${record.name}`);
            expect(editButtons.length).toBeGreaterThan(0);
            const deleteButtons = screen.getAllByLabelText(`Delete ${record.name}`);
            expect(deleteButtons.length).toBeGreaterThan(0);
        }
    });
});
