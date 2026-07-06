import { useState } from 'react';
import { ConfigProvider, Layout, Typography, Button, Badge, Popover, Drawer, Segmented } from 'antd';
import { BarChartOutlined, DatabaseOutlined, UserOutlined, SettingOutlined, FilterOutlined, PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import ruRU from 'antd/locale/ru_RU';

import { LegacyDboDashboard } from './components/Dashboard/LegacyDboDashboard';
import { LegacyEmProtocolDashboard } from './components/Dashboard/LegacyEmProtocolDashboard';
import { DatabaseTreeSidebar } from './components/Explorer/DatabaseTreeSidebar';
import { UnifiedControlsPanel } from './components/Controls/UnifiedControlsPanel';
import type { TimeGranularity } from './types/analytics.types';

const { Content, Sider } = Layout;

export default function App() {
  const [view, setView] = useState<'legacy_dbo' | 'legacy_em'>('legacy_dbo');
  const [dbDrawerOpen, setDbDrawerOpen] = useState(false);
  
  // Параметры фильтров
  const [granularity, setGranularity] = useState<TimeGranularity>('Hour');
  const [confidence, setConfidence] = useState(95);
  const [windowSize, setWindowSize] = useState(30);
  const [dateRange, setDateRange] = useState<[string, string]>(['2026-06-29T00:00:00.000Z', '2026-07-06T23:59:59.000Z']);

  return (
    <ConfigProvider locale={ruRU} theme={{ token: { colorPrimary: '#3B65D9', borderRadius: 14 } }}>
      <Layout style={{ minHeight: '100vh', background: '#E9EEFA', padding: '16px' }}>
        
        {/* Левый скругленный изолированный сайдбар */}
        <Sider width={76} theme="light" style={{
          borderRadius: '24px', background: '#FFF', display: 'flex', flexDirection: 'column',
          height: 'calc(100vh - 32px)', marginRight: '16px', boxShadow: '0px 4px 20px rgba(0,0,0,0.02)'
        }} className="sider-layout-fix">
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', padding: '24px 0', alignItems: 'center' }}>
            
            {/* Верхний блок навигации */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>
              <img src="/favicon.png" alt="logo" style={{ width: 36, height: 36, objectFit: 'contain', marginBottom: 8 }} 
                   onError={(e)=>{ (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/2099/2099192.png" }}/>
              
              <Button type={view === 'legacy_dbo' ? 'primary' : 'text'} icon={<BarChartOutlined style={{ fontSize: 20 }} />} 
                      style={{ width: 48, height: 48, borderRadius: '14px', background: view === 'legacy_dbo' ? '#3B65D9' : undefined }} onClick={() => setView('legacy_dbo')} />
              
              <Button type="text" icon={<DatabaseOutlined style={{ fontSize: 20, color: '#7A8B9E' }} />} 
                      style={{ width: 48, height: 48, borderRadius: '14px' }} onClick={() => setDbDrawerOpen(true)} />
            </div>

            {/* ДВЕ САМЫХ НИЖНИХ ИКОНКИ (Профиль и Настройки темы) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <Button type="text" icon={<UserOutlined style={{ fontSize: 18, color: '#A3AED0' }} />} />
              <Button type="text" icon={<SettingOutlined style={{ fontSize: 18, color: '#A3AED0' }} />} />
            </div>
            
          </div>
        </Sider>

        {/* Главная рабочая белая подложка */}
        <Layout style={{ background: '#FFF', borderRadius: '24px', padding: '32px', height: 'calc(100vh - 32px)', overflowY: 'auto' }}>
          
          {/* Хедер рабочей области */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #E9EEFA' }}>
            <div>
              <Typography.Title level={2} style={{ margin: 0, color: '#1A2332', fontWeight: 700, fontSize: 24 }}>
                {view === 'legacy_dbo' ? 'Телеметрия DBO' : 'Телеметрия EM Protocol'}
              </Typography.Title>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 13, color: '#7A8B9E' }}>
                  29 июн – 6 июл 2026 • Все объекты • Часовая детализация
                </Typography.Text>
                <Badge status="success" text={<span style={{ color: '#22A67E', fontSize: 12, fontWeight: 500 }}>Обновлено только что</span>} />
              </div>
            </div>

            {/* Блок управляющих кнопок одинаковой высоты */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Segmented
                options={[{ label: 'DBO', value: 'legacy_dbo' }, { label: 'EM Protocol', value: 'legacy_em' }]}
                value={view}
                onChange={(val) => setView(val as any)}
                style={{ background: '#F0F4F8', borderRadius: 14, height: 40, padding: 2, display: 'flex', alignItems: 'center' }}
              />
              
              <Popover 
                content={
                  <UnifiedControlsPanel
                    granularity={granularity} onGranularityChange={setGranularity}
                    confidence={confidence} onConfidenceChange={setConfidence}
                    windowSize={windowSize} onWindowSizeChange={setWindowSize}
                    dateRange={dateRange} onDateRangeChange={setDateRange}
                    onAnalyze={() => {}} loading={false}
                  />
                }
                trigger="click"
                placement="bottomRight"
              >
                <Button icon={<FilterOutlined />} className="custom-btn">Фильтры</Button>
              </Popover>

              <Button type="primary" icon={<PlayCircleOutlined />} style={{ borderRadius: 14, height: 40, background: '#1A2332', borderColor: '#1A2332', fontWeight: 600 }}>Запустить анализ</Button>
              <Button icon={<DownloadOutlined />} className="custom-btn">Excel</Button>
            </div>
          </div>

          <Content>
            {view === 'legacy_dbo' ? 
              <LegacyDboDashboard confidence={confidence} windowSize={windowSize} dateRange={dateRange} granularity={granularity} onGranularityChange={setGranularity} /> : 
              <LegacyEmProtocolDashboard confidence={confidence} windowSize={windowSize} dateRange={dateRange} granularity={granularity} onGranularityChange={setGranularity} />
            }
          </Content>
        </Layout>

        {/* Drawer для дерева БД (Вызывается по кнопке с базой данных на сайдбаре) */}
        <Drawer title="Источники данных БД" placement="left" onClose={() => setDbDrawerOpen(false)} open={dbDrawerOpen} width={340} bodyStyle={{ padding: 0 }}>
          <DatabaseTreeSidebar collapsed={false} onToggleCollapse={() => {}} onSelectStandardSchema={() => setDbDrawerOpen(false)} onSelectGenericTable={() => setDbDrawerOpen(false)} onLogout={() => {}} />
        </Drawer>
      </Layout>
    </ConfigProvider>
  );
}