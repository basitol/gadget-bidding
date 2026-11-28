/**
 * "List a gadget": what we ask about each kind of device.
 *
 * A profile decides the specs step (and which specs a serial lookup can fill), the lock
 * statements a seller must confirm, the repairable parts, the faults and box contents on the
 * condition step, and the photo slots. The app renders from it; the server validates with it.
 * Stored on the listing as specifications.profile (+ the answers, see ListingSpecs below).
 */

/* ------------------------------------------------------------------ */
/* Categories (step 1)                                                 */
/* ------------------------------------------------------------------ */

export type ListingCategoryKey =
  | 'phones'
  | 'tablets'
  | 'laptops'
  | 'desktops'
  | 'audio'
  | 'gaming'
  | 'wearables'
  | 'vr_glasses'
  | 'cameras_drones'
  | 'other';

/** slug = gadget_categories.slug the listing is filed under (what buyers browse). */
export const LISTING_CATEGORIES: { key: ListingCategoryKey; label: string; slug: string }[] = [
  { key: 'phones', label: 'Phones', slug: 'smartphones' },
  { key: 'tablets', label: 'Tablets', slug: 'tablets' },
  { key: 'laptops', label: 'Laptops', slug: 'laptops' },
  { key: 'desktops', label: 'Desktops', slug: 'desktops' },
  { key: 'audio', label: 'Audio', slug: 'headphones' },
  { key: 'gaming', label: 'Gaming', slug: 'gaming' },
  { key: 'wearables', label: 'Wearables', slug: 'smartwatches' },
  { key: 'vr_glasses', label: 'VR & glasses', slug: 'vr-glasses' },
  { key: 'cameras_drones', label: 'Cameras & drones', slug: 'cameras' },
  { key: 'other', label: 'Other', slug: 'other' },
];

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

export type SpecField = {
  key: string;
  label: string;
  /** chips = pick one; multi = pick any; text; number; percent (0–100) */
  type: 'chips' | 'multi' | 'text' | 'number' | 'percent';
  options?: string[];
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** A maker's serial / IMEI lookup can fill this ("From serial"). */
  fromSerial?: boolean;
};

export type PhotoSlot = {
  key: string;
  label: string;
  required?: boolean;
  /** Only asked for when the seller reported damage. */
  ifDamage?: boolean;
};

export type RepairPart = { key: string; label: string };
export type Option = { key: string; label: string };

/** What the identifier is and where to find it (step 2). */
export type IdentifierKind = 'imei' | 'serial' | 'none';

export type DeviceProfile = {
  key: string;
  /** Shown on the "What kind is it?" picker. */
  label: string;
  category: ListingCategoryKey;
  brand?: string;
  identifier: IdentifierKind;
  /** Is the identifier required to list? */
  identifierRequired: boolean;
  identifierHelp: string;
  specs: SpecField[];
  /** Statements the seller must tick. */
  locks: string[];
  parts: RepairPart[];
  /** iPhone's Settings → General → About → "Parts and Service History". */
  partsHistory?: boolean;
  faults: Option[];
  inBox: Option[];
  /** The condition step asks for battery health (%). */
  batteryHealth?: { help: string };
  photos: PhotoSlot[];
};

const BLACKLIST_LOCK = 'Not reported lost or stolen, not blacklisted and not on a payment plan';

const PHONE_PARTS: RepairPart[] = [
  { key: 'screen', label: 'Screen' },
  { key: 'battery', label: 'Battery' },
  { key: 'back_glass', label: 'Back glass' },
  { key: 'rear_camera', label: 'Rear camera' },
  { key: 'front_camera', label: 'Front camera / Face ID' },
  { key: 'charging_port', label: 'Charging port' },
  { key: 'housing', label: 'Housing / frame' },
  { key: 'motherboard', label: 'Motherboard' },
];

const LAPTOP_PARTS: RepairPart[] = [
  { key: 'screen', label: 'Screen' },
  { key: 'battery', label: 'Battery' },
  { key: 'keyboard', label: 'Keyboard' },
  { key: 'trackpad', label: 'Trackpad' },
  { key: 'logic_board', label: 'Logic board / motherboard' },
  { key: 'charging_port', label: 'Charging port' },
  { key: 'housing', label: 'Housing / hinge' },
];

const PHONE_FAULTS: Option[] = [
  { key: 'face_id', label: 'Face ID / fingerprint' },
  { key: 'true_tone', label: 'True Tone' },
  { key: 'cameras', label: 'A camera' },
  { key: 'speakers', label: 'Speaker' },
  { key: 'microphone', label: 'Microphone' },
  { key: 'network', label: 'Network / SIM' },
  { key: 'wifi_bluetooth', label: 'Wi-Fi / Bluetooth' },
  { key: 'buttons', label: 'Buttons' },
  { key: 'charging', label: 'Charging' },
  { key: 'touch', label: 'Touch' },
];

const LAPTOP_FAULTS: Option[] = [
  { key: 'keys', label: 'Some keys' },
  { key: 'trackpad', label: 'Trackpad' },
  { key: 'speakers', label: 'Speakers' },
  { key: 'camera', label: 'Webcam' },
  { key: 'ports', label: 'A port' },
  { key: 'wifi_bluetooth', label: 'Wi-Fi / Bluetooth' },
  { key: 'charging', label: 'Charging' },
  { key: 'display', label: 'Display (spots, lines)' },
];

const PHONE_BOX: Option[] = [
  { key: 'box', label: 'Box' },
  { key: 'cable', label: 'Cable' },
  { key: 'charger', label: 'Charger' },
  { key: 'case', label: 'Case' },
  { key: 'earphones', label: 'Earphones' },
];

const LAPTOP_BOX: Option[] = [
  { key: 'box', label: 'Box' },
  { key: 'charger', label: 'Charger' },
  { key: 'cable', label: 'Cable' },
  { key: 'sleeve', label: 'Sleeve / bag' },
];

const PHONE_PHOTOS = (about: string, extra: PhotoSlot[] = []): PhotoSlot[] => [
  { key: 'front', label: 'Front', required: true },
  { key: 'back', label: 'Back', required: true },
  { key: 'screen_on', label: 'Screen on', required: true },
  { key: 'sides', label: 'Sides & frame' },
  ...extra,
  { key: 'about', label: about, required: true },
  { key: 'damage', label: 'Close-up of damage', ifDamage: true },
  { key: 'box', label: 'Box & extras' },
];

const LAPTOP_PHOTOS = (about: string, battery: string): PhotoSlot[] => [
  { key: 'front', label: 'Open, screen on', required: true },
  { key: 'keyboard', label: 'Keyboard', required: true },
  { key: 'lid', label: 'Lid', required: true },
  { key: 'bottom', label: 'Bottom' },
  { key: 'about', label: about, required: true },
  { key: 'battery', label: battery, required: true },
  { key: 'ports', label: 'Sides & ports' },
  { key: 'damage', label: 'Close-up of damage', ifDamage: true },
  { key: 'box', label: 'Charger & extras' },
];

const BASIC_PHOTOS = (identifierShot?: string): PhotoSlot[] => [
  { key: 'front', label: 'Front', required: true },
  { key: 'back', label: 'Back', required: true },
  { key: 'working', label: 'Switched on', required: true },
  { key: 'sides', label: 'Sides' },
  ...(identifierShot ? [{ key: 'about', label: identifierShot, required: true }] : []),
  { key: 'damage', label: 'Close-up of damage', ifDamage: true },
  { key: 'box', label: 'Box & extras' },
];

const KEYBOARD = { key: 'keyboard_layout', label: 'Keyboard layout', type: 'chips', options: ['US', 'UK', 'Arabic', 'Other'] } as const;

const IPHONE_SPECS = (storage: string[], sim: string[]): SpecField[] => [
  { key: 'storage', label: 'Storage', type: 'chips', options: storage, required: true, fromSerial: true },
  { key: 'colour', label: 'Colour', type: 'text', placeholder: 'e.g. Natural Titanium', required: true, fromSerial: true },
  { key: 'sim', label: 'SIM', type: 'chips', options: sim, required: true },
  { key: 'network', label: 'Network', type: 'chips', options: ['Unlocked', 'Locked to a network'], required: true },
  { key: 'region', label: 'Bought in', type: 'chips', options: ['UK', 'US', 'Nigeria', 'UAE', 'Other'], help: 'Where it was first sold. Used phones from the UK and US are often called "UK used".' },
];

const ANDROID_SPECS: SpecField[] = [
  { key: 'storage', label: 'Storage', type: 'chips', options: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], required: true },
  { key: 'ram', label: 'RAM', type: 'chips', options: ['4 GB', '6 GB', '8 GB', '12 GB', '16 GB'] },
  { key: 'colour', label: 'Colour', type: 'text', placeholder: 'e.g. Titanium Black', required: true },
  { key: 'sim', label: 'SIM', type: 'chips', options: ['Dual SIM', 'Physical SIM + eSIM', 'Single SIM'], required: true },
  { key: 'network', label: 'Network', type: 'chips', options: ['Unlocked', 'Locked to a network'], required: true },
];

const APPLE_PHONE = {
  brand: 'Apple',
  category: 'phones' as const,
  identifier: 'imei' as const,
  identifierRequired: true,
  identifierHelp: 'Settings → General → About, or dial *#06#.',
  locks: ['Find My and iCloud signed out (Activation Lock off)', BLACKLIST_LOCK],
  parts: PHONE_PARTS,
  partsHistory: true,
  faults: PHONE_FAULTS,
  inBox: PHONE_BOX,
  batteryHealth: { help: 'Settings → Battery → Battery Health.' },
  photos: PHONE_PHOTOS('About screen (model & IMEI)', [
    { key: 'battery', label: 'Battery health screen', required: true },
    { key: 'parts_history', label: 'Parts & Service History', required: true },
  ]),
};

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    key: 'iphone_new',
    label: 'iPhone 15 and newer',
    ...APPLE_PHONE,
    specs: IPHONE_SPECS(['128 GB', '256 GB', '512 GB', '1 TB', '2 TB'], ['Physical SIM + eSIM', 'eSIM only', 'Dual physical SIM']),
  },
  {
    key: 'iphone_old',
    label: 'iPhone 14 and older',
    ...APPLE_PHONE,
    specs: IPHONE_SPECS(['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], ['Physical SIM + eSIM', 'eSIM only', 'Dual physical SIM']),
  },
  {
    key: 'samsung',
    label: 'Samsung Galaxy',
    brand: 'Samsung',
    category: 'phones',
    identifier: 'imei',
    identifierRequired: true,
    identifierHelp: 'Settings → About phone, or dial *#06#.',
    specs: ANDROID_SPECS,
    locks: ['Samsung and Google accounts removed (no FRP lock)', BLACKLIST_LOCK],
    parts: PHONE_PARTS,
    faults: PHONE_FAULTS,
    inBox: PHONE_BOX,
    batteryHealth: { help: 'Samsung Members → Diagnostics → Battery status, if you have it.' },
    photos: PHONE_PHOTOS('About phone (model & IMEI)'),
  },
  {
    key: 'android',
    label: 'Other Android phone',
    category: 'phones',
    identifier: 'imei',
    identifierRequired: true,
    identifierHelp: 'Settings → About phone, or dial *#06#.',
    specs: ANDROID_SPECS,
    locks: ['Google and phone-maker accounts removed (no FRP lock)', BLACKLIST_LOCK],
    parts: PHONE_PARTS,
    faults: PHONE_FAULTS,
    inBox: PHONE_BOX,
    photos: PHONE_PHOTOS('About phone (model & IMEI)'),
  },
  {
    key: 'ipad',
    label: 'iPad',
    brand: 'Apple',
    category: 'tablets',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Settings → General → About.',
    specs: [
      { key: 'storage', label: 'Storage', type: 'chips', options: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB', '2 TB'], required: true, fromSerial: true },
      { key: 'connectivity', label: 'Connectivity', type: 'chips', options: ['Wi-Fi', 'Wi-Fi + Cellular'], required: true, fromSerial: true },
      { key: 'colour', label: 'Colour', type: 'text', placeholder: 'e.g. Space Grey', fromSerial: true },
      { key: 'pencil', label: 'Apple Pencil included', type: 'chips', options: ['Yes', 'No'] },
    ],
    locks: ['Find My and iCloud signed out (Activation Lock off)', 'Not company-managed (MDM)', BLACKLIST_LOCK],
    parts: PHONE_PARTS.filter(p => p.key !== 'back_glass'),
    faults: PHONE_FAULTS,
    inBox: PHONE_BOX,
    batteryHealth: { help: 'Newer iPads: Settings → Battery → Battery Health.' },
    photos: BASIC_PHOTOS('About screen (model & serial)'),
  },
  {
    key: 'android_tablet',
    label: 'Android tablet',
    category: 'tablets',
    identifier: 'serial',
    identifierRequired: false,
    identifierHelp: 'Settings → About tablet.',
    specs: [
      { key: 'storage', label: 'Storage', type: 'chips', options: ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB'], required: true },
      { key: 'connectivity', label: 'Connectivity', type: 'chips', options: ['Wi-Fi', 'Wi-Fi + Cellular'], required: true },
      { key: 'colour', label: 'Colour', type: 'text' },
    ],
    locks: ['Google and maker accounts removed (no FRP lock)', BLACKLIST_LOCK],
    parts: PHONE_PARTS.filter(p => p.key !== 'back_glass'),
    faults: PHONE_FAULTS,
    inBox: PHONE_BOX,
    photos: BASIC_PHOTOS('About tablet screen'),
  },
  {
    key: 'macbook_as',
    label: 'MacBook (Apple silicon)',
    brand: 'Apple',
    category: 'laptops',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Mac: Apple menu → About This Mac.',
    specs: [
      {
        key: 'chip',
        label: 'Chip',
        type: 'chips',
        options: ['M1', 'M1 Pro', 'M1 Max', 'M2', 'M2 Pro', 'M2 Max', 'M3', 'M3 Pro', 'M3 Max', 'M4', 'M4 Pro', 'M4 Max'],
        required: true,
        fromSerial: true,
      },
      { key: 'cores', label: 'CPU / GPU cores', type: 'text', help: 'Same chip can have different core counts.', placeholder: 'e.g. 11-core CPU · 14-core GPU', fromSerial: true },
      { key: 'memory', label: 'Unified memory', type: 'chips', options: ['8 GB', '16 GB', '18 GB', '24 GB', '32 GB', '36 GB', '48 GB', '64 GB', '96 GB', '128 GB'], required: true, fromSerial: true },
      { key: 'storage', label: 'Storage', type: 'chips', options: ['256 GB', '512 GB', '1 TB', '2 TB', '4 TB', '8 TB'], required: true, fromSerial: true },
      { key: 'year_size', label: 'Year & size', type: 'text', placeholder: 'e.g. 14-inch, Nov 2023', required: true, fromSerial: true },
      { key: 'cycle_count', label: 'Battery cycle count', type: 'number', help: 'System Information → Power. Apple rates these batteries for 1,000 cycles.', placeholder: 'e.g. 182', required: true },
      { key: 'battery_condition', label: 'Battery condition', type: 'chips', options: ['Normal', 'Service Recommended'], help: 'System Settings → Battery.', required: true },
      { ...KEYBOARD, options: [...KEYBOARD.options] },
    ],
    locks: ['Find My / Activation Lock off, no firmware password, not company-managed (MDM)'],
    parts: LAPTOP_PARTS,
    faults: LAPTOP_FAULTS,
    inBox: LAPTOP_BOX,
    photos: LAPTOP_PHOTOS('About This Mac', 'Battery (System Information → Power)'),
  },
  {
    key: 'macbook_intel',
    label: 'MacBook (Intel)',
    brand: 'Apple',
    category: 'laptops',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Mac: Apple menu → About This Mac.',
    specs: [
      { key: 'processor', label: 'Processor', type: 'chips', options: ['Core i3', 'Core i5', 'Core i7', 'Core i9'], required: true, fromSerial: true },
      { key: 'memory', label: 'Memory', type: 'chips', options: ['8 GB', '16 GB', '32 GB', '64 GB'], required: true, fromSerial: true },
      { key: 'storage', label: 'Storage', type: 'chips', options: ['128 GB', '256 GB', '512 GB', '1 TB', '2 TB'], required: true, fromSerial: true },
      { key: 'year_size', label: 'Year & size', type: 'text', placeholder: 'e.g. 13-inch, 2020', required: true, fromSerial: true },
      { key: 'cycle_count', label: 'Battery cycle count', type: 'number', help: 'System Information → Power.', required: true },
      { key: 'battery_condition', label: 'Battery condition', type: 'chips', options: ['Normal', 'Service Recommended'], help: 'System Settings → Battery.', required: true },
      { ...KEYBOARD, options: [...KEYBOARD.options] },
    ],
    locks: ['Find My / Activation Lock off, no firmware password, not company-managed (MDM)'],
    parts: LAPTOP_PARTS,
    faults: LAPTOP_FAULTS,
    inBox: LAPTOP_BOX,
    photos: LAPTOP_PHOTOS('About This Mac', 'Battery (System Information → Power)'),
  },
  {
    key: 'windows_laptop',
    label: 'Windows laptop',
    category: 'laptops',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Sticker under the laptop, or Settings → System → About.',
    specs: [
      { key: 'processor', label: 'Processor', type: 'text', placeholder: 'e.g. Intel Core i7-1165G7', required: true },
      { key: 'memory', label: 'RAM', type: 'chips', options: ['4 GB', '8 GB', '16 GB', '32 GB', '64 GB'], required: true },
      { key: 'storage', label: 'Storage', type: 'chips', options: ['128 GB', '256 GB', '512 GB', '1 TB', '2 TB'], required: true },
      { key: 'graphics', label: 'Graphics', type: 'text', placeholder: 'e.g. NVIDIA RTX 3060 6 GB' },
      { key: 'screen', label: 'Screen size', type: 'text', placeholder: 'e.g. 15.6-inch' },
      { key: 'battery_life', label: 'Battery lasts about', type: 'text', placeholder: 'e.g. 4 hours' },
      { ...KEYBOARD, options: [...KEYBOARD.options] },
    ],
    locks: ['Windows account signed out, BIOS password off, not company-managed'],
    parts: LAPTOP_PARTS,
    faults: LAPTOP_FAULTS,
    inBox: LAPTOP_BOX,
    photos: LAPTOP_PHOTOS('Settings → About (specs)', 'Battery report or health'),
  },
  {
    key: 'desktop_pc',
    label: 'Gaming / desktop PC',
    category: 'desktops',
    identifier: 'serial',
    identifierRequired: false,
    identifierHelp: 'On the case, usually at the back.',
    specs: [
      { key: 'processor', label: 'Processor', type: 'text', placeholder: 'e.g. AMD Ryzen 7 5800X', required: true },
      { key: 'graphics', label: 'Graphics card', type: 'text', placeholder: 'e.g. RTX 4070 12 GB', required: true },
      { key: 'memory', label: 'RAM', type: 'chips', options: ['8 GB', '16 GB', '32 GB', '64 GB', '128 GB'], required: true },
      { key: 'storage', label: 'Storage', type: 'text', placeholder: 'e.g. 1 TB NVMe SSD', required: true },
      { key: 'psu', label: 'Power supply', type: 'text', placeholder: 'e.g. 750 W Gold' },
    ],
    locks: ['BIOS password off, Windows account signed out'],
    parts: [
      { key: 'gpu', label: 'Graphics card' },
      { key: 'psu', label: 'Power supply' },
      { key: 'motherboard', label: 'Motherboard' },
      { key: 'storage', label: 'Storage' },
    ],
    faults: [
      { key: 'ports', label: 'A port' },
      { key: 'fans', label: 'Fans' },
      { key: 'wifi_bluetooth', label: 'Wi-Fi / Bluetooth' },
      { key: 'crashes', label: 'Crashes or freezes' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'power_cable', label: 'Power cable' },
      { key: 'keyboard_mouse', label: 'Keyboard & mouse' },
    ],
    photos: [
      { key: 'front', label: 'Front', required: true },
      { key: 'inside', label: 'Inside (side panel off)', required: true },
      { key: 'specs', label: 'System info screen', required: true },
      { key: 'back', label: 'Back & ports' },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Extras' },
    ],
  },
  {
    key: 'console',
    label: 'PlayStation / Xbox',
    category: 'gaming',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'On the box or the back of the console.',
    specs: [
      { key: 'edition', label: 'Edition', type: 'chips', options: ['Disc', 'Digital'], required: true },
      { key: 'storage', label: 'Storage', type: 'chips', options: ['500 GB', '825 GB', '1 TB', '2 TB'], required: true },
      { key: 'controllers', label: 'Controllers included', type: 'number', placeholder: 'e.g. 1', required: true },
    ],
    locks: ['Signed out of PlayStation / Xbox account, not banned from playing online'],
    parts: [
      { key: 'disc_drive', label: 'Disc drive' },
      { key: 'fan', label: 'Fan' },
      { key: 'hdmi_port', label: 'HDMI port' },
      { key: 'power_supply', label: 'Power supply' },
      { key: 'storage', label: 'Storage' },
    ],
    faults: [
      { key: 'disc_drive', label: 'Disc drive' },
      { key: 'overheating', label: 'Overheating / loud fan' },
      { key: 'controller_drift', label: 'Controller drift' },
      { key: 'hdmi', label: 'HDMI / picture' },
      { key: 'wifi', label: 'Wi-Fi' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'hdmi_cable', label: 'HDMI cable' },
      { key: 'power_cable', label: 'Power cable' },
      { key: 'games', label: 'Games' },
    ],
    photos: [
      { key: 'front', label: 'Front', required: true },
      { key: 'back', label: 'Back & ports', required: true },
      { key: 'working', label: 'Switched on (home screen)', required: true },
      { key: 'about', label: 'System info (serial)', required: true },
      { key: 'controllers', label: 'Controllers' },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Box & extras' },
    ],
  },
  {
    key: 'handheld',
    label: 'Handheld (Steam Deck, Switch, ROG Ally)',
    category: 'gaming',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'On the back or bottom of the device, or in its system settings.',
    specs: [
      { key: 'storage', label: 'Storage', type: 'chips', options: ['32 GB', '64 GB', '256 GB', '512 GB', '1 TB'], required: true },
      { key: 'screen', label: 'Screen', type: 'chips', options: ['LCD', 'OLED'], required: true },
      { key: 'colour', label: 'Colour', type: 'text' },
    ],
    locks: ['Signed out of all accounts, not banned from playing online'],
    parts: [
      { key: 'screen', label: 'Screen' },
      { key: 'battery', label: 'Battery' },
      { key: 'sticks', label: 'Joysticks' },
      { key: 'charging_port', label: 'Charging port' },
    ],
    faults: [
      { key: 'drift', label: 'Stick drift' },
      { key: 'buttons', label: 'Buttons' },
      { key: 'charging', label: 'Charging' },
      { key: 'wifi', label: 'Wi-Fi' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'charger', label: 'Charger' },
      { key: 'case', label: 'Case' },
      { key: 'dock', label: 'Dock' },
    ],
    photos: BASIC_PHOTOS('System info (serial)'),
  },
  {
    key: 'vr_headset',
    label: 'Meta Quest / VR headset',
    category: 'vr_glasses',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Meta Horizon app → Devices, or on the box.',
    specs: [
      { key: 'storage', label: 'Storage', type: 'chips', options: ['64 GB', '128 GB', '256 GB', '512 GB'], required: true },
      { key: 'controllers', label: 'Controllers', type: 'chips', options: ['Both', 'One', 'None'], required: true },
    ],
    locks: ['Removed from the Meta account and factory reset'],
    parts: [
      { key: 'lenses', label: 'Lenses' },
      { key: 'face_cover', label: 'Face cover' },
      { key: 'strap', label: 'Strap' },
      { key: 'battery', label: 'Battery' },
    ],
    faults: [
      { key: 'tracking', label: 'Tracking' },
      { key: 'lenses', label: 'Lens scratches' },
      { key: 'controllers', label: 'A controller' },
      { key: 'charging', label: 'Charging' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'charger', label: 'Charger' },
      { key: 'case', label: 'Case' },
    ],
    photos: [
      { key: 'front', label: 'Front', required: true },
      { key: 'lenses', label: 'Lenses', required: true },
      { key: 'controllers', label: 'Controllers', required: true },
      { key: 'sides', label: 'Strap & sides' },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Box & extras' },
    ],
  },
  {
    key: 'smart_glasses',
    label: 'Smart glasses (Ray-Ban Meta)',
    category: 'vr_glasses',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Meta AI app → Devices, or inside the arm.',
    specs: [
      { key: 'style', label: 'Style', type: 'text', placeholder: 'e.g. Wayfarer, Matte Black', required: true },
      { key: 'lenses', label: 'Lenses', type: 'chips', options: ['Clear', 'Sunglasses', 'Transitions', 'Prescription'], required: true },
    ],
    locks: ['Removed from the Meta AI app'],
    parts: [
      { key: 'lenses', label: 'Lenses' },
      { key: 'battery', label: 'Battery' },
      { key: 'case', label: 'Charging case' },
    ],
    faults: [
      { key: 'camera', label: 'Camera' },
      { key: 'speakers', label: 'Speakers' },
      { key: 'charging', label: 'Charging' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'case', label: 'Charging case' },
      { key: 'cable', label: 'Cable' },
    ],
    photos: [
      { key: 'front', label: 'Front', required: true },
      { key: 'side', label: 'Side (camera)', required: true },
      { key: 'case', label: 'In the case', required: true },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Box & extras' },
    ],
  },
  {
    key: 'vision_pro',
    label: 'Apple Vision Pro',
    brand: 'Apple',
    category: 'vr_glasses',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Settings → General → About.',
    specs: [
      { key: 'storage', label: 'Storage', type: 'chips', options: ['256 GB', '512 GB', '1 TB'], required: true, fromSerial: true },
      { key: 'light_seal', label: 'Light seal size', type: 'text', placeholder: 'e.g. 23N' },
      { key: 'bands', label: 'Bands included', type: 'multi', options: ['Solo Knit', 'Dual Loop'] },
    ],
    locks: ['Find My and iCloud signed out (Activation Lock off)'],
    parts: [
      { key: 'cover_glass', label: 'Cover glass' },
      { key: 'light_seal', label: 'Light seal' },
      { key: 'battery', label: 'Battery' },
    ],
    faults: [
      { key: 'tracking', label: 'Eye or hand tracking' },
      { key: 'displays', label: 'Displays' },
      { key: 'speakers', label: 'Speakers' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'battery', label: 'Battery' },
      { key: 'cover', label: 'Cover' },
      { key: 'charger', label: 'Charger' },
    ],
    photos: [
      { key: 'front', label: 'Front (cover glass)', required: true },
      { key: 'inside', label: 'Inside (lenses & seal)', required: true },
      { key: 'about', label: 'About screen (serial)', required: true },
      { key: 'battery', label: 'Battery & cable' },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Box & extras' },
    ],
  },
  {
    key: 'apple_watch',
    label: 'Apple Watch',
    brand: 'Apple',
    category: 'wearables',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Watch: Settings → General → About.',
    specs: [
      { key: 'size', label: 'Case size', type: 'chips', options: ['40 mm', '41 mm', '42 mm', '44 mm', '45 mm', '46 mm', '49 mm'], required: true, fromSerial: true },
      { key: 'material', label: 'Case', type: 'chips', options: ['Aluminium', 'Stainless steel', 'Titanium'], required: true, fromSerial: true },
      { key: 'connectivity', label: 'Connectivity', type: 'chips', options: ['GPS', 'GPS + Cellular'], required: true, fromSerial: true },
      { key: 'band', label: 'Band', type: 'text', placeholder: 'e.g. Sport Band, Midnight' },
    ],
    locks: ['Unpaired from the iPhone (Activation Lock off)'],
    parts: [
      { key: 'screen', label: 'Screen' },
      { key: 'battery', label: 'Battery' },
      { key: 'back_sensor', label: 'Back sensor' },
    ],
    faults: [
      { key: 'sensors', label: 'Heart rate / sensors' },
      { key: 'crown', label: 'Digital Crown' },
      { key: 'charging', label: 'Charging' },
      { key: 'touch', label: 'Touch' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'charger', label: 'Charger' },
      { key: 'extra_band', label: 'Extra band' },
    ],
    batteryHealth: { help: 'Watch: Settings → Battery → Battery Health.' },
    photos: BASIC_PHOTOS('About screen (serial)'),
  },
  {
    key: 'smartwatch',
    label: 'Other smartwatch',
    category: 'wearables',
    identifier: 'serial',
    identifierRequired: false,
    identifierHelp: 'Settings → About, or on the back of the watch.',
    specs: [
      { key: 'size', label: 'Size', type: 'text', placeholder: 'e.g. 44 mm', required: true },
      { key: 'connectivity', label: 'Connectivity', type: 'chips', options: ['Bluetooth', 'LTE'] },
    ],
    locks: ['Removed from the phone app and account'],
    parts: [
      { key: 'screen', label: 'Screen' },
      { key: 'battery', label: 'Battery' },
    ],
    faults: [
      { key: 'sensors', label: 'Sensors' },
      { key: 'charging', label: 'Charging' },
      { key: 'touch', label: 'Touch' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'charger', label: 'Charger' },
    ],
    photos: BASIC_PHOTOS(),
  },
  {
    key: 'audio',
    label: 'AirPods & headphones',
    category: 'audio',
    identifier: 'serial',
    identifierRequired: false,
    identifierHelp: 'AirPods: inside the case lid, or iPhone Settings → Bluetooth → ⓘ.',
    specs: [
      { key: 'case', label: 'Case', type: 'chips', options: ['Charging case', 'MagSafe / wireless case', 'No case'], required: true, fromSerial: true },
      { key: 'colour', label: 'Colour', type: 'text' },
      { key: 'battery_life', label: 'Battery lasts about', type: 'text', placeholder: 'e.g. 4 hours' },
    ],
    locks: ['Removed from Find My / your account'],
    parts: [
      { key: 'left', label: 'Left earbud / side' },
      { key: 'right', label: 'Right earbud / side' },
      { key: 'case', label: 'Case' },
      { key: 'battery', label: 'Battery' },
      { key: 'cushions', label: 'Ear cushions' },
    ],
    faults: [
      { key: 'one_side', label: 'One side quiet or silent' },
      { key: 'noise_cancelling', label: 'Noise cancelling' },
      { key: 'microphone', label: 'Microphone' },
      { key: 'charging', label: 'Charging' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'cable', label: 'Cable' },
      { key: 'tips', label: 'Spare tips' },
    ],
    photos: [
      { key: 'front', label: 'In the case / on the stand', required: true },
      { key: 'parts', label: 'Each side up close', required: true },
      { key: 'serial', label: 'Serial (lid or settings)' },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Box & extras' },
    ],
  },
  {
    key: 'drone',
    label: 'Drone (DJI)',
    category: 'cameras_drones',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'Under the battery, or DJI Fly app → About.',
    specs: [
      { key: 'batteries', label: 'Batteries included', type: 'number', required: true },
      { key: 'controller', label: 'Controller', type: 'text', placeholder: 'e.g. DJI RC 2', required: true },
      { key: 'flight_hours', label: 'Flight time so far (hours)', type: 'number' },
      { key: 'care', label: 'DJI Care', type: 'chips', options: ['Active', 'None'] },
    ],
    locks: ['Unbound from your DJI account'],
    parts: [
      { key: 'gimbal', label: 'Gimbal / camera' },
      { key: 'arms', label: 'Arms' },
      { key: 'propellers', label: 'Propellers' },
      { key: 'battery', label: 'Battery' },
    ],
    faults: [
      { key: 'gimbal', label: 'Gimbal' },
      { key: 'gps', label: 'GPS' },
      { key: 'sensors', label: 'Obstacle sensors' },
      { key: 'battery', label: 'Battery swelling' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'case', label: 'Bag / case' },
      { key: 'charger', label: 'Charger' },
      { key: 'spare_props', label: 'Spare propellers' },
    ],
    photos: [
      { key: 'front', label: 'Drone', required: true },
      { key: 'camera', label: 'Camera & gimbal', required: true },
      { key: 'controller', label: 'Controller', required: true },
      { key: 'batteries', label: 'Batteries' },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Bag & extras' },
    ],
  },
  {
    key: 'camera',
    label: 'Camera',
    category: 'cameras_drones',
    identifier: 'serial',
    identifierRequired: true,
    identifierHelp: 'On the bottom of the body.',
    specs: [
      { key: 'type', label: 'Type', type: 'chips', options: ['Mirrorless', 'DSLR', 'Compact', 'Action'], required: true },
      { key: 'shutter_count', label: 'Shutter count', type: 'number', help: 'From the camera menu or an online checker.' },
      { key: 'lens', label: 'Lens included', type: 'text', placeholder: 'e.g. 24-70mm f/2.8, or body only' },
    ],
    locks: [BLACKLIST_LOCK],
    parts: [
      { key: 'sensor', label: 'Sensor' },
      { key: 'shutter', label: 'Shutter' },
      { key: 'screen', label: 'Screen' },
      { key: 'mount', label: 'Lens mount' },
    ],
    faults: [
      { key: 'sensor_spots', label: 'Sensor spots' },
      { key: 'autofocus', label: 'Autofocus' },
      { key: 'buttons', label: 'Buttons / dials' },
      { key: 'screen', label: 'Screen' },
    ],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'battery', label: 'Battery' },
      { key: 'charger', label: 'Charger' },
      { key: 'strap', label: 'Strap' },
    ],
    photos: [
      { key: 'front', label: 'Front', required: true },
      { key: 'back', label: 'Back & screen', required: true },
      { key: 'top', label: 'Top', required: true },
      { key: 'sensor', label: 'Sensor / mount' },
      { key: 'damage', label: 'Close-up of damage', ifDamage: true },
      { key: 'box', label: 'Box & extras' },
    ],
  },
  {
    key: 'other',
    label: 'Something else',
    category: 'other',
    identifier: 'serial',
    identifierRequired: false,
    identifierHelp: 'On the device, its box or in its settings.',
    specs: [{ key: 'details', label: 'Key details', type: 'text', placeholder: 'e.g. size, capacity, colour', required: true }],
    locks: ['Signed out of any accounts and reset', BLACKLIST_LOCK],
    parts: [{ key: 'any', label: 'Any part' }],
    faults: [{ key: 'something', label: 'Something (say what below)' }],
    inBox: [
      { key: 'box', label: 'Box' },
      { key: 'charger', label: 'Charger / cable' },
    ],
    photos: BASIC_PHOTOS(),
  },
];

export const profileByKey = (key?: string | null): DeviceProfile | undefined =>
  DEVICE_PROFILES.find(p => p.key === key);

export const profilesForCategory = (category: ListingCategoryKey) =>
  DEVICE_PROFILES.filter(p => p.category === category);

/* ------------------------------------------------------------------ */
/* Condition, repairs and damage                                       */
/* ------------------------------------------------------------------ */

/** Gadget.condition values (unchanged), with what each grade means. */
export const CONDITION_GRADES: { key: string; label: string; help: string }[] = [
  { key: 'new', label: 'New · sealed', help: 'Never opened, in its sealed box.' },
  { key: 'like_new', label: 'Like new', help: 'No marks you can see at arm’s length.' },
  { key: 'excellent', label: 'Grade A', help: 'Light signs of use, no dents or cracks.' },
  { key: 'good', label: 'Grade B', help: 'Visible scratches or scuffs.' },
  { key: 'fair', label: 'Grade C', help: 'Heavy wear, dents or deep scratches.' },
  { key: 'for_parts', label: 'For parts', help: 'Doesn’t work properly.' },
];

/** Every damage answer we accept (the server checks against this). Ask with damageOptionsFor(profile). */
export const DAMAGE_OPTIONS: Option[] = [
  { key: 'cracked_screen', label: 'Cracked screen' },
  { key: 'cracked_back', label: 'Cracked back' },
  { key: 'dents', label: 'Dents on frame' },
  { key: 'camera_lens', label: 'Scratched camera lens' },
  { key: 'lines_burn_in', label: 'Lines or burn-in' },
  { key: 'body_damage', label: 'Dents or cracks on the body' },
  { key: 'hinge', label: 'Loose or broken hinge' },
  { key: 'lens_scratch', label: 'Scratched lens' },
  { key: 'water', label: 'Water damage' },
];

const DAMAGE_BY_CATEGORY: Record<ListingCategoryKey, string[]> = {
  phones: ['cracked_screen', 'cracked_back', 'dents', 'camera_lens', 'lines_burn_in', 'water'],
  tablets: ['cracked_screen', 'dents', 'camera_lens', 'lines_burn_in', 'water'],
  laptops: ['cracked_screen', 'body_damage', 'hinge', 'lines_burn_in', 'water'],
  desktops: ['body_damage', 'water'],
  audio: ['body_damage', 'water'],
  gaming: ['body_damage', 'water'],
  wearables: ['cracked_screen', 'body_damage', 'water'],
  vr_glasses: ['lens_scratch', 'body_damage', 'water'],
  cameras_drones: ['lens_scratch', 'body_damage', 'water'],
  other: ['cracked_screen', 'body_damage', 'water'],
};

/** The damage chips that make sense for this kind of device (no "Cracked back" for headphones). */
export const damageOptionsFor = (profile: DeviceProfile | undefined): Option[] => {
  if (!profile) return DAMAGE_OPTIONS;
  const keys =
    profile.key === 'handheld' ? ['cracked_screen', 'body_damage', 'lines_burn_in', 'water'] : DAMAGE_BY_CATEGORY[profile.category];
  return DAMAGE_OPTIONS.filter(o => keys.includes(o.key));
};

export type PartSource = 'genuine' | 'replacement' | 'not_sure';
export const PART_SOURCES: { key: PartSource; label: string }[] = [
  { key: 'genuine', label: 'Genuine (maker)' },
  { key: 'replacement', label: 'Replacement part' },
  { key: 'not_sure', label: 'Not sure' },
];

export const PARTS_HISTORY_OPTIONS: Option[] = [
  { key: 'genuine', label: 'Genuine parts only' },
  { key: 'unknown_part', label: 'Shows "Unknown Part"' },
  { key: 'nothing', label: 'Nothing listed' },
];

/** What's saved in Gadget.specifications by the new flow (older listings use the flat keys in gadgetSpecs.ts). */
export type ListingSpecs = {
  profile: string;
  /** Spec answers keyed by SpecField.key. */
  [specKey: string]: unknown;
  from_serial?: string[];
  /** Ticked lock statements (all of the profile's locks). */
  locks_confirmed?: boolean;
  /** Shown to buyers instead of the full IMEI / serial. */
  identifier_masked?: string;
  battery_health?: number;
  faults?: string[];
  included?: string[];
  repairs?: {
    opened: 'never' | 'yes' | 'not_sure';
    parts?: Record<string, PartSource>;
    parts_history?: string;
  };
  damage?: string[];
  /** Photo slot key → image URL (images[] keeps the buyer-facing order). */
  photos?: Record<string, string>;
  /** "This item is mine to sell, and the details are true." */
  attested_at?: string;
};

export type Disclosure = { label: string; tone: 'amber' | 'blue' | 'red' | 'neutral' };

/** "Buyers will see": the repairs and damage, as short tinted lines. */
export const listingDisclosures = (specs: Partial<ListingSpecs> | null | undefined): Disclosure[] => {
  if (!specs) return [];
  const profile = profileByKey(specs.profile as string);
  const out: Disclosure[] = [];
  const parts = specs.repairs?.parts ?? {};
  for (const [key, source] of Object.entries(parts)) {
    const label = profile?.parts.find(p => p.key === key)?.label ?? key;
    const name = label.split(' / ')[0];
    if (source === 'genuine') out.push({ label: `${name} replaced · genuine part`, tone: 'blue' });
    else if (source === 'replacement') out.push({ label: `${name} replaced · non-genuine part`, tone: 'amber' });
    else out.push({ label: `${name} replaced · part not known`, tone: 'amber' });
  }
  if (specs.repairs?.opened === 'not_sure') out.push({ label: 'Seller isn’t sure if it was opened', tone: 'neutral' });
  if (specs.repairs?.parts_history === 'unknown_part') out.push({ label: 'iPhone shows "Unknown Part"', tone: 'amber' });
  for (const d of specs.damage ?? []) {
    const label = DAMAGE_OPTIONS.find(o => o.key === d)?.label;
    if (label) out.push({ label, tone: d === 'water' ? 'red' : 'amber' });
  }
  for (const f of specs.faults ?? []) {
    const label = profile?.faults.find(o => o.key === f)?.label;
    if (label) out.push({ label: `Not working: ${label}`, tone: 'red' });
  }
  return out;
};

/** Photo slots to show, given whether the seller reported damage. */
export const photoSlotsFor = (profile: DeviceProfile, hasDamage: boolean) =>
  profile.photos.filter(p => !p.ifDamage || hasDamage);

/** The required slots still empty. */
export const missingPhotos = (profile: DeviceProfile, photos: Record<string, string> | undefined, hasDamage: boolean) =>
  photoSlotsFor(profile, hasDamage).filter(p => (p.required || (p.ifDamage && hasDamage)) && !photos?.[p.key]);

/** Luhn check for a 15-digit IMEI. */
export const isValidImei = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let n = Number(d[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
};

/** "356789…5231" / "K7Q4…MXFJ" */
export const maskIdentifier = (raw: string) => {
  const v = raw.replace(/\s/g, '');
  return v.length <= 8 ? v : `${v.slice(0, 4)}…${v.slice(-4)}`;
};
