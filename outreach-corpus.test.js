const test = require('node:test');
const assert = require('node:assert/strict');
const corpus = require('./outreach-corpus.js');

test('learns first.last from a delivered send and suggests for a new person', () => {
  corpus.clear();
  const recorded = corpus.recordResult({ name: 'Jane Doe', email: 'jane.doe@bank.com', result: 'delivered' });
  assert.equal(recorded.pattern, '{first}.{last}');
  const suggestion = corpus.suggest('bank.com', 'Priya', 'Kulkarni');
  assert.equal(suggestion.email, 'priya.kulkarni@bank.com');
  assert.equal(suggestion.pattern, '{first}.{last}');
  assert.equal(suggestion.confidence, 100);
});

test('learns initials patterns (flast) and underscore separators', () => {
  corpus.clear();
  corpus.recordResult({ name: 'Jane Doe', email: 'jdoe@bank.com', result: 'delivered' });
  const suggestion = corpus.suggest('bank.com', 'Priya', 'Kulkarni');
  assert.equal(suggestion.email, 'pkulkarni@bank.com');

  corpus.clear();
  corpus.recordResult({ name: 'Jane Doe', email: 'jane_doe@bank.com', result: 'replied' });
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni').email, 'priya_kulkarni@bank.com');
});

test('bounced sends are recorded but never learned from', () => {
  corpus.clear();
  corpus.recordResult({ name: 'Jane Doe', email: 'jane.doe@bank.com', result: 'bounced' });
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni'), null);
  assert.equal(corpus.stats()[0].samples, 1);
});

test('zero-sample ban: no confirmed send means no suggestion', () => {
  corpus.clear();
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni'), null);
  corpus.recordResult({ name: 'Ravi Sharma', email: 'r.sharma@bank.com', result: 'delivered' });
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni').pattern, '{f}.{last}');
});

test('does not learn addresses that do not align with the name', () => {
  corpus.clear();
  corpus.recordResult({ name: 'Jane Doe', email: 'x7q9@bank.com', result: 'delivered' });
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni'), null);
});

test('refuses mixed-separator locals and suffix-style name tokens', () => {
  corpus.clear();
  corpus.recordResult({ name: 'Jane Doe', email: 'jane.doe_x@bank.com', result: 'delivered' });
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni'), null);
  corpus.clear();
  corpus.recordResult({ name: 'John Smith Jr.', email: 'john.smith@bank.com', result: 'delivered' });
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni'), null);
});

test('picks the most frequent pattern and reports confidence', () => {
  corpus.clear();
  corpus.recordResult({ name: 'Jane Doe', email: 'jane.doe@bank.com', result: 'delivered' });
  corpus.recordResult({ name: 'Ravi Sharma', email: 'ravi.sharma@bank.com', result: 'delivered' });
  corpus.recordResult({ name: 'Alia Khan', email: 'akhan@bank.com', result: 'delivered' });
  const best = corpus.bestPattern('bank.com');
  assert.equal(best.pattern, '{first}.{last}');
  assert.equal(best.count, 2);
  assert.equal(best.confidence, 67);
  assert.equal(corpus.suggest('bank.com', 'Priya', 'Kulkarni').email, 'priya.kulkarni@bank.com');
});

test('requires a full target name', () => {
  corpus.clear();
  corpus.recordResult({ name: 'Jane Doe', email: 'jane.doe@bank.com', result: 'delivered' });
  assert.equal(corpus.suggest('bank.com', 'Priya', ''), null);
});
