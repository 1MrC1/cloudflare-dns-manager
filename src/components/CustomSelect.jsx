import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

const CustomSelect = ({ value, options, onChange, placeholder = "Select..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleSelect = (val) => {
        onChange({ target: { value: val } });
        setIsOpen(false);
    };

    const selectedOption = options.find(o => String(o.value) === String(value));
    const currentLabel = selectedOption ? selectedOption.label : value;

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            <button
                type="button"
                className="unstyled"
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                style={{
                    padding: '0.625rem 0.875rem',
                    background: 'var(--card-bg, white)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.875rem',
                    minHeight: '42px',
                    width: '100%',
                    borderColor: isOpen ? 'var(--primary)' : 'var(--border)',
                    boxShadow: isOpen ? '0 0 0 3px rgba(243, 128, 32, 0.1)' : 'none',
                    transition: 'all 0.2s'
                }}
            >
                <span style={{ color: selectedOption ? 'var(--text)' : 'var(--text-muted)' }}>
                    {currentLabel || placeholder}
                </span>
                <ChevronDown size={16} color="var(--text-muted)" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
            </button>
            {isOpen && (
                <div role="listbox" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--card-bg, white)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    marginTop: '4px',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    zIndex: 50,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}>
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            role="option"
                            tabIndex={0}
                            aria-selected={String(opt.value) === String(value)}
                            onClick={() => handleSelect(opt.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(opt.value); } }}
                            style={{
                                padding: '0.625rem 0.875rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                background: String(opt.value) === String(value) ? 'var(--select-active-bg, #fff7ed)' : 'transparent',
                                color: String(opt.value) === String(value) ? 'var(--primary)' : 'var(--text)',
                                fontWeight: String(opt.value) === String(value) ? '500' : '400',
                                borderBottom: '1px solid var(--border-light, #f7fafc)'
                            }}
                            onMouseEnter={(e) => { if (String(opt.value) !== String(value)) e.target.style.background = 'var(--hover-bg, #f9fafb)'; }}
                            onMouseLeave={(e) => { if (String(opt.value) !== String(value)) e.target.style.background = 'transparent'; }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
