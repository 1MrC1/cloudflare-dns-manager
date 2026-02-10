import React, { createContext, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ auth, setAuth, children }) => {
    return (
        <AuthContext.Provider value={{ auth, setAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
};

export default AuthContext;
