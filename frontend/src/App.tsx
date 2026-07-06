import { useState, useEffect } from 'react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { ConnectionSetup } from './components/ConnectionSetup/ConnectionSetup';
import { TelemetryScreen } from './components/TelemetryRedesign/TelemetryScreen';
import { ShellRailProvider } from './context/ShellRailContext';
import { QueryTrackerProvider } from './components/QueryTracker/QueryTracker';
import { disableMockMode } from './mocks/mockMode';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('dbToken'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('dbToken', token);
    } else {
      localStorage.removeItem('dbToken');
    }
  }, [token]);

  const handleLogout = () => {
    disableMockMode();
    setToken(null);
  };

  if (!token) {
    return (
      <ConfigProvider locale={ruRU} theme={themeConfig}>
        <ConnectionSetup onConnected={() => setToken(localStorage.getItem('dbToken'))} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={ruRU} theme={themeConfig}>
      <ShellRailProvider>
        <QueryTrackerProvider>
          <TelemetryScreen onLogout={handleLogout} />
        </QueryTrackerProvider>
      </ShellRailProvider>
    </ConfigProvider>
  );
}

const themeConfig = {
  token: {
    colorPrimary: '#3B65D9',
    colorBgBase: '#ffffff',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    borderRadius: 14,
    fontFamily: "'Inter', 'Roboto', sans-serif",
    colorTextBase: '#1A2332',
  },
  components: {
    Card: {
      colorBgContainer: '#ffffff',
      boxShadowTertiary: '0 4px 20px rgba(0, 0, 0, 0.05)',
    },
    Drawer: {
      borderRadiusLG: 20,
    },
  },
};

export default App;
