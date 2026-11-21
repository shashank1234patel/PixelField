import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {
  STRING_TILE_LEGEND,
  generateStructuredPixelVillageMap,
} from './shared/starterMap.ts';

(window as unknown as Record<string, unknown>).PixelVillageMap = {
  generate: generateStructuredPixelVillageMap,
  TILE: STRING_TILE_LEGEND,
};

createRoot(document.getElementById('root')!).render(<App />);
