import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedUser = localStorage.getItem('sp_user');
        if (savedUser) setUser(JSON.parse(savedUser));
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        const { data } = await api.post('/api/token/', { username, password });
        localStorage.setItem('sp_access', data.access);
        localStorage.setItem('sp_refresh', data.refresh);
        localStorage.setItem('sp_user', JSON.stringify({ username }));
        setUser({ username });
        return data;
    };

    const register = async (username, email, password) => {
        const { data } = await api.post('/users/register/', { username, email, password });
        return data;
    };

    const logout = async () => {
        try {
            const refresh = localStorage.getItem('sp_refresh');
            if (refresh) {
                await api.post('/users/logout/', { refresh });
            }
        } catch (err) {
            console.error('Logout request failed:', err);
        } finally {
            localStorage.clear();
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
