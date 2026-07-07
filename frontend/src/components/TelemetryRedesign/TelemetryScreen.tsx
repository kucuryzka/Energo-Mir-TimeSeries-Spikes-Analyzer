import React, { useEffect, useState } from 'react';
import { Drawer, Badge } from 'antd';
import { HistoryOutlined, DashboardOutlined, ApiOutlined } from '@ant-design/icons';
import { DatabaseTreeSidebar } from '../Explorer/DatabaseTreeSidebar';
import { GenericAnalyzer } from '../GenericAnalyzer/GenericAnalyzer';
import { TelemetryContent, type TabKey } from './TelemetryContent';
import { useShellRail } from '../../context/ShellRailContext';
import { useQueryTracker } from '../QueryTracker/QueryTracker';
import { HANGFIRE_PATH } from '../../api/index';
import './TelemetryScreen.css';

interface TelemetryScreenProps {
  onLogout: () => void;
  uiTheme: 'light' | 'dark';
  onToggleTheme: () => void;
}

interface GenericConfig {
  db: string;
  schema: string;
  table: string;
  timeColumn: string;
}

export const TelemetryScreen: React.FC<TelemetryScreenProps> = ({ onLogout, uiTheme, onToggleTheme }) => {
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('dbo');
  const [dbDrawerOpen, setDbDrawerOpen] = useState(false);
  const [genericConfig, setGenericConfig] = useState<GenericConfig | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
  }, [uiTheme]);

  const { actions } = useShellRail();
  const { open: openQueryTracker, activeCount } = useQueryTracker();

  const handleSelectStandardSchema = (db: string, schema: string) => {
    setGenericConfig(null);
    setSelectedDb(db);
    setActiveTab(schema === 'em_protocol' ? 'em' : 'dbo');
    setDbDrawerOpen(false);
  };

  const handleSelectGenericTable = (db: string, schema: string, table: string, col: string) => {
    setGenericConfig({ db, schema, table, timeColumn: col });
    setDbDrawerOpen(false);
  };

  const faviconUrl = `${import.meta.env.BASE_URL}favicon.png`;

  return (
    <div className="page" data-theme={uiTheme}>
      <div className="app-bg">
        <div className="blob1" />
        <div className="blob2" />
        <div className="shell">
          <div className="sidebar">
            <div className="logo" title="Дашборд" onClick={() => setGenericConfig(null)} style={{ cursor: 'pointer' }}>
              <span
                role="img"
                aria-label="Logo"
                style={{
                  display: 'block',
                  width: '70%',
                  height: '70%',
                  backgroundColor: '#fff',
                  WebkitMaskImage: `url(${faviconUrl})`,
                  maskImage: `url(${faviconUrl})`,
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
            </div>

            <div className="nav-item" title="Источники данных" onClick={() => setDbDrawerOpen(true)} style={{ cursor: 'pointer' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <ellipse cx="12" cy="6" rx="8" ry="3" />
                <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
                <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
              </svg>
            </div>

            <div style={{ flex: 1 }} />

            <div
              className={`nav-item ${actions.onOpenHistory ? '' : 'disabled'}`}
              title="История анализов"
              onClick={() => actions.onOpenHistory?.()}
              style={{ cursor: actions.onOpenHistory ? 'pointer' : 'default', opacity: actions.onOpenHistory ? 1 : 0.4 }}
            >
              <HistoryOutlined style={{ fontSize: 19 }} />
            </div>
            <div
              className="nav-item"
              title="Панель Hangfire"
              onClick={() => window.open(HANGFIRE_PATH, '_blank')}
              style={{ cursor: 'pointer' }}
            >
              <DashboardOutlined style={{ fontSize: 19 }} />
            </div>
            <div className="nav-item" title="Сетевые запросы" onClick={openQueryTracker} style={{ cursor: 'pointer' }}>
              <Badge count={activeCount} size="small" offset={[2, -2]}>
                <ApiOutlined style={{ fontSize: 19, color: activeCount > 0 ? '#3D63DD' : 'inherit' }} />
              </Badge>
            </div>

            <div
              className="nav-item"
              title={uiTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              onClick={onToggleTheme}
              style={{ cursor: 'pointer' }}
            >
              {uiTheme === 'dark' ? (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M20.7 14.6a8.6 8.6 0 0 1-10.3-10.3.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.4 15.4a.6.6 0 0 0-.7-.8Z" />
                </svg>
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
                </svg>
              )}
            </div>
          </div>

          <div className="content">
            {genericConfig ? (
              <GenericAnalyzer
                db={genericConfig.db}
                schema={genericConfig.schema}
                table={genericConfig.table}
                timeColumn={genericConfig.timeColumn}
                onBack={() => setGenericConfig(null)}
              />
            ) : selectedDb ? (
              <TelemetryContent database={selectedDb} activeTab={activeTab} />
            ) : (
              <div className="telemetry-empty" style={{ margin: 'auto' }}>
                Откройте панель источников данных слева и выберите базу/схему для анализа.
              </div>
            )}
          </div>
        </div>
      </div>

      <Drawer
        title={null}
        placement="left"
        width={320}
        onClose={() => setDbDrawerOpen(false)}
        open={dbDrawerOpen}
        className="db-tree-drawer"
        styles={{ body: { padding: 0, background: 'var(--list-card-bg)' } }}
        closable={false}
      >
        <DatabaseTreeSidebar
          collapsed={false}
          onToggleCollapse={() => setDbDrawerOpen(false)}
          onSelectStandardSchema={handleSelectStandardSchema}
          onSelectGenericTable={handleSelectGenericTable}
          onLogout={onLogout}
        />
      </Drawer>
    </div>
  );
};
