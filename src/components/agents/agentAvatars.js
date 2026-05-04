/**
 * Multi-style DiceBear avatar support for agent selection.
 *
 * ID formats:
 *   "style:seed"   — new format, e.g. "bottts:abc123"
 *   "a1"–"a36"     — legacy avataaars presets (backward compat)
 *   "rnd_xxx"      — legacy random avataaars seeds (backward compat)
 */
import { createAvatar } from '@dicebear/core'
import * as avataaarsStyle from '@dicebear/avataaars'
import * as collection from '@dicebear/collection'
import { BUILTIN_SYSTEM_ICON_ID } from '../../stores/agents'
import systemIconUrl from '@/assets/icon.png'

// ── Style catalogue ────────────────────────────────────────────────────────

export const STYLES = [
  { key: 'agents',            i18nKey: 'agents.avatarStyleAgents',            style: collection.personas },
  { key: 'glass',             i18nKey: 'agents.avatarStyleGlass',             style: collection.glass },
  { key: 'avataaars',         i18nKey: 'agents.avatarStyleAvataaars',         style: collection.avataaars },
  { key: 'avataaarsNeutral',  i18nKey: 'agents.avatarStyleAvataaarsNeutral',  style: collection.avataaarsNeutral },
  { key: 'adventurer',        i18nKey: 'agents.avatarStyleAdventurer',        style: collection.adventurer },
  { key: 'adventurerNeutral', i18nKey: 'agents.avatarStyleAdventurerNeutral', style: collection.adventurerNeutral },
  { key: 'lorelei',           i18nKey: 'agents.avatarStyleLorelei',           style: collection.lorelei },
  { key: 'loreleiNeutral',    i18nKey: 'agents.avatarStyleLoreleiNeutral',    style: collection.loreleiNeutral },
  { key: 'notionists',        i18nKey: 'agents.avatarStyleNotionists',        style: collection.notionists },
  { key: 'notionistsNeutral', i18nKey: 'agents.avatarStyleNotionistsNeutral', style: collection.notionistsNeutral },
  { key: 'openPeeps',         i18nKey: 'agents.avatarStyleOpenPeeps',         style: collection.openPeeps },
  { key: 'micah',             i18nKey: 'agents.avatarStyleMicah',             style: collection.micah },
  { key: 'bigEars',           i18nKey: 'agents.avatarStyleBigEars',           style: collection.bigEars },
  { key: 'bigEarsNeutral',    i18nKey: 'agents.avatarStyleBigEarsNeutral',    style: collection.bigEarsNeutral },
  { key: 'bigSmile',          i18nKey: 'agents.avatarStyleBigSmile',          style: collection.bigSmile },
  { key: 'dylan',             i18nKey: 'agents.avatarStyleDylan',             style: collection.dylan },
  { key: 'miniavs',           i18nKey: 'agents.avatarStyleMiniavs',           style: collection.miniavs },
  { key: 'croodles',          i18nKey: 'agents.avatarStyleCroodles',          style: collection.croodles },
  { key: 'croodlesNeutral',   i18nKey: 'agents.avatarStyleCroodlesNeutral',   style: collection.croodlesNeutral },
  { key: 'bottts',            i18nKey: 'agents.avatarStyleBottts',            style: collection.bottts },
  { key: 'botttsNeutral',     i18nKey: 'agents.avatarStyleBotttsNeutral',     style: collection.botttsNeutral },
  { key: 'funEmoji',          i18nKey: 'agents.avatarStyleFunEmoji',          style: collection.funEmoji },
  { key: 'pixelArt',          i18nKey: 'agents.avatarStylePixelArt',          style: collection.pixelArt },
  { key: 'pixelArtNeutral',   i18nKey: 'agents.avatarStylePixelArtNeutral',   style: collection.pixelArtNeutral },
  { key: 'thumbs',            i18nKey: 'agents.avatarStyleThumbs',            style: collection.thumbs },
  { key: 'rings',             i18nKey: 'agents.avatarStyleRings',             style: collection.rings },
  { key: 'shapes',            i18nKey: 'agents.avatarStyleShapes',            style: collection.shapes },
  { key: 'icons',             i18nKey: 'agents.avatarStyleIcons',             style: collection.icons },
  { key: 'identicon',         i18nKey: 'agents.avatarStyleIdenticon',         style: collection.identicon },
]

// ── Legacy avataaars presets (a1–a36) ─────────────────────────────────────

const AVATAR_PRESETS = [
  // Row 1: Short hair males — diverse skin tones, positive expressions
  { id: 'a1',  top: ['shortFlat'],    hairColor: ['0e0e0e'], skinColor: ['edb98a'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['shirtCrewNeck'],    clothesColor: ['3c4f5c'],  accessories: [] },
  { id: 'a2',  top: ['shortWaved'],   hairColor: ['724133'], skinColor: ['d08b5b'], eyes: ['happy'],          eyebrows: ['raisedExcitedNatural'], mouth: ['twinkle'], facialHair: [],                clothing: ['hoodie'],           clothesColor: ['65c9ff'],  accessories: [] },
  { id: 'a3',  top: ['shortCurly'],   hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndShirt'],   clothesColor: ['262e33'],  accessories: [] },
  { id: 'a4',  top: ['shortRound'],   hairColor: ['b58143'], skinColor: ['ffdbb4'], eyes: ['wink'],           eyebrows: ['raisedExcited'],        mouth: ['smile'],   facialHair: [],                clothing: ['shirtVNeck'],       clothesColor: ['929598'],  accessories: [] },
  { id: 'a5',  top: ['dreads01'],     hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['twinkle'], facialHair: [],                clothing: ['collarAndSweater'], clothesColor: ['e6e6e6'],  accessories: [] },
  { id: 'a6',  top: ['shortFlat'],    hairColor: ['4a312c'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: ['beardLight'],    clothing: ['shirtCrewNeck'],    clothesColor: ['b1e2ff'],  facialHairColor: ['4a312c'], accessories: [] },
  // Row 2: Long hair females — warm, friendly
  { id: 'a7',  top: ['straight01'],   hairColor: ['0e0e0e'], skinColor: ['edb98a'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndSweater'], clothesColor: ['ff5c5c'],  accessories: [] },
  { id: 'a8',  top: ['bob'],          hairColor: ['4a312c'], skinColor: ['d08b5b'], eyes: ['happy'],          eyebrows: ['raisedExcitedNatural'], mouth: ['twinkle'], facialHair: [],                clothing: ['shirtScoopNeck'],   clothesColor: ['ffafb9'],  accessories: [] },
  { id: 'a9',  top: ['curly'],        hairColor: ['a55728'], skinColor: ['ffdbb4'], eyes: ['wink'],           eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],           clothesColor: ['ffd5dc'],  accessories: [] },
  { id: 'a10', top: ['fro'],          hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['shirtCrewNeck'],    clothesColor: ['ff488e'],  accessories: [] },
  { id: 'a11', top: ['straight02'],   hairColor: ['b58143'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['raisedExcitedNatural'], mouth: ['twinkle'], facialHair: [],                clothing: ['blazerAndShirt'],   clothesColor: ['25557c'],  accessories: [] },
  { id: 'a12', top: ['curvy'],        hairColor: ['c93305'], skinColor: ['ffdbb4'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['shirtVNeck'],       clothesColor: ['a7ffc4'],  accessories: [] },
  // Row 3: Professional — blazers, clean look
  { id: 'a13', top: ['shortFlat'],    hairColor: ['0e0e0e'], skinColor: ['d08b5b'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndShirt'],   clothesColor: ['262e33'],  accessories: [] },
  { id: 'a14', top: ['bun'],          hairColor: ['4a312c'], skinColor: ['edb98a'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['twinkle'], facialHair: [],                clothing: ['blazerAndSweater'], clothesColor: ['929598'],  accessories: [] },
  { id: 'a15', top: ['shortFlat'],    hairColor: ['c0c0c0'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: ['beardMedium'],   clothing: ['blazerAndShirt'],   clothesColor: ['929598'],  facialHairColor: ['c0c0c0'], accessories: ['round'] },
  { id: 'a16', top: ['longButNotTooLong'], hairColor: ['0e0e0e'], skinColor: ['ffdbb4'], eyes: ['happy'],     eyebrows: ['flatNatural'],          mouth: ['smile'],   facialHair: [],                clothing: ['collarAndSweater'], clothesColor: ['262e33'],  accessories: [] },
  { id: 'a17', top: ['shortFlat'],    hairColor: ['724133'], skinColor: ['ae5d29'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['twinkle'], facialHair: ['moustacheFancy'], clothing: ['blazerAndSweater'], clothesColor: ['25557c'],  facialHairColor: ['724133'], accessories: [] },
  { id: 'a18', top: ['hijab'],        hairColor: ['0e0e0e'], skinColor: ['d08b5b'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['collarAndSweater'], clothesColor: ['b1e2ff'],  accessories: [] },
  // Row 4: Fun / Casual — expressive, cheerful
  { id: 'a19', top: ['froBand'],      hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['wink'],           eyebrows: ['raisedExcited'],        mouth: ['smile'],   facialHair: [],                clothing: ['overall'],          clothesColor: ['25557c'],  accessories: [] },
  { id: 'a20', top: ['hat'],          hairColor: ['724133'], skinColor: ['edb98a'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['twinkle'], facialHair: [],                clothing: ['hoodie'],           clothesColor: ['ff5c5c'],  accessories: [] },
  { id: 'a21', top: ['winterHat02'],  hairColor: ['b58143'], skinColor: ['ffdbb4'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],           clothesColor: ['b1e2ff'],  accessories: [] },
  { id: 'a22', top: ['frizzle'],      hairColor: ['f59797'], skinColor: ['edb98a'], eyes: ['happy'],          eyebrows: ['raisedExcitedNatural'], mouth: ['smile'],   facialHair: [],                clothing: ['graphicShirt'],     clothesColor: ['ff488e'],  clothingGraphic: ['diamond'], accessories: ['sunglasses'] },
  { id: 'a23', top: ['longButNotTooLong'], hairColor: ['ecdcbf'], skinColor: ['edb98a'], eyes: ['wink'],      eyebrows: ['defaultNatural'],       mouth: ['twinkle'], facialHair: [],                clothing: ['shirtCrewNeck'],    clothesColor: ['929598'],  accessories: [] },
  { id: 'a24', top: ['shaggyMullet'], hairColor: ['a55728'], skinColor: ['d08b5b'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: ['beardLight'],    clothing: ['graphicShirt'],     clothesColor: ['65c9ff'],  facialHairColor: ['a55728'], clothingGraphic: ['diamond'], accessories: [] },
  // Row 5: Diverse styles — cultural, bald, distinctive
  { id: 'a25', top: ['turban'],       hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: ['beardMajestic'], clothing: ['collarAndSweater'], clothesColor: ['e6e6e6'],  facialHairColor: ['0e0e0e'], accessories: [] },
  { id: 'a26', top: [], topProbability: 0, hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['happy'],     eyebrows: ['default'],              mouth: ['twinkle'], facialHair: ['beardLight'],    clothing: ['shirtCrewNeck'],    clothesColor: ['929598'],  facialHairColor: ['0e0e0e'], accessories: [] },
  { id: 'a27', top: ['straightAndStrand'], hairColor: ['b58143'], skinColor: ['ffdbb4'], eyes: ['happy'],     eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndShirt'],   clothesColor: ['ff5c5c'],  accessories: [] },
  { id: 'a28', top: ['shortFlat'],    hairColor: ['0e0e0e'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['raisedExcitedNatural'], mouth: ['twinkle'], facialHair: ['moustacheMagnum'], clothing: ['blazerAndShirt'],  clothesColor: ['262e33'],  facialHairColor: ['0e0e0e'], accessories: [] },
  { id: 'a29', top: ['fro'],          hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['shirtScoopNeck'],   clothesColor: ['ffffb1'],  accessories: [] },
  { id: 'a30', top: ['winterHat03'],  hairColor: ['724133'], skinColor: ['edb98a'], eyes: ['wink'],           eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],           clothesColor: ['a7ffc4'],  accessories: [] },
  // Row 6: More variety
  { id: 'a31', top: ['dreads'],       hairColor: ['724133'], skinColor: ['614335'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['twinkle'], facialHair: [],                clothing: ['overall'],          clothesColor: ['25557c'],  accessories: [] },
  { id: 'a32', top: ['dreads02'],     hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['happy'],          eyebrows: ['raisedExcited'],        mouth: ['smile'],   facialHair: [],                clothing: ['graphicShirt'],     clothesColor: ['262e33'],  clothingGraphic: ['diamond'], accessories: ['sunglasses'] },
  { id: 'a33', top: ['shavedSides'],  hairColor: ['ecdcbf'], skinColor: ['edb98a'], eyes: ['wink'],           eyebrows: ['defaultNatural'],       mouth: ['twinkle'], facialHair: [],                clothing: ['shirtVNeck'],       clothesColor: ['262e33'],  accessories: [] },
  { id: 'a34', top: ['winterHat1'],   hairColor: ['c93305'], skinColor: ['ffdbb4'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],           clothesColor: ['e6e6e6'],  accessories: [] },
  { id: 'a35', top: ['shortFlat'],    hairColor: ['b58143'], skinColor: ['f8d25c'], eyes: ['default'],        eyebrows: ['raisedExcitedNatural'], mouth: ['smile'],   facialHair: [],                clothing: ['shirtCrewNeck'],    clothesColor: ['ffafb9'],  accessories: [] },
  { id: 'a36', top: ['frida'],        hairColor: ['4a312c'], skinColor: ['d08b5b'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['collarAndSweater'], clothesColor: ['ff5c5c'],  accessories: [] },
]

export const AGENT_AVATARS = AVATAR_PRESETS

// ── SVG cache ──────────────────────────────────────────────────────────────

const svgCache = new Map()

function buildOptions(preset) {
  const opts = {}
  for (const [key, val] of Object.entries(preset)) {
    if (key === 'id') continue
    opts[key] = val
  }
  if (preset.facialHair && preset.facialHair.length > 0) opts.facialHairProbability = 100
  if (preset.accessories && preset.accessories.length > 0) opts.accessoriesProbability = 100
  return opts
}

function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve a style module by key. Returns avataaars as fallback.
 */
function resolveStyle(styleKey) {
  const found = STYLES.find(s => s.key === styleKey)
  return found ? found.style : STYLES[0].style
}

/**
 * Get avatar SVG data URI. Handles all ID formats:
 *   "style:seed"  — multi-style (new)
 *   "a1"–"a36"    — legacy avataaars presets
 *   "rnd_xxx"     — legacy random avataaars seeds
 */
export function getAvatarDataUri(id) {
  if (!id) return null
  if (id === BUILTIN_SYSTEM_ICON_ID) return systemIconUrl
  // Custom uploaded image — stored as a data URI directly
  if (id.startsWith('data:')) return id
  if (svgCache.has(id)) return svgCache.get(id)

  let svg
  if (id.includes(':')) {
    // New format: style:seed
    const sep = id.indexOf(':')
    const styleKey = id.slice(0, sep)
    const seed = id.slice(sep + 1)
    const styleModule = resolveStyle(styleKey)
    const positiveOpts = POSITIVE_STYLE_OPTIONS[styleKey]
    const opts = positiveOpts ? { seed, ...positiveOpts } : { seed }
    svg = createAvatar(styleModule, opts).toString()
  } else if (/^a\d+$/.test(id)) {
    // Legacy preset IDs a1–a36
    const preset = AVATAR_PRESETS.find(a => a.id === id)
    if (preset) {
      svg = createAvatar(avataaarsStyle, buildOptions(preset)).toString()
    } else {
      svg = createAvatar(avataaarsStyle, { seed: id }).toString()
    }
  } else {
    // Legacy rnd_xxx — old random avataaars seed (positive expressions only)
    svg = createAvatar(avataaarsStyle, { seed: id, ...POSITIVE_STYLE_OPTIONS.avataaars }).toString()
  }

  const dataUri = svgToDataUri(svg)
  svgCache.set(id, dataUri)
  return dataUri
}

/** Get raw SVG string for an avatar ID */
export function getAvatarSvg(id) {
  const dataUri = getAvatarDataUri(id)
  if (!dataUri) return null
  return decodeURIComponent(dataUri.replace('data:image/svg+xml;charset=utf-8,', ''))
}

/** Get avatar config by id (legacy compat) */
export function getAvatarConfig(id) {
  return AVATAR_PRESETS.find(a => a.id === id) || null
}

// ── Positive-only expression filters per style ────────────────────────────
// Only friendly / professional expressions — no vomit, cry, angry, sad, etc.
// Styles not listed here use DiceBear defaults (abstract/geometric styles need no filtering).
const POSITIVE_STYLE_OPTIONS = {
  avataaars: {
    mouth: ['smile', 'twinkle', 'default'],
    eyes: ['default', 'happy', 'wink', 'side', 'hearts'],
    eyebrows: ['default', 'defaultNatural', 'flatNatural', 'raisedExcited', 'raisedExcitedNatural'],
  },
  avataaarsNeutral: {
    mouth: ['smile', 'twinkle', 'default'],
    eyes: ['default', 'happy', 'wink', 'side', 'hearts'],
    eyebrows: ['default', 'defaultNatural', 'flatNatural', 'raisedExcited', 'raisedExcitedNatural'],
  },
  lorelei: {
    mouth: ['happy01', 'happy02', 'happy03', 'happy04', 'happy05', 'happy06', 'happy07', 'happy08', 'happy09', 'happy10', 'happy11', 'happy12', 'happy13', 'happy14', 'happy15', 'happy16', 'happy17', 'happy18'],
  },
  loreleiNeutral: {
    mouth: ['happy01', 'happy02', 'happy03', 'happy04', 'happy05', 'happy06', 'happy07', 'happy08', 'happy09', 'happy10', 'happy11', 'happy12', 'happy13', 'happy14', 'happy15', 'happy16', 'happy17', 'happy18'],
  },
  personas: {
    mouth: ['surprised', 'laughing', 'smile', 'pucker', 'smirk'],
    eyes: ['eyes', 'round', 'eyesShadow', 'smiling', 'smilingShadow'],
  },
  micah: {
    mouth: ['smile', 'bigSmile', 'smirk', 'lips'],
    eyes: ['open', 'wink', 'happy', 'glasses', 'sunglasses'],
    eyebrows: ['up', 'eyelashesUp'],
  },
  dylan: {
    mood: ['happy', 'superHappy', 'hopeful', 'neutral'],
  },
  openPeeps: {
    face: ['awe', 'blank', 'calm', 'cheeky', 'cute', 'driven', 'eatingHappy', 'explaining', 'lovingGrin1', 'lovingGrin2', 'smile', 'smileBig', 'smileLOL', 'smileTeethGap'],
  },
  funEmoji: {
    eyes: ['cute', 'wink', 'wink2', 'plain', 'glasses', 'love', 'stars', 'closed', 'closed2', 'shades'],
    mouth: ['plain', 'lilSmile', 'cute', 'wideSmile', 'smileTeeth', 'smileLol', 'shy', 'tongueOut', 'kissHeart'],
  },
  croodles: {
    mouth: ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06', 'variant07', 'variant08', 'variant09', 'variant10', 'variant11', 'variant12', 'variant13', 'variant14', 'variant15', 'variant16', 'variant17', 'variant18'],
  },
  miniavs: {
    eyes: ['normal', 'confident', 'happy'],
  },
}

/**
 * Generate a batch of random avatar IDs for a given style.
 * Returns array of { id } objects where id is "styleKey:seed".
 */
export function generateRandomBatch(count = 36, styleKey = 'avataaars') {
  const batch = []
  const ts = Date.now()
  for (let i = 0; i < count; i++) {
    const seed = `${ts}_${i}_${Math.random().toString(36).slice(2, 8)}`
    batch.push({ id: `${styleKey}:${seed}` })
  }
  return batch
}
