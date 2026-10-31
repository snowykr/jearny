import type { MapDefinition, SceneId } from '../../contracts';
import { takanawa } from './takanawa';
import { homeInterior } from './home-interior';
import { shopInterior } from './shop-interior';

export const maps: Record<SceneId, MapDefinition> = {
  takanawa,
  'home-interior': homeInterior,
  'shop-interior': shopInterior,
};
