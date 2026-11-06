import { expect, test } from 'bun:test'

import { answerOf } from './question-card'

const q = (multiSelect: boolean) => ({ header: '', multiSelect, options: [], question: 'Q?' })

test('one choice: the typed answer wins over the option', () => {
  expect(answerOf(q(false), ['Apple'], '')).toBe('Apple')
  expect(answerOf(q(false), [], '  Kiwi ')).toBe('Kiwi')
  expect(answerOf(q(false), [], '')).toBe('')
})

test('several choices: the labels, then what was typed, joined by ", "', () => {
  expect(answerOf(q(true), ['Apple', 'Pear'], 'Kiwi')).toBe('Apple, Pear, Kiwi')
  expect(answerOf(q(true), [], '')).toBe('')
})
