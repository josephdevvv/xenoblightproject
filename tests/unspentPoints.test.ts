import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassiveTreeService } from '../src/passives/PassiveTreeService';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { StatAllocationDraft } from '../src/status/StatAllocation';
import { MAIN_STATS } from '../src/status/StatTypes';
import { unspentPoints } from '../src/ui/hud/UnspentPoints';
import { newCharacter, saveAndLoad, withoutStorage } from './helpers/session';

test('Status pip: on while stat points > 0 - after a level-up, after loading; off once every point is spent', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    assert.equal(unspentPoints(c).status, false, 'a new character has no stat points');
    CharacterStatusService.gainExp(c, 80);
    assert.deepEqual([c.status.level, c.status.statPoints, unspentPoints(c).status], [2, 3, true], 'level-up');
    assert.equal(unspentPoints(saveAndLoad(c)).status, true, 'a loaded save shows it');
    const before = JSON.stringify(c.status.base);
    for (let left = 3; left > 0; left--) {
      const draft = new StatAllocationDraft(c.status);
      draft.add(MAIN_STATS[left]);
      assert.equal(unspentPoints(c).status, true, 'a selected, unconfirmed point is not spent');
      assert.equal(CharacterStatusService.confirmAllocation(c, draft), null);
      assert.equal(unspentPoints(c).status, left - 1 > 0, `${left - 1} left`);
    }
    assert.notEqual(JSON.stringify(c.status.base), before);
    assert.equal(unspentPoints(saveAndLoad(c)).status, false);
  });
});

test('Passive pip keeps its own rule (passive points), independent of stat points', () => {
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    const passive = unspentPoints(c).passive;
    assert.equal(passive, true, 'the first passive point is waiting');
    assert.equal(PassiveTreeService.upgrade(c, 'drifters_resolve'), null);
    assert.deepEqual(unspentPoints(c), { status: false, passive: false });
    CharacterStatusService.gainExp(c, 80);
    assert.deepEqual(unspentPoints(c), { status: true, passive: true }, 'a level-up brings both kinds of points');
  });
});
