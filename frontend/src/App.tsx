import { useState, useEffect } from 'react';
import { ConfigProvider, Layout, Typography } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { LegacyDboDashboard } from './components/Dashboard/LegacyDboDashboard';
import { LegacyEmProtocolDashboard } from './components/Dashboard/LegacyEmProtocolDashboard';
import { ConnectionSetup } from './components/ConnectionSetup/ConnectionSetup';
import { DatabaseTreeSidebar } from './components/Explorer/DatabaseTreeSidebar';
import { GenericAnalyzer } from './components/GenericAnalyzer/GenericAnalyzer';
import { MenuUnfoldOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import './App.css';

const { Sider, Content } = Layout;

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('dbToken'));
  
  // State for navigation
  // 'empty', 'legacy_dbo', 'legacy_em', 'generic'
  const [view, setView] = useState<'empty' | 'legacy_dbo' | 'legacy_em' | 'generic'>('empty');
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [genericConfig, setGenericConfig] = useState<{db: string, schema: string, table: string, timeColumn: string} | null>(null);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('dbToken', token);
    } else {
      localStorage.removeItem('dbToken');
      setView('empty');
    }
  }, [token]);

  const handleLogout = () => {
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
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Sider width={300} theme="light" collapsed={collapsed} collapsedWidth={0} trigger={null}>
          <DatabaseTreeSidebar 
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            onSelectStandardSchema={(db, schema) => {
              setSelectedDb(db);
              if (schema === 'dbo') setView('legacy_dbo');
              else if (schema === 'em_protocol') setView('legacy_em');
            }}
            onSelectGenericTable={(db, schema, table, col) => {
              setGenericConfig({ db, schema, table, timeColumn: col });
              setView('generic');
            }}
            onLogout={handleLogout}
          />
        </Sider>
        <Layout>
          <Content style={{ position: 'relative', overflow: 'auto' }}>
            {collapsed && (
              <Button 
                type="primary" 
                icon={<MenuUnfoldOutlined />} 
                onClick={() => setCollapsed(false)} 
                style={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }} 
                title="Развернуть"
              />
            )}
            {view === 'empty' && (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Typography.Title level={3} type="secondary">Выберите таблицу или схему для анализа</Typography.Title>
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
      </Layout>
    </ConfigProvider>
  );
}

const themeConfig = {
  token: {
    colorPrimary: '#1890ff',
    colorBgBase: '#ffffff',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    borderRadius: 8,
    fontFamily: "'Inter', 'Roboto', sans-serif",
    colorTextBase: '#1f2937',
  },
  components: {
    Card: {
      colorBgContainer: '#ffffff',
      boxShadowTertiary: '0 4px 20px rgba(0, 0, 0, 0.05)',
    }
  }
};

export default App;
