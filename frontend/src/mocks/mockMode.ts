const MOCK_MODE_KEY = 'mockMode';

export const isMockMode = (): boolean => localStorage.getItem(MOCK_MODE_KEY) === 'true';

export const enableMockMode = (): void => {
  localStorage.setItem(MOCK_MODE_KEY, 'true');
  localStorage.setItem('dbToken', 'mock-token');
};

export const disableMockMode = (): void => {
  localStorage.removeItem(MOCK_MODE_KEY);
};
