import React, { createContext, useContext } from 'react';

const ToastContext = createContext(null);

export const ToastProvider = ({ showToast, children }) => {
    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return ctx;
};

export default ToastContext;
