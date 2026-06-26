import type { SpikeResponse } from '../types/analytics.types';

export const mockData: SpikeResponse = {
  series: [
    // Генерируем данные для 7 дней с почасовым шагом
    ...Array.from({ length: 24 * 7 }, (_, i) => {
      const hour = i % 24;
      const day = Math.floor(i / 24);
      
      // Базовое значение (дневная динамика)
      let baseValue = 20 + Math.sin(hour / 24 * 2 * Math.PI) * 15;
      
      // Пик в 9 утра
      if (hour === 9) baseValue = 120;
      if (hour === 10) baseValue = 95;
      
      // Пик в 18 вечера
      if (hour === 18) baseValue = 80;
      
      // Добавляем случайный шум
      const noise = Math.random() * 20 - 10;
      
      // Несколько искусственных всплесков
      let isSpike = false;
      let pValue = 0.5;
      
      // Всплеск в день 2 в 14:00
      if (day === 2 && hour === 14) {
        isSpike = true;
        pValue = 0.003;
        baseValue = 150;
      }
      
      // Всплеск в день 5 в 11:00
      if (day === 5 && hour === 11) {
        isSpike = true;
        pValue = 0.012;
        baseValue = 180;
      }
      
      // Всплеск в день 6 в 16:00
      if (day === 6 && hour === 16) {
        isSpike = true;
        pValue = 0.001;
        baseValue = 210;
      }
      
      const date = new Date(2026, 5, 18 + day, hour);
      
      return {
        timestamp: date.toISOString(),
        value: Math.max(0, Math.round(baseValue + noise)),
        isSpike,
        pValue,
      };
    }),
  ],
};
