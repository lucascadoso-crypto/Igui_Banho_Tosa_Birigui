
import React, { createContext, useContext, useState } from 'react';
import { NavigationState } from '../types';

interface NavigationContextValue {
  navState: NavigationState;
  setNavState: React.Dispatch<React.SetStateAction<NavigationState>>;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navState, setNavState] = useState<NavigationState>({
    mode: 'global',
    view: 'Painel Geral'
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const value: NavigationContextValue = {
    navState,
    setNavState,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigation = (): NavigationContextValue => {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation deve ser usado dentro de um NavigationProvider');
  return ctx;
};
