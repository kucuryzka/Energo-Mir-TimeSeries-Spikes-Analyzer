import React, { useState } from 'react';
import { Form, Input, InputNumber, Button, Select, Card, Typography, message, Divider } from 'antd';
import { authApi } from '../../api/explorerApi';
import { enableMockMode } from '../../mocks/mockMode';

const { Title, Text } = Typography;

interface ConnectionSetupProps {
  onConnected: () => void;
}

export const ConnectionSetup: React.FC<ConnectionSetupProps> = ({ onConnected }) => {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await authApi.connect(values);
      localStorage.setItem('dbToken', res.token);
      message.success('Успешное подключение к базе данных');
      onConnected();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Ошибка подключения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-body)' }}>
      <Card style={{ width: 400, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>Подключение к БД</Title>
        <Form layout="vertical" onFinish={onFinish} initialValues={{ provider: 'mssql', port: 1433 }}>
          <Form.Item name="provider" label="Тип СУБД">
            <Select>
              <Select.Option value="mssql">Microsoft SQL Server</Select.Option>
              <Select.Option value="pgsql">PostgreSQL</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item name="host" label="Хост" rules={[{ required: true, message: 'Введите хост' }]}>
            <Input placeholder="localhost или IP" />
          </Form.Item>

          <Form.Item name="port" label="Порт" rules={[{ required: true, message: 'Введите порт' }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="database" label="База данных (опционально)">
            <Input placeholder="master / postgres" />
          </Form.Item>

          <Form.Item name="username" label="Пользователь" rules={[{ required: true, message: 'Введите пользователя' }]}>
            <Input placeholder="sa / postgres" />
          </Form.Item>

          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password placeholder="Пароль" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Подключиться
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '4px 0 16px' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>или</Text>
        </Divider>

        <Button
          block
          size="large"
          onClick={() => {
            enableMockMode();
            message.success('Включён режим демо-данных (без подключения к БД)');
            onConnected();
          }}
        >
          Пропустить БД (демо-данные)
        </Button>
      </Card>
    </div>
  );
};
