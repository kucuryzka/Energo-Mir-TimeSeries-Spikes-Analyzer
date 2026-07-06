import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ShellRailActions {
  onOpenHistory?: () => void;
}

interface ShellRailContextValue {
  actions: ShellRailActions;
  registerActions: (actions: ShellRailActions) => void;
}

const ShellRailContext = createContext<ShellRailContextValue | null>(null);

export const ShellRailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [actions, setActions] = useState<ShellRailActions>({});

  const registerActions = useCallback((next: ShellRailActions) => {
    setActions(next);
  }, []);

  const value = useMemo(() => ({ actions, registerActions }), [actions, registerActions]);

  return <ShellRailContext.Provider value={value}>{children}</ShellRailContext.Provider>;
};

export const useShellRail = () => {
  const ctx = useContext(ShellRailContext);
  if (!ctx) {
    throw new Error('useShellRail must be used within ShellRailProvider');
  }
  return ctx;
};

export const useRegisterShellRailActions = (actions: ShellRailActions) => {
  const { registerActions } = useShellRail();

  React.useEffect(() => {
    registerActions(actions);
    return () => registerActions({});
  }, [registerActions, actions.onOpenHistory]);
};
