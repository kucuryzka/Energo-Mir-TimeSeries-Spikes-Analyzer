import { useState, useEffect } from 'react';
import { ConfigProvider, Layout, Typography, Drawer, Badge } from 'antd';
import { ApiOutlined, DashboardOutlined, HistoryOutlined } from '@ant-design/icons';
import ruRU from 'antd/locale/ru_RU';
import { LegacyDboDashboard } from './components/Dashboard/LegacyDboDashboard';
import { LegacyEmProtocolDashboard } from './components/Dashboard/LegacyEmProtocolDashboard';
import { ConnectionSetup } from './components/ConnectionSetup/ConnectionSetup';
import { DatabaseTreeSidebar } from './components/Explorer/DatabaseTreeSidebar';
import { GenericAnalyzer } from './components/GenericAnalyzer/GenericAnalyzer';
import { QueryTrackerProvider, useQueryTracker } from './components/QueryTracker/QueryTracker';
import { ShellRailProvider, useShellRail } from './context/ShellRailContext';
import { API_BASE_URL } from './api/index';
import logoImg from './assets/logo.png';
import databaseIcon from './assets/database_svg.svg';
import './App.css';

const { Content } = Layout;

function AppShell({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<'empty' | 'legacy_dbo' | 'legacy_em' | 'generic'>('empty');
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [genericConfig, setGenericConfig] = useState<{
    db: string;
    schema: string;
    table: string;
    timeColumn: string;
  } | null>(null);
  const [dbDrawerOpen, setDbDrawerOpen] = useState(false);
  const { actions } = useShellRail();
  const { open: openQueryTracker, activeCount } = useQueryTracker();

  const handleLogout = () => {
    onLogout();
    setDbDrawerOpen(false);
  };

  const handleSelectStandardSchema = (db: string, schema: string) => {
    setSelectedDb(db);
    if (schema === 'dbo') setView('legacy_dbo');
    else if (schema === 'em_protocol') setView('legacy_em');
    setDbDrawerOpen(false);
  };

  const handleSelectGenericTable = (db: string, schema: string, table: string, col: string) => {
    setGenericConfig({ db, schema, table, timeColumn: col });
    setView('generic');
    setDbDrawerOpen(false);
  };

  return (
    <Layout style={{ height: '100vh', background: '#E9EEFA', padding: 16 }} className="app-shell">
      <div className="app-shell-rail">
        <div className="app-shell-rail-top">
          <img src={logoImg} alt="Logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <button
            type="button"
            className={`app-shell-rail-btn ${dbDrawerOpen ? 'active' : ''}`}
            onClick={() => setDbDrawerOpen(true)}
            title="Источники данных"
          >
            <img src={databaseIcon} alt="" style={{ width: 22, height: 22 }} />
          </button>
        </div>

        <div className="app-shell-rail-bottom">
          <button
            type="button"
            className={`app-shell-rail-btn app-shell-rail-btn--history ${actions.onOpenHistory ? '' : 'disabled'}`}
            onClick={() => actions.onOpenHistory?.()}
            disabled={!actions.onOpenHistory}
            title="История запросов"
          >
            <HistoryOutlined style={{ fontSize: 20, color: actions.onOpenHistory ? '#3B65D9' : '#C5CEE0' }} />
          </button>
          <button
            type="button"
            className="app-shell-rail-btn app-shell-rail-btn--hangfire"
            onClick={() => window.open(`${API_BASE_URL}/hangfire`, '_blank')}
            title="Панель Hangfire"
          >
            <DashboardOutlined style={{ fontSize: 20, color: '#52c41a' }} />
          </button>
          <button
            type="button"
            className="app-shell-rail-btn app-shell-rail-btn--queries"
            onClick={openQueryTracker}
            title="Сетевые запросы"
          >
            <Badge count={activeCount} size="small" offset={[4, -4]}>
              <ApiOutlined style={{ fontSize: 20, color: activeCount > 0 ? '#3B65D9' : '#7A8B9E' }} />
            </Badge>
          </button>
        </div>
      </div>

      <Layout className="app-shell-main" style={{ background: '#FFF' }}>
        <Content className="app-shell-content" style={{ position: 'relative', padding: '24px 32px 32px' }}>
          {view === 'empty' && (
            <div style={{ display: 'flex', height: '100%', minHeight: 400, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <img src={databaseIcon} alt="" style={{ width: 48, height: 48, opacity: 0.4 }} />
              <Typography.Title level={3} style={{ color: '#7A8B9E', fontWeight: 600, margin: 0 }}>
                Выберите таблицу или схему для анализа
              </Typography.Title>
              <Typography.Text type="secondary">
                Откройте панель источников данных слева
              </Typography.Text>
            </div>
          )}
          {view === 'legacy_dbo' && <LegacyDboDashboard database={selectedDb} />}
          {view === 'legacy_em' && <LegacyEmProtocolDashboard database={selectedDb} />}
          {view === 'generic' && genericConfig && (
            <GenericAnalyzer
              db={genericConfig.db}
              schema={genericConfig.schema}
              table={genericConfig.table}
              timeColumn={genericConfig.timeColumn}
              onBack={() => setView('empty')}
            />
          )}
        </Content>
      </Layout>

      <Drawer
        title={null}
        placement="left"
        width={320}
        onClose={() => setDbDrawerOpen(false)}
        open={dbDrawerOpen}
        styles={{ body: { padding: 0 } }}
        closable={false}
      >
        <DatabaseTreeSidebar
          collapsed={false}
          onToggleCollapse={() => setDbDrawerOpen(false)}
          onSelectStandardSchema={handleSelectStandardSchema}
          onSelectGenericTable={handleSelectGenericTable}
          onLogout={handleLogout}
        />
      </Drawer>
    </Layout>
  );
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('dbToken'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('dbToken', token);
    } else {
      localStorage.removeItem('dbToken');
    }
  }, [token]);

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
          <AppShell onLogout={() => setToken(null)} />
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
