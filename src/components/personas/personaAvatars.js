/**
 * Pre-built DiceBear avataaars configurations for persona selection.
 * Uses @dicebear/avataaars to generate SVG avatars at build time.
 *
 * The persona.avatar field stores the avatar `id` string.
 * Use getAvatarSvg(id) to get a data URI for an <img> tag.
 */
import { createAvatar } from '@dicebear/core'
import * as avataaarsStyle from '@dicebear/avataaars'

const AVATAR_PRESETS = [
  // ── Row 1: Short hair, diverse skin tones ───────────────────────────────
  {
    id: 'a1',
    top: ['shortFlat'],
    hairColor: ['0e0e0e'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['shirtCrewNeck'],
    clothesColor: ['3c4f5c'],
    accessories: [],
  },
  {
    id: 'a2',
    top: ['shortWaved'],
    hairColor: ['724133'],
    skinColor: ['d08b5b'],
    eyes: ['happy'],
    eyebrows: ['defaultNatural'],
    mouth: ['twinkle'],
    facialHair: [],
    clothing: ['hoodie'],
    clothesColor: ['65c9ff'],
    accessories: [],
  },
  {
    id: 'a3',
    top: ['shortCurly'],
    hairColor: ['0e0e0e'],
    skinColor: ['ae5d29'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['blazerAndShirt'],
    clothesColor: ['262e33'],
    accessories: [],
  },
  {
    id: 'a4',
    top: ['shortRound'],
    hairColor: ['b58143'],
    skinColor: ['ffdbb4'],
    eyes: ['default'],
    eyebrows: ['raisedExcited'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['shirtVNeck'],
    clothesColor: ['929598'],
    accessories: [],
  },
  {
    id: 'a5',
    top: ['dreads01'],
    hairColor: ['0e0e0e'],
    skinColor: ['614335'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['twinkle'],
    facialHair: [],
    clothing: ['collarAndSweater'],
    clothesColor: ['e6e6e6'],
    accessories: [],
  },
  {
    id: 'a6',
    top: ['shortFlat'],
    hairColor: ['4a312c'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: ['beardLight'],
    facialHairColor: ['4a312c'],
    clothing: ['shirtCrewNeck'],
    clothesColor: ['b1e2ff'],
    accessories: [],
  },

  // ── Row 2: Long hair styles ─────────────────────────────────────────────
  {
    id: 'a7',
    top: ['straight01'],
    hairColor: ['0e0e0e'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['blazerAndSweater'],
    clothesColor: ['ff5c5c'],
    accessories: [],
  },
  {
    id: 'a8',
    top: ['bob'],
    hairColor: ['4a312c'],
    skinColor: ['d08b5b'],
    eyes: ['happy'],
    eyebrows: ['default'],
    mouth: ['twinkle'],
    facialHair: [],
    clothing: ['shirtScoopNeck'],
    clothesColor: ['ffafb9'],
    accessories: [],
  },
  {
    id: 'a9',
    top: ['curly'],
    hairColor: ['a55728'],
    skinColor: ['ffdbb4'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['hoodie'],
    clothesColor: ['ffd5dc'],
    accessories: [],
  },
  {
    id: 'a10',
    top: ['fro'],
    hairColor: ['0e0e0e'],
    skinColor: ['614335'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['shirtCrewNeck'],
    clothesColor: ['ff488e'],
    accessories: ['round'],
  },
  {
    id: 'a11',
    top: ['straight02'],
    hairColor: ['b58143'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['raisedExcitedNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['blazerAndShirt'],
    clothesColor: ['25557c'],
    accessories: [],
  },
  {
    id: 'a12',
    top: ['curvy'],
    hairColor: ['c93305'],
    skinColor: ['ffdbb4'],
    eyes: ['happy'],
    eyebrows: ['defaultNatural'],
    mouth: ['twinkle'],
    facialHair: [],
    clothing: ['shirtVNeck'],
    clothesColor: ['a7ffc4'],
    accessories: [],
  },

  // ── Row 3: Professional / Formal ────────────────────────────────────────
  {
    id: 'a13',
    top: ['shortFlat'],
    hairColor: ['0e0e0e'],
    skinColor: ['d08b5b'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['serious'],
    facialHair: [],
    clothing: ['blazerAndShirt'],
    clothesColor: ['262e33'],
    accessories: ['prescription02'],
  },
  {
    id: 'a14',
    top: ['bun'],
    hairColor: ['4a312c'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['blazerAndSweater'],
    clothesColor: ['929598'],
    accessories: [],
  },
  {
    id: 'a15',
    top: ['shortFlat'],
    hairColor: ['c0c0c0'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: ['beardMedium'],
    facialHairColor: ['c0c0c0'],
    clothing: ['blazerAndShirt'],
    clothesColor: ['929598'],
    accessories: ['prescription01'],
  },
  {
    id: 'a16',
    top: ['longButNotTooLong'],
    hairColor: ['0e0e0e'],
    skinColor: ['ffdbb4'],
    eyes: ['default'],
    eyebrows: ['flatNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['collarAndSweater'],
    clothesColor: ['262e33'],
    accessories: [],
  },
  {
    id: 'a17',
    top: ['shortFlat'],
    hairColor: ['724133'],
    skinColor: ['ae5d29'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['twinkle'],
    facialHair: ['moustacheFancy'],
    facialHairColor: ['724133'],
    clothing: ['blazerAndSweater'],
    clothesColor: ['25557c'],
    accessories: [],
  },
  {
    id: 'a18',
    top: ['hijab'],
    hairColor: ['0e0e0e'],
    skinColor: ['d08b5b'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['collarAndSweater'],
    clothesColor: ['b1e2ff'],
    accessories: [],
  },

  // ── Row 4: Fun / Casual ─────────────────────────────────────────────────
  {
    id: 'a19',
    top: ['froBand'],
    hairColor: ['0e0e0e'],
    skinColor: ['614335'],
    eyes: ['wink'],
    eyebrows: ['raisedExcited'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['overall'],
    clothesColor: ['25557c'],
    accessories: [],
  },
  {
    id: 'a20',
    top: ['hat'],
    hairColor: ['724133'],
    skinColor: ['edb98a'],
    eyes: ['happy'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['hoodie'],
    clothesColor: ['ff5c5c'],
    accessories: [],
  },
  {
    id: 'a21',
    top: ['winterHat02'],
    hairColor: ['b58143'],
    skinColor: ['ffdbb4'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['hoodie'],
    clothesColor: ['b1e2ff'],
    accessories: [],
  },
  {
    id: 'a22',
    top: ['frizzle'],
    hairColor: ['f59797'],
    skinColor: ['edb98a'],
    eyes: ['happy'],
    eyebrows: ['raisedExcitedNatural'],
    mouth: ['tongue'],
    facialHair: [],
    clothing: ['graphicShirt'],
    clothesColor: ['ff488e'],
    clothingGraphic: ['diamond'],
    accessories: ['sunglasses'],
  },
  {
    id: 'a23',
    top: ['longButNotTooLong'],
    hairColor: ['ecdcbf'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['shirtCrewNeck'],
    clothesColor: ['929598'],
    accessories: ['wayfarers'],
  },
  {
    id: 'a24',
    top: ['shaggyMullet'],
    hairColor: ['a55728'],
    skinColor: ['d08b5b'],
    eyes: ['default'],
    eyebrows: ['upDown'],
    mouth: ['smile'],
    facialHair: ['beardLight'],
    facialHairColor: ['a55728'],
    clothing: ['graphicShirt'],
    clothesColor: ['65c9ff'],
    clothingGraphic: ['resist'],
    accessories: [],
  },

  // ── Row 5: More diversity ───────────────────────────────────────────────
  {
    id: 'a25',
    top: ['turban'],
    hairColor: ['0e0e0e'],
    skinColor: ['ae5d29'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: ['beardMajestic'],
    facialHairColor: ['0e0e0e'],
    clothing: ['collarAndSweater'],
    clothesColor: ['e6e6e6'],
    accessories: [],
  },
  {
    id: 'a26',
    top: [],
    topProbability: 0,
    hairColor: ['0e0e0e'],
    skinColor: ['614335'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['twinkle'],
    facialHair: ['beardLight'],
    facialHairColor: ['0e0e0e'],
    clothing: ['shirtCrewNeck'],
    clothesColor: ['929598'],
    accessories: [],
  },
  {
    id: 'a27',
    top: ['straightAndStrand'],
    hairColor: ['b58143'],
    skinColor: ['ffdbb4'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['blazerAndShirt'],
    clothesColor: ['ff5c5c'],
    accessories: ['round'],
  },
  {
    id: 'a28',
    top: ['shortFlat'],
    hairColor: ['0e0e0e'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['serious'],
    facialHair: ['moustacheMagnum'],
    facialHairColor: ['0e0e0e'],
    clothing: ['blazerAndShirt'],
    clothesColor: ['262e33'],
    accessories: ['eyepatch'],
  },
  {
    id: 'a29',
    top: ['fro'],
    hairColor: ['0e0e0e'],
    skinColor: ['ae5d29'],
    eyes: ['happy'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['shirtScoopNeck'],
    clothesColor: ['ffffb1'],
    accessories: ['kurt'],
  },
  {
    id: 'a30',
    top: ['winterHat03'],
    hairColor: ['724133'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['hoodie'],
    clothesColor: ['a7ffc4'],
    accessories: ['prescription01'],
  },

  // ── Row 6: More casual/creative ─────────────────────────────────────────
  {
    id: 'a31',
    top: ['dreads'],
    hairColor: ['724133'],
    skinColor: ['614335'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['overall'],
    clothesColor: ['25557c'],
    accessories: [],
  },
  {
    id: 'a32',
    top: ['dreads02'],
    hairColor: ['0e0e0e'],
    skinColor: ['ae5d29'],
    eyes: ['squint'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['graphicShirt'],
    clothesColor: ['262e33'],
    clothingGraphic: ['skull'],
    accessories: ['sunglasses'],
  },
  {
    id: 'a33',
    top: ['shavedSides'],
    hairColor: ['ecdcbf'],
    skinColor: ['edb98a'],
    eyes: ['default'],
    eyebrows: ['upDownNatural'],
    mouth: ['twinkle'],
    facialHair: [],
    clothing: ['shirtVNeck'],
    clothesColor: ['262e33'],
    accessories: [],
  },
  {
    id: 'a34',
    top: ['winterHat1'],
    hairColor: ['c93305'],
    skinColor: ['ffdbb4'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['hoodie'],
    clothesColor: ['e6e6e6'],
    accessories: [],
  },
  {
    id: 'a35',
    top: ['shortFlat'],
    hairColor: ['b58143'],
    skinColor: ['f8d25c'],
    eyes: ['default'],
    eyebrows: ['default'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['shirtCrewNeck'],
    clothesColor: ['ffafb9'],
    accessories: ['prescription02'],
  },
  {
    id: 'a36',
    top: ['frida'],
    hairColor: ['4a312c'],
    skinColor: ['d08b5b'],
    eyes: ['default'],
    eyebrows: ['unibrowNatural'],
    mouth: ['smile'],
    facialHair: [],
    clothing: ['collarAndSweater'],
    clothesColor: ['ff5c5c'],
    accessories: [],
  },
]

// ── SVG cache ─────────────────────────────────────────────────────────────
const svgCache = new Map()

/** Build DiceBear options from a preset */
function buildOptions(preset) {
  const opts = {}
  for (const [key, val] of Object.entries(preset)) {
    if (key === 'id') continue
    opts[key] = val
  }
  // Disable probability on facial hair when explicitly set
  if (preset.facialHair && preset.facialHair.length > 0) {
    opts.facialHairProbability = 100
  }
  if (preset.accessories && preset.accessories.length > 0) {
    opts.accessoriesProbability = 100
  }
  return opts
}

/** Get raw SVG string for an avatar preset */
function generateSvg(preset) {
  const opts = buildOptions(preset)
  const avatar = createAvatar(avataaarsStyle, opts)
  return avatar.toString()
}

/** Generate an SVG data URI from a DiceBear seed string */
function generateSvgFromSeed(seed) {
  const avatar = createAvatar(avataaarsStyle, { seed })
  return avatar.toString()
}

/** Convert raw SVG string to a data URI */
function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Get avatar SVG as a data URI (for use in <img src>).
 * Supports both preset IDs (a1-a36) and seed-based IDs (rnd_xxx).
 */
export function getAvatarDataUri(id) {
  if (!id) return null
  if (svgCache.has(id)) return svgCache.get(id)

  const preset = AVATAR_PRESETS.find(a => a.id === id)
  let svg
  if (preset) {
    svg = generateSvg(preset)
  } else {
    // Treat the id as a DiceBear seed (for randomly generated avatars)
    svg = generateSvgFromSeed(id)
  }

  const dataUri = svgToDataUri(svg)
  svgCache.set(id, dataUri)
  return dataUri
}

/** Get raw SVG string for an avatar */
export function getAvatarSvg(id) {
  const preset = AVATAR_PRESETS.find(a => a.id === id)
  if (!preset) {
    if (!id) return null
    return generateSvgFromSeed(id)
  }
  return generateSvg(preset)
}

/** Get avatar config by id (for backwards compat) */
export function getAvatarConfig(id) {
  return AVATAR_PRESETS.find(a => a.id === id) || null
}

/**
 * Generate a batch of random avatars using DiceBear seeds.
 * Returns array of { id: string } objects where id is a random seed.
 * These IDs work with getAvatarDataUri() for rendering.
 */
export function generateRandomBatch(count = 36) {
  const batch = []
  const timestamp = Date.now()
  for (let i = 0; i < count; i++) {
    const id = `rnd_${timestamp}_${i}_${Math.random().toString(36).slice(2, 8)}`
    batch.push({ id })
  }
  return batch
}

export const PERSONA_AVATARS = AVATAR_PRESETS
