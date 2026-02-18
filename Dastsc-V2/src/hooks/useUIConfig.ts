import { useState, useEffect } from 'react';

export interface ComponentConfig {
  id: string;
  label?: string;
  color?: string;
  isVisible: boolean;
  scale?: number;
  rotation?: number;
}

export const useUIConfig = () => {
  const [configs, setConfigs] = useState<Record<string, ComponentConfig>>(() => {
    const saved = localStorage.getItem('dastsc_ui_config');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('dastsc_ui_config', JSON.stringify(configs));
  }, [configs]);

  const updateConfig = (id: string, updates: Partial<ComponentConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || { id, isVisible: true }),
        ...updates
      }
    }));
  };

  const getConfig = (id: string): ComponentConfig => {
    return configs[id] || { id, isVisible: true };
  };

  return { configs, updateConfig, getConfig };
};
