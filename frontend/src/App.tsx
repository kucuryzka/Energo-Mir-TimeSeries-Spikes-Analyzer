import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { Dashboard } from './components/Dashboard/Dashboard';
import './App.css';

function App() {
  return (
    <ConfigProvider locale={ruRU}>
      <Dashboard />
    </ConfigProvider>
  );
}

export default App;
