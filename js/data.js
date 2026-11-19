// ─────────────────────────────────────────────────────────────
//  PARAMETRA · Catalog data: room types, design styles, defaults
// ─────────────────────────────────────────────────────────────

// area  = base preferred area (m²) before the area-scale factor
// minW / maxW = clear width limits along the band (m)
// flex  = how eagerly the room absorbs spare length (0 = fixed)
// zone  = public | private | service | circ | outdoor
export const ROOM_TYPES = {
  foyer:   { label: 'Entry',          zone: 'circ',    area: 6,   minW: 2.0, maxW: 3.4, flex: 0.3 },
  living:  { label: 'Living',         zone: 'public',  area: 24,  minW: 3.8, maxW: 8.5, flex: 3.0 },
  dining:  { label: 'Dining',         zone: 'public',  area: 13,  minW: 3.0, maxW: 5.4, flex: 1.4 },
  kitchen: { label: 'Kitchen',        zone: 'public',  area: 13,  minW: 2.8, maxW: 5.6, flex: 1.2 },
  family:  { label: 'Family Room',    zone: 'public',  area: 17,  minW: 3.4, maxW: 6.2, flex: 1.5 },
  flex:    { label: 'Flex Space',     zone: 'public',  area: 10,  minW: 2.4, maxW: 6.0, flex: 1.0 },
  master:  { label: 'Master Bedroom', zone: 'private', area: 17,  minW: 3.6, maxW: 5.6, flex: 1.2 },
  ensuite: { label: 'Ensuite',        zone: 'private', area: 6,   minW: 1.9, maxW: 3.0, flex: 0.1 },
  wic:     { label: 'Walk-in Closet', zone: 'private', area: 4.5, minW: 1.6, maxW: 3.0, flex: 0.1 },
  bedroom: { label: 'Bedroom',        zone: 'private', area: 12,  minW: 3.0, maxW: 4.6, flex: 1.0 },
  guest:   { label: 'Guest Room',     zone: 'private', area: 12,  minW: 3.0, maxW: 4.4, flex: 0.8 },
  bath:    { label: 'Bathroom',       zone: 'private', area: 5.5, minW: 2.0, maxW: 2.8, flex: 0.15 },
  powder:  { label: 'Powder Room',    zone: 'service', area: 2.8, minW: 1.4, maxW: 1.9, flex: 0.05 },
  study:   { label: 'Study',          zone: 'private', area: 9,   minW: 2.6, maxW: 4.0, flex: 0.6 },
  laundry: { label: 'Laundry',        zone: 'service', area: 5,   minW: 1.9, maxW: 2.8, flex: 0.15 },
  pantry:  { label: 'Pantry',         zone: 'service', area: 3,   minW: 1.4, maxW: 2.4, flex: 0.05 },
  linen:   { label: 'Linen',          zone: 'service', area: 2,   minW: 1.2, maxW: 2.4, flex: 0.05 },
  storage: { label: 'Storage',        zone: 'service', area: 3,   minW: 1.2, maxW: 3.0, flex: 0.2 },
  gym:     { label: 'Home Gym',       zone: 'private', area: 14,  minW: 3.0, maxW: 5.0, flex: 0.7 },
  media:   { label: 'Media Room',     zone: 'private', area: 16,  minW: 3.4, maxW: 5.4, flex: 0.8 },
  garage:  { label: 'Garage',         zone: 'service', area: 0,   minW: 3.6, maxW: 7.0, flex: 0 },
  stair:   { label: 'Stair',          zone: 'circ',    area: 0,   minW: 2.6, maxW: 2.6, flex: 0 },
  hall:    { label: 'Hall',           zone: 'circ',    area: 0,   minW: 1.2, maxW: 99,  flex: 0 },
  terrace: { label: 'Terrace',        zone: 'outdoor', area: 0,   minW: 1.0, maxW: 99,  flex: 0 },
};

export const HABITABLE = new Set(['living', 'dining', 'kitchen', 'family', 'flex', 'master', 'bedroom', 'guest', 'study', 'gym', 'media']);
export const WET = new Set(['bath', 'ensuite', 'powder', 'laundry']);
export const BEDROOMS = new Set(['master', 'bedroom', 'guest']);

// Plan colours by zone (light theme; plan renderer swaps for dark)
export const ZONE_COLORS = {
  public:  '#F1DFC4',
  private: '#DCE4DA',
  service: '#E3DFD6',
  circ:    '#EEEAE1',
  outdoor: '#E6DCCB',
};

// ─────────────────────────────────────────────────────────────
//  Design styles — each drives roof form, glazing, palette, materials
// ─────────────────────────────────────────────────────────────
export const STYLES = {
  modern: {
    name: 'Modern Minimal', tagline: 'White volumes, flat roofs, big glass',
    roof: 'flat', pitch: 0, overhang: 0.1, glazing: 0.64, fullHeight: true, mullions: 'none',
    ext: { tex: 'render', color: '#F1EFEA' }, accent: { tex: 'boards', color: '#7A5638' },
    roofMat: { tex: 'membrane', color: '#5C5F62' }, frame: '#24262A', door: '#2B2B2B',
    wallInt: '#F6F4F0', floor: { tex: 'oak', color: '#C8A57A' }, wetFloor: { tex: 'tile', color: '#D9D6D0' },
    fabric: '#CFC9BF', fabric2: '#3E4247', wood: '#A9825A', metal: '#2B2B2B', rug: '#B9B2A6',
    swatch: ['#F1EFEA', '#24262A', '#C8A57A', '#7A5638'], rate: 2150, garden: 'minimal',
  },
  scandi: {
    name: 'Scandinavian', tagline: 'Dark timber, steep gables, pale interiors',
    roof: 'gable', pitch: 38, overhang: 0.25, glazing: 0.5, fullHeight: false, mullions: 'none',
    ext: { tex: 'boards', color: '#2F3132' }, accent: { tex: 'boards', color: '#B88A5E' },
    roofMat: { tex: 'seam', color: '#2A2C2E' }, frame: '#EDEBE6', door: '#B88A5E',
    wallInt: '#F7F6F2', floor: { tex: 'oak', color: '#DCC7A6' }, wetFloor: { tex: 'tile', color: '#E8E6E1' },
    fabric: '#E4E0D8', fabric2: '#8D9A8E', wood: '#D7BE98', metal: '#3A3A3A', rug: '#D9D3C7',
    swatch: ['#2F3132', '#EDEBE6', '#DCC7A6', '#8D9A8E'], rate: 1950, garden: 'meadow',
  },
  japandi: {
    name: 'Japandi', tagline: 'Cedar & charcoal, low mono-pitch, calm',
    roof: 'shed', pitch: 11, overhang: 0.6, glazing: 0.54, fullHeight: true, mullions: 'grid-v',
    ext: { tex: 'boards', color: '#8E6A48' }, accent: { tex: 'render', color: '#3B3A38' },
    roofMat: { tex: 'seam', color: '#3A3936' }, frame: '#2D2B28', door: '#6B4E35',
    wallInt: '#EFEAE2', floor: { tex: 'oak', color: '#CDB28A' }, wetFloor: { tex: 'tile', color: '#BDB6AA' },
    fabric: '#D8CFC0', fabric2: '#6F6A5F', wood: '#B89772', metal: '#2D2B28', rug: '#CFC4B2',
    swatch: ['#8E6A48', '#3B3A38', '#EFEAE2', '#6F6A5F'], rate: 2250, garden: 'zen',
  },
  mediterranean: {
    name: 'Mediterranean', tagline: 'Lime stucco, terracotta hips, shutters',
    roof: 'hip', pitch: 22, overhang: 0.45, glazing: 0.38, fullHeight: false, mullions: 'cross', shutters: true,
    ext: { tex: 'stucco', color: '#EFE3CC' }, accent: { tex: 'stone', color: '#CDBB9C' },
    roofMat: { tex: 'clay', color: '#B65A37' }, frame: '#3F5E52', door: '#5A3A24',
    wallInt: '#F4EDE0', floor: { tex: 'terracotta', color: '#C57A52' }, wetFloor: { tex: 'tile', color: '#E3D9C6' },
    fabric: '#EADFCB', fabric2: '#4F6F8F', wood: '#7D5434', metal: '#2E2A26', rug: '#C9A985',
    swatch: ['#EFE3CC', '#B65A37', '#3F5E52', '#4F6F8F'], rate: 1850, garden: 'olive',
  },
  industrial: {
    name: 'Industrial Loft', tagline: 'Brick, steel grids, raw concrete',
    roof: 'flat', pitch: 0, overhang: 0.05, glazing: 0.56, fullHeight: false, mullions: 'grid',
    ext: { tex: 'brick', color: '#8A4B35' }, accent: { tex: 'render', color: '#3A3C3E' },
    roofMat: { tex: 'membrane', color: '#4A4C4F' }, frame: '#1B1C1D', door: '#1B1C1D',
    wallInt: '#E9E7E3', floor: { tex: 'concrete', color: '#A9A7A2' }, wetFloor: { tex: 'tile', color: '#5A5C5E' },
    fabric: '#6A5546', fabric2: '#2F3335', wood: '#6E4E36', metal: '#1B1C1D', rug: '#8E7F70',
    swatch: ['#8A4B35', '#1B1C1D', '#A9A7A2', '#6A5546'], rate: 2050, garden: 'minimal',
  },
  farmhouse: {
    name: 'Modern Farmhouse', tagline: 'Lap siding, metal gables, black frames',
    roof: 'gable', pitch: 42, overhang: 0.35, glazing: 0.42, fullHeight: false, mullions: 'grid', chimney: true,
    ext: { tex: 'siding', color: '#F3F0E9' }, accent: { tex: 'stone', color: '#9C958A' },
    roofMat: { tex: 'seam', color: '#33373B' }, frame: '#1E1F21', door: '#1E1F21',
    wallInt: '#F7F4EE', floor: { tex: 'oak', color: '#B48B5E' }, wetFloor: { tex: 'tile', color: '#ECEAE5' },
    fabric: '#E9E3D8', fabric2: '#5B6B55', wood: '#8C6640', metal: '#1E1F21', rug: '#C8BBA6',
    swatch: ['#F3F0E9', '#1E1F21', '#B48B5E', '#5B6B55'], rate: 1800, garden: 'meadow',
  },
  tropical: {
    name: 'Tropical Modern', tagline: 'Deep eaves, timber louvres, indoor-outdoor',
    roof: 'hip', pitch: 16, overhang: 1.25, glazing: 0.66, fullHeight: true, mullions: 'none', louvres: true,
    ext: { tex: 'render', color: '#ECE8DF' }, accent: { tex: 'boards', color: '#7B5536' },
    roofMat: { tex: 'shingle', color: '#4C433B' }, frame: '#3A2F25', door: '#7B5536',
    wallInt: '#F3EFE7', floor: { tex: 'teak', color: '#A0714A' }, wetFloor: { tex: 'stone', color: '#CFC8BC' },
    fabric: '#EEE7DA', fabric2: '#3F6B5A', wood: '#8A5E3A', metal: '#3A2F25', rug: '#D2C3A8',
    swatch: ['#ECE8DF', '#7B5536', '#3F6B5A', '#A0714A'], rate: 2000, garden: 'tropical',
  },
};

export const DEFAULT_BRIEF = {
  plotW: 24, plotD: 34, setFront: 5, setSide: 1.5, setRear: 6,
  street: 'S',              // compass direction the street (front) faces
  area: 230, floors: 2, ceiling: 2.8,
  bedrooms: 4, bathrooms: 3,
  masterSuite: true, walkIn: true,
  guest: false, study: true, powder: true, laundry: true,
  family: false, media: false, gym: false, storage: true,
  kitchen: 'island', pantry: true, dining: 'open',
  garage: 2, balcony: true, terrace: true, pool: false,
  style: 'modern',
  pri: { light: 70, privacy: 55, open: 75, budget: 45, garden: 50 },
};

export const OPTION_NAMES = ['Meridian', 'Linden', 'Solstice', 'Cascade', 'Harbor', 'Aurora', 'Juniper', 'Kestrel', 'Tamarind', 'Verano', 'Nordlys', 'Ostara'];

export const METRIC_INFO = {
  efficiency: { label: 'Space efficiency', short: 'Efficiency' },
  proportion: { label: 'Room proportions', short: 'Proportion' },
  light:      { label: 'Natural light',    short: 'Daylight' },
  adjacency:  { label: 'Functional flow',  short: 'Flow' },
  privacy:    { label: 'Privacy zoning',   short: 'Privacy' },
  sun:        { label: 'Solar orientation', short: 'Solar' },
  areaFit:    { label: 'Brief area match', short: 'Area fit' },
  site:       { label: 'Site & garden',    short: 'Site' },
  economy:    { label: 'Build economy',    short: 'Economy' },
};
