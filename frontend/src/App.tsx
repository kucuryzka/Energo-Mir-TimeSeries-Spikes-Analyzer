import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { Dashboard } from './components/Dashboard/Dashboard';
import './App.css';

function App() {
  return (
    <ConfigProvider 
      locale={ruRU}
      theme={{
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
      }}
    >
      <Dashboard />
    </ConfigProvider>
  );
}

export default App;
