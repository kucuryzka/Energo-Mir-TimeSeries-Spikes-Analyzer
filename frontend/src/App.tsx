import { useState, useEffect } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { ConnectionSetup } from './features/connection/ConnectionSetup';
import { AppShell } from './layout/AppShell';
import { ShellRailProvider } from './context/ShellRailContext';
import { QueryTrackerProvider } from './features/query-tracker/QueryTracker';
import { clearAllAnalysisSessions } from './store/analysisSessionStore';
import { requestTracker } from './store/requestTracker';

type AppTheme = 'light' | 'dark';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('dbToken'));
  const [uiTheme, setUiTheme] = useState<AppTheme>(() => (localStorage.getItem('uiTheme') as AppTheme) || 'light');

  useEffect(() => {
    if (token) {
      localStorage.setItem('dbToken', token);
    } else {
      localStorage.removeItem('dbToken');
    }
  }, [token]);

  useEffect(() => {
    localStorage.setItem('uiTheme', uiTheme);
  }, [uiTheme]);

  const handleLogout = () => {
    clearAllAnalysisSessions();
    requestTracker.clear();
    setToken(null);
  };

  const toggleTheme = () => setUiTheme(t => (t === 'dark' ? 'light' : 'dark'));

  if (!token) {
    return (
      <ConfigProvider locale={ruRU} theme={getThemeConfig('light')}>
        <ConnectionSetup onConnected={() => setToken(localStorage.getItem('dbToken'))} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={ruRU} theme={getThemeConfig(uiTheme)}>
      <ShellRailProvider>
        <QueryTrackerProvider>
          <AppShell onLogout={handleLogout} uiTheme={uiTheme} onToggleTheme={toggleTheme} />
        </QueryTrackerProvider>
      </ShellRailProvider>
    </ConfigProvider>
  );
}

function getThemeConfig(mode: AppTheme) {
  const isDark = mode === 'dark';
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#3B65D9',
      borderRadius: 14,
      fontFamily: "'Inter', 'Roboto', sans-serif",
      ...(isDark
        ? {}
        : {
            colorBgBase: '#ffffff',
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorTextBase: '#1A2332',
          }),
    },
    components: {
      Card: {
        colorBgContainer: isDark ? undefined : '#ffffff',
        boxShadowTertiary: '0 4px 20px rgba(0, 0, 0, 0.05)',
      },
      Drawer: {
        borderRadiusLG: 20,
      },
      // antd's dark algorithm defaults Table cells to near-black, which clashes
      // with this app's navy dark palette (--list-card-bg / --tab-pill-bg) — align them.
      Table: isDark
        ? {
            colorBgContainer: '#151d3a',
            headerBg: '#1a2140',
            headerColor: '#edf0fa',
            colorText: '#edf0fa',
            rowHoverBg: 'rgba(61,99,221,0.14)',
            borderColor: 'rgba(255,255,255,.09)',
          }
        : undefined,
    },
  };
}

export default App;
