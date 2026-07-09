import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Drawer, Badge } from 'antd';
import { HistoryOutlined, DashboardOutlined, ApiOutlined, UnorderedListOutlined, LogoutOutlined } from '@ant-design/icons';
import { AnalysisJobQueuePage } from '../features/queue/AnalysisJobQueuePage';
import type { PendingAnalysisJobOpen } from '../utils/analysisJobLoader';
import { DatabaseTreeSidebar } from '../features/explorer/DatabaseTreeSidebar';
import { GenericAnalyzer } from '../features/generic-analyzer/GenericAnalyzer';
import { TelemetryContent, type TabKey } from '../features/telemetry/TelemetryContent';
import { useShellRail } from '../context/ShellRailContext';
import { useQueryTracker } from '../features/query-tracker/QueryTracker';
import { HANGFIRE_PATH } from '../api/index';
import './AppShell.css';

interface AppShellProps {
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

type MainView = 'analysis' | 'queue';

export const AppShell: React.FC<AppShellProps> = ({ onLogout, uiTheme, onToggleTheme }) => {
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('dbo');
  const [mainView, setMainView] = useState<MainView>('analysis');
  const [dbDrawerOpen, setDbDrawerOpen] = useState(false);
  const [genericConfig, setGenericConfig] = useState<GenericConfig | null>(null);
  const [pendingJobOpen, setPendingJobOpen] = useState<PendingAnalysisJobOpen | null>(null);


  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
  }, [uiTheme]);

  const { actions } = useShellRail();
  const { open: openQueryTracker, activeCount } = useQueryTracker();

  const handleSelectStandardSchema = (db: string, schema: string) => {
    setGenericConfig(null);
    setSelectedDb(db);
    setActiveTab(schema === 'em_protocol' ? 'em' : 'dbo');
    setMainView('analysis');
    setDbDrawerOpen(false);
  };

  const handleSelectGenericTable = (db: string, schema: string, table: string, col: string) => {
    setGenericConfig({ db, schema, table, timeColumn: col });
    setMainView('analysis');
    setDbDrawerOpen(false);
  };

  const handleOpenJobFromQueue = (job: PendingAnalysisJobOpen) => {
    if (job.sourceKind === 'generic') {
      if (!job.timeColumn) {
        return;
      }
      setGenericConfig({
        db: job.database,
        schema: job.schema,
        table: job.table,
        timeColumn: job.timeColumn,
      });
      setSelectedDb('');
    } else {
      setGenericConfig(null);
      setSelectedDb(job.database);
      setActiveTab(job.sourceKind === 'em_protocol' ? 'em' : 'dbo');
    }
    setPendingJobOpen(job);
    setMainView('analysis');
  };

  const handlePendingJobConsumed = useCallback(() => {
    setPendingJobOpen(null);
  }, []);

  const faviconUrl = `${import.meta.env.BASE_URL}favicon.png`;

  const getNavItemStyle = (index: number, total: number) => {
    const minOpacity = 0.55; 
    const maxOpacity = 1;
    const opacity = minOpacity + (index / (total - 1)) * (maxOpacity - minOpacity);
    
    const isLogout = index === total - 1;
    const color = isLogout
      ? '#d64933'
      : uiTheme === 'dark'
        ? `rgba(203, 214, 240, ${opacity})`
        : `rgba(26, 35, 50, ${opacity})`;

    return {
      opacity,
      color,
      '--hover-bg': isLogout
        ? 'rgba(214, 73, 51, 0.12)'
        : `rgba(61, 99, 221, ${opacity * 0.15})`,
    } as React.CSSProperties;
  };

  const navButtons = [
    {
      key: 'history',
      title: 'История анализов',
      onClick: () => actions.onOpenHistory?.(),
      disabled: !actions.onOpenHistory,
      icon: <HistoryOutlined style={{ fontSize: 19 }} />,
    },
    {
      key: 'queue',
      title: 'Очередь анализа',
      onClick: () => setMainView(v => (v === 'queue' ? 'analysis' : 'queue')),
      icon: <UnorderedListOutlined style={{ fontSize: 19 }} />,
      active: mainView === 'queue',
    },
    {
      key: 'hangfire',
      title: 'Панель Hangfire',
      onClick: () => window.open(HANGFIRE_PATH, '_blank'),
      icon: <DashboardOutlined style={{ fontSize: 19 }} />,
    },
    {
      key: 'queries',
      title: 'Сетевые запросы',
      onClick: openQueryTracker,
      icon: (
        <Badge count={activeCount} size="small" offset={[2, -2]}>
          <ApiOutlined style={{ fontSize: 19, color: activeCount > 0 ? '#3D63DD' : 'inherit' }} />
        </Badge>
      ),
    },
    {
      key: 'theme',
      title: uiTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема',
      onClick: onToggleTheme,
      icon: uiTheme === 'dark' ? (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M20.7 14.6a8.6 8.6 0 0 1-10.3-10.3.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.4 15.4a.6.6 0 0 0-.7-.8Z" />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </svg>
      ),
    },
    {
      key: 'logout',
      title: 'Выйти из системы',
      onClick: onLogout,
      icon: <LogoutOutlined style={{ fontSize: 19 }} />,
      isLogout: true,
    },
  ];

  return (
    <div className="page" data-theme={uiTheme}>
      <div className="app-bg">
        <div className="blob1" />
        <div className="blob2" />
        <div className="shell">
          <div className="sidebar">
            <div
              className="logo"
              title="Дашборд"
              onClick={() => { setGenericConfig(null); setMainView('analysis'); }}
              style={{ cursor: 'pointer' }}
            >
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

            {navButtons.map((btn, index) => {
              const total = navButtons.length;
              const style = getNavItemStyle(index, total);
              const isLogout = btn.key === 'logout';
              
              return (
                <div
                  key={btn.key}
                  className={`nav-item ${btn.disabled ? 'disabled' : ''}${'active' in btn && btn.active ? ' active' : ''}`}
                  title={btn.title}
                  onClick={btn.disabled ? undefined : btn.onClick}
                  style={{
                    cursor: btn.disabled ? 'default' : 'pointer',
                    opacity: btn.disabled ? 0.4 : style.opacity,
                    color: style.color,
                    transition: 'opacity 0.2s ease, color 0.2s ease, background 0.2s ease',
                    ...(isLogout ? {
                      '--hover-bg': 'rgba(214, 73, 51, 0.12)',
                    } : {}),
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    if (!btn.disabled) {
                      const target = e.currentTarget;
                      const bg = isLogout ? 'rgba(214, 73, 51, 0.12)' : 'rgba(61, 99, 221, 0.08)';
                      target.style.background = bg;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {btn.icon}
                </div>
              );
            })}
          </div>

          <div className="content">
            {(selectedDb || genericConfig) && (
              <div
                className="content-view"
                style={{ display: mainView === 'queue' ? 'none' : 'contents' }}
                aria-hidden={mainView === 'queue'}
              >
                {selectedDb && !genericConfig && activeTab === 'dbo' && (
                  <TelemetryContent
                    database={selectedDb}
                    activeTab="dbo"
                    visible={mainView !== 'queue'}
                    pendingJobOpen={pendingJobOpen}
                    onPendingJobConsumed={handlePendingJobConsumed}
                  />
                )}
                {selectedDb && !genericConfig && activeTab === 'em' && (
                  <TelemetryContent
                    database={selectedDb}
                    activeTab="em"
                    visible={mainView !== 'queue'}
                    pendingJobOpen={pendingJobOpen}
                    onPendingJobConsumed={handlePendingJobConsumed}
                  />
                )}
                {genericConfig && (
                  <GenericAnalyzer
                    db={genericConfig.db}
                    schema={genericConfig.schema}
                    table={genericConfig.table}
                    timeColumn={genericConfig.timeColumn}
                    onBack={() => setGenericConfig(null)}
                    visible={mainView !== 'queue'}
                    pendingJobOpen={pendingJobOpen}
                    onPendingJobConsumed={handlePendingJobConsumed}
                  />
                )}
              </div>
            )}
            {mainView === 'queue' && (
              <AnalysisJobQueuePage active onOpenJob={handleOpenJobFromQueue} />
            )}
            {mainView !== 'queue' && !selectedDb && !genericConfig && (
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
