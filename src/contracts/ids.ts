// Shared ID registry. Track A places these on maps; Track B's domain reacts to them.
// Adding an ID is a tiny PR to main that both tracks rebase onto.

export const ENTITY = {
  guide: 'npc:guide', // home-interior; gives and receives the quest
  stationStaff: 'npc:station_staff', // takanawa, at the station zone
  shopkeeper: 'npc:shopkeeper', // shop-interior
  stationZone: 'zone:station', // stepping in/interacting marks visited(station)
} as const;

export const PORTAL = {
  homeExit: 'portal:home-exit', // home-interior -> takanawa@home-door
  homeDoor: 'portal:home-door', // takanawa -> home-interior@entry
  shopDoor: 'portal:shop-door', // takanawa -> shop-interior@entry
  shopExit: 'portal:shop-exit', // shop-interior -> takanawa@shop-door
  deckUp: 'portal:deck-up', // takanawa plaza -> takanawa@station-deck
  deckDown: 'portal:deck-down', // takanawa station -> takanawa@plaza
} as const;

export const SPAWN = {
  start: 'start', // home-interior, new game
  entry: 'entry', // interiors, after entering a door
  homeDoor: 'home-door',
  shopDoor: 'shop-door',
  stationDeck: 'station-deck',
  plaza: 'plaza',
} as const;

export const BUILDING = {
  station: 'building:station',
  home: 'building:home',
  matsushimaya: 'building:matsushimaya',
} as const;

export const SHOP = { matsushimaya: 'shop:matsushimaya' } as const;
export const ITEM = { mochi: 'mochi' } as const;
export const QUEST = { firstTrip: 'first-neighborhood-trip' } as const;
export const CONVERSATION = {
  guideIntro: 'guide_intro',
  shopOrder: 'shop_order',
} as const;
