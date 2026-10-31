import type { MapDefinition, SceneId } from '../../contracts';
import { takanawa } from './takanawa';
import { home2f } from './home-2f';
import { homeInterior } from './home-interior';
import { shopInterior } from './shop-interior';

export const maps: Record<SceneId, MapDefinition> = {
  takanawa,
  'home-interior': homeInterior,
  'home-2f': home2f,
  'shop-interior': shopInterior,
};
