const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('/home/gobotmini/code/choose-adventure/src/lib/turso.ts', 'utf8');

[
  'create table if not exists campaigns',
  'create table if not exists characters',
  'create table if not exists runs',
  'create table if not exists run_state',
  'create table if not exists run_turns',
  'create table if not exists run_events',
  'create table if not exists items',
  'create table if not exists run_inventory',
  'create table if not exists run_flags',
  'create table if not exists run_discoveries',
  'create table if not exists run_team_members',
  'export async function persistTurn',
  'export async function persistDiscovery',
  'export async function persistTeamMember',
  'export async function getStoryBootstrap',
  'export async function resetStoryRun',
].forEach((needle) => assert.match(source, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));

assert.doesNotMatch(source, /localStorage/);
assert.match(source, /inventory:/);
assert.match(source, /flags:/);
assert.match(source, /discoveries:/);
assert.match(source, /teamMembers:/);
assert.match(source, /bodyState/);
assert.match(source, /mindState/);
assert.match(source, /conditions/);
assert.match(source, /applySetbackIfNeeded/);
assert.match(source, /classifySetback/);
assert.match(source, /recovering/);
assert.match(source, /item_type/);
assert.match(source, /abilities/);
assert.match(source, /parseInventoryAbilities/);
assert.match(source, /Veil Step/);
assert.match(source, /Approach to Whispering Pass/);
assert.match(source, /Oakhaven/);
assert.match(source, /Whispering Pass/);
assert.match(source, /run_turns/);
assert.match(source, /run_events/);

console.log('turso persistence checks passed');
