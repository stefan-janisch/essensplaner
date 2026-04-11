import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, setOnUnauthorized } from '../api/client.js';
import type { User } from '../types/index.js';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
  hasPendingMigration: boolean;
  runMigration: () => Promise<void>;
  skipMigration: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_KEYS = ['essensplaner_plan', 'essensplaner_meals', 'essensplaner_default_servings'];

function hasLocalData(): boolean {
  return LOCAL_STORAGE_KEYS.some(key => localStorage.getItem(key) !== null);
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPendingMigration, setHasPendingMigration] = useState(false);

  const clearAuth = useCallback(() => {
    setUser(null);
    setHasPendingMigration(false);
  }, []);

  // Set up 401 handler
  useEffect(() => {
    setOnUnauthorized(clearAuth);
  }, [clearAuth]);

  // Check session on mount
  useEffect(() => {
    api.get<User>('/api/auth/me')
      .then(u => {
        setUser(u);
        if (hasLocalData()) setHasPendingMigration(true);
      })
      .catch(() => { /* not logged in */ })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const u = await api.post<User>('/api/auth/login', { email, password });
    setUser(u);
    if (hasLocalData()) setHasPendingMigration(true);
  };

  const register = async (email: string, password: string): Promise<string> => {
    const result = await api.post<{ message: string }>('/api/auth/register', { email, password });
    return result.message;
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    setHasPendingMigration(false);
  };

  const runMigration = async () => {
    const savedMeals = localStorage.getItem('essensplaner_meals');
    const savedPlan = localStorage.getItem('essensplaner_plan');
    const savedServings = localStorage.getItem('essensplaner_default_servings');

    const meals = savedMeals ? JSON.parse(savedMeals) : [];
    const plan = savedPlan ? JSON.parse(savedPlan) : null;
    const defaultServings = savedServings ? Number(savedServings) : undefined;

    await api.post('/api/auth/migrate', {
      meals,
      plan: plan ? { startDate: plan.startDate, endDate: plan.endDate, entries: plan.entries } : undefined,
      defaultServings,
    });

    // Clear localStorage
    LOCAL_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    setHasPendingMigration(false);
  };

  const skipMigration = () => {
    LOCAL_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    setHasPendingMigration(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      hasPendingMigration,
      runMigration,
      skipMigration,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
