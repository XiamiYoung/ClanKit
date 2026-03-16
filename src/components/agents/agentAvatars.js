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

// ── Style catalogue ────────────────────────────────────────────────────────

export const STYLES = [
  { key: 'avataaars',         label: 'Avataaars',           style: collection.avataaars },
  { key: 'avataaarsNeutral',  label: 'Avataaars Neutral',   style: collection.avataaarsNeutral },
  { key: 'adventurer',        label: 'Adventurer',          style: collection.adventurer },
  { key: 'adventurerNeutral', label: 'Adventurer Neutral',  style: collection.adventurerNeutral },
  { key: 'lorelei',           label: 'Lorelei',             style: collection.lorelei },
  { key: 'loreleiNeutral',    label: 'Lorelei Neutral',     style: collection.loreleiNeutral },
  { key: 'notionists',        label: 'Notionists',          style: collection.notionists },
  { key: 'notionistsNeutral', label: 'Notionists Neutral',  style: collection.notionistsNeutral },
  { key: 'openPeeps',         label: 'Open Peeps',          style: collection.openPeeps },
  { key: 'agents',          label: 'Agents',              style: collection.agents },
  { key: 'micah',             label: 'Micah',               style: collection.micah },
  { key: 'bigEars',           label: 'Big Ears',            style: collection.bigEars },
  { key: 'bigEarsNeutral',    label: 'Big Ears Neutral',    style: collection.bigEarsNeutral },
  { key: 'bigSmile',          label: 'Big Smile',           style: collection.bigSmile },
  { key: 'dylan',             label: 'Dylan',               style: collection.dylan },
  { key: 'miniavs',           label: 'Miniavs',             style: collection.miniavs },
  { key: 'croodles',          label: 'Croodles',            style: collection.croodles },
  { key: 'croodlesNeutral',   label: 'Croodles Neutral',    style: collection.croodlesNeutral },
  { key: 'bottts',            label: 'Bottts',              style: collection.bottts },
  { key: 'botttsNeutral',     label: 'Bottts Neutral',      style: collection.botttsNeutral },
  { key: 'funEmoji',          label: 'Fun Emoji',           style: collection.funEmoji },
  { key: 'pixelArt',          label: 'Pixel Art',           style: collection.pixelArt },
  { key: 'pixelArtNeutral',   label: 'Pixel Art Neutral',   style: collection.pixelArtNeutral },
  { key: 'thumbs',            label: 'Thumbs',              style: collection.thumbs },
  { key: 'rings',             label: 'Rings',               style: collection.rings },
  { key: 'shapes',            label: 'Shapes',              style: collection.shapes },
  { key: 'glass',             label: 'Glass',               style: collection.glass },
  { key: 'icons',             label: 'Icons',               style: collection.icons },
  { key: 'identicon',         label: 'Identicon',           style: collection.identicon },
]

// ── Legacy avataaars presets (a1–a36) ─────────────────────────────────────

const AVATAR_PRESETS = [
  // Row 1: Short hair, diverse skin tones
  { id: 'a1',  top: ['shortFlat'],    hairColor: ['0e0e0e'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['shirtCrewNeck'],   clothesColor: ['3c4f5c'],  accessories: [] },
  { id: 'a2',  top: ['shortWaved'],   hairColor: ['724133'], skinColor: ['d08b5b'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['twinkle'], facialHair: [],                clothing: ['hoodie'],          clothesColor: ['65c9ff'],  accessories: [] },
  { id: 'a3',  top: ['shortCurly'],   hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndShirt'], clothesColor: ['262e33'],  accessories: [] },
  { id: 'a4',  top: ['shortRound'],   hairColor: ['b58143'], skinColor: ['ffdbb4'], eyes: ['default'],        eyebrows: ['raisedExcited'],        mouth: ['smile'],   facialHair: [],                clothing: ['shirtVNeck'],      clothesColor: ['929598'],  accessories: [] },
  { id: 'a5',  top: ['dreads01'],     hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['twinkle'], facialHair: [],                clothing: ['collarAndSweater'],clothesColor: ['e6e6e6'],  accessories: [] },
  { id: 'a6',  top: ['shortFlat'],    hairColor: ['4a312c'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: ['beardLight'],    clothing: ['shirtCrewNeck'],   clothesColor: ['b1e2ff'],  facialHairColor: ['4a312c'], accessories: [] },
  // Row 2: Long hair
  { id: 'a7',  top: ['straight01'],   hairColor: ['0e0e0e'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndSweater'], clothesColor: ['ff5c5c'], accessories: [] },
  { id: 'a8',  top: ['bob'],          hairColor: ['4a312c'], skinColor: ['d08b5b'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['twinkle'], facialHair: [],                clothing: ['shirtScoopNeck'],  clothesColor: ['ffafb9'],  accessories: [] },
  { id: 'a9',  top: ['curly'],        hairColor: ['a55728'], skinColor: ['ffdbb4'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],          clothesColor: ['ffd5dc'],  accessories: [] },
  { id: 'a10', top: ['fro'],          hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['shirtCrewNeck'],   clothesColor: ['ff488e'],  accessories: ['round'] },
  { id: 'a11', top: ['straight02'],   hairColor: ['b58143'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['raisedExcitedNatural'], mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndShirt'],  clothesColor: ['25557c'],  accessories: [] },
  { id: 'a12', top: ['curvy'],        hairColor: ['c93305'], skinColor: ['ffdbb4'], eyes: ['happy'],          eyebrows: ['defaultNatural'],       mouth: ['twinkle'], facialHair: [],                clothing: ['shirtVNeck'],      clothesColor: ['a7ffc4'],  accessories: [] },
  // Row 3: Professional
  { id: 'a13', top: ['shortFlat'],    hairColor: ['0e0e0e'], skinColor: ['d08b5b'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['serious'], facialHair: [],                clothing: ['blazerAndShirt'],  clothesColor: ['262e33'],  accessories: ['prescription02'] },
  { id: 'a14', top: ['bun'],          hairColor: ['4a312c'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndSweater'], clothesColor: ['929598'], accessories: [] },
  { id: 'a15', top: ['shortFlat'],    hairColor: ['c0c0c0'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: ['beardMedium'],   clothing: ['blazerAndShirt'],  clothesColor: ['929598'],  facialHairColor: ['c0c0c0'], accessories: ['prescription01'] },
  { id: 'a16', top: ['longButNotTooLong'], hairColor: ['0e0e0e'], skinColor: ['ffdbb4'], eyes: ['default'],   eyebrows: ['flatNatural'],          mouth: ['smile'],   facialHair: [],                clothing: ['collarAndSweater'],clothesColor: ['262e33'],  accessories: [] },
  { id: 'a17', top: ['shortFlat'],    hairColor: ['724133'], skinColor: ['ae5d29'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['twinkle'], facialHair: ['moustacheFancy'], clothing: ['blazerAndSweater'], clothesColor: ['25557c'], facialHairColor: ['724133'], accessories: [] },
  { id: 'a18', top: ['hijab'],        hairColor: ['0e0e0e'], skinColor: ['d08b5b'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['collarAndSweater'],clothesColor: ['b1e2ff'],  accessories: [] },
  // Row 4: Fun / Casual
  { id: 'a19', top: ['froBand'],      hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['wink'],           eyebrows: ['raisedExcited'],        mouth: ['smile'],   facialHair: [],                clothing: ['overall'],         clothesColor: ['25557c'],  accessories: [] },
  { id: 'a20', top: ['hat'],          hairColor: ['724133'], skinColor: ['edb98a'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],          clothesColor: ['ff5c5c'],  accessories: [] },
  { id: 'a21', top: ['winterHat02'],  hairColor: ['b58143'], skinColor: ['ffdbb4'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],          clothesColor: ['b1e2ff'],  accessories: [] },
  { id: 'a22', top: ['frizzle'],      hairColor: ['f59797'], skinColor: ['edb98a'], eyes: ['happy'],          eyebrows: ['raisedExcitedNatural'], mouth: ['tongue'],  facialHair: [],                clothing: ['graphicShirt'],    clothesColor: ['ff488e'],  clothingGraphic: ['diamond'], accessories: ['sunglasses'] },
  { id: 'a23', top: ['longButNotTooLong'], hairColor: ['ecdcbf'], skinColor: ['edb98a'], eyes: ['default'],   eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['shirtCrewNeck'],   clothesColor: ['929598'],  accessories: ['wayfarers'] },
  { id: 'a24', top: ['shaggyMullet'], hairColor: ['a55728'], skinColor: ['d08b5b'], eyes: ['default'],        eyebrows: ['upDown'],               mouth: ['smile'],   facialHair: ['beardLight'],    clothing: ['graphicShirt'],    clothesColor: ['65c9ff'],  facialHairColor: ['a55728'], clothingGraphic: ['resist'], accessories: [] },
  // Row 5+
  { id: 'a25', top: ['turban'],       hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: ['beardMajestic'], clothing: ['collarAndSweater'],clothesColor: ['e6e6e6'],  facialHairColor: ['0e0e0e'], accessories: [] },
  { id: 'a26', top: [], topProbability: 0, hairColor: ['0e0e0e'], skinColor: ['614335'], eyes: ['default'],   eyebrows: ['default'],              mouth: ['twinkle'], facialHair: ['beardLight'],    clothing: ['shirtCrewNeck'],   clothesColor: ['929598'],  facialHairColor: ['0e0e0e'], accessories: [] },
  { id: 'a27', top: ['straightAndStrand'], hairColor: ['b58143'], skinColor: ['ffdbb4'], eyes: ['default'],   eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['blazerAndShirt'],  clothesColor: ['ff5c5c'],  accessories: ['round'] },
  { id: 'a28', top: ['shortFlat'],    hairColor: ['0e0e0e'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['serious'], facialHair: ['moustacheMagnum'], clothing: ['blazerAndShirt'], clothesColor: ['262e33'],  facialHairColor: ['0e0e0e'], accessories: ['eyepatch'] },
  { id: 'a29', top: ['fro'],          hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['happy'],          eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['shirtScoopNeck'],  clothesColor: ['ffffb1'],  accessories: ['kurt'] },
  { id: 'a30', top: ['winterHat03'],  hairColor: ['724133'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],          clothesColor: ['a7ffc4'],  accessories: ['prescription01'] },
  { id: 'a31', top: ['dreads'],       hairColor: ['724133'], skinColor: ['614335'], eyes: ['default'],        eyebrows: ['defaultNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['overall'],         clothesColor: ['25557c'],  accessories: [] },
  { id: 'a32', top: ['dreads02'],     hairColor: ['0e0e0e'], skinColor: ['ae5d29'], eyes: ['squint'],         eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['graphicShirt'],    clothesColor: ['262e33'],  clothingGraphic: ['skull'], accessories: ['sunglasses'] },
  { id: 'a33', top: ['shavedSides'],  hairColor: ['ecdcbf'], skinColor: ['edb98a'], eyes: ['default'],        eyebrows: ['upDownNatural'],        mouth: ['twinkle'], facialHair: [],                clothing: ['shirtVNeck'],      clothesColor: ['262e33'],  accessories: [] },
  { id: 'a34', top: ['winterHat1'],   hairColor: ['c93305'], skinColor: ['ffdbb4'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['hoodie'],          clothesColor: ['e6e6e6'],  accessories: [] },
  { id: 'a35', top: ['shortFlat'],    hairColor: ['b58143'], skinColor: ['f8d25c'], eyes: ['default'],        eyebrows: ['default'],              mouth: ['smile'],   facialHair: [],                clothing: ['shirtCrewNeck'],   clothesColor: ['ffafb9'],  accessories: ['prescription02'] },
  { id: 'a36', top: ['frida'],        hairColor: ['4a312c'], skinColor: ['d08b5b'], eyes: ['default'],        eyebrows: ['unibrowNatural'],       mouth: ['smile'],   facialHair: [],                clothing: ['collarAndSweater'],clothesColor: ['ff5c5c'],  accessories: [] },
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
  return found ? found.style : collection.avataaars
}

/**
 * Get avatar SVG data URI. Handles all ID formats:
 *   "style:seed"  — multi-style (new)
 *   "a1"–"a36"    — legacy avataaars presets
 *   "rnd_xxx"     — legacy random avataaars seeds
 */
export function getAvatarDataUri(id) {
  if (!id) return null
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
    svg = createAvatar(styleModule, { seed }).toString()
  } else if (/^a\d+$/.test(id)) {
    // Legacy preset IDs a1–a36
    const preset = AVATAR_PRESETS.find(a => a.id === id)
    if (preset) {
      svg = createAvatar(avataaarsStyle, buildOptions(preset)).toString()
    } else {
      svg = createAvatar(avataaarsStyle, { seed: id }).toString()
    }
  } else {
    // Legacy rnd_xxx — old random avataaars seed
    svg = createAvatar(avataaarsStyle, { seed: id }).toString()
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
