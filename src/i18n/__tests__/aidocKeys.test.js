import { expect, it } from 'vitest'
import { en, zh } from '../index'

it('provides the same AI Doc strings and interpolation fields in both languages', () => {
  expect(Object.keys(zh.aidoc).sort()).toEqual(Object.keys(en.aidoc).sort())
  for (const [key, message] of Object.entries(en.aidoc)) {
    expect(zh.aidoc[key].trim()).not.toBe('')
    expect(zh.aidoc[key].match(/\{\w+\}/g)?.sort()).toEqual(message.match(/\{\w+\}/g)?.sort())
  }
})
