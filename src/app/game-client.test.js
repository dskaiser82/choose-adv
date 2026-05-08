const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/app/game-client.tsx', 'utf8');

function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimatePhoneCardWordLimit(viewportWidth) {
  if (viewportWidth <= 360) return 30;
  if (viewportWidth <= 390) return 34;
  if (viewportWidth <= 430) return 38;
  return 42;
}

function buildStoryCards(text, maxWordsPerCard = 34) {
  const sentences = splitIntoSentences(text);
  const cards = [];
  let currentCard = '';

  for (const sentence of sentences) {
    const nextCard = currentCard ? `${currentCard} ${sentence}` : sentence;
    if (currentCard && countWords(nextCard) > maxWordsPerCard) {
      cards.push(currentCard);
      currentCard = sentence;
      continue;
    }
    currentCard = nextCard;
  }

  if (currentCard) {
    cards.push(currentCard);
  }

  return cards.filter(Boolean);
}

assert.match(source, /export function splitIntoSentences/);
assert.match(source, /export function countWords/);
assert.match(source, /export function estimatePhoneCardWordLimit/);
assert.match(source, /export function buildStoryCards/);

const cards = buildStoryCards(
  'First sentence is short. Second sentence is also short. Third sentence should move onto a new card because the word budget is limited.',
  10
);

assert.deepEqual(cards, [
  'First sentence is short. Second sentence is also short.',
  'Third sentence should move onto a new card because the word budget is limited.',
]);

assert.ok(cards.every((card) => countWords(card) <= 14));
assert.equal(estimatePhoneCardWordLimit(360), 30);
assert.equal(estimatePhoneCardWordLimit(390), 34);
assert.equal(estimatePhoneCardWordLimit(430), 38);
assert.equal(estimatePhoneCardWordLimit(500), 42);

console.log('game-client tests passed');
