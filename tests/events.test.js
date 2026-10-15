import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLeave, applyRegistration, validateEventSchedule } from '../src/features/events.js';

function eventWith(capacity = 2) {
  return { status: 'open', capacity, attendees: [], waitlist: [], checkedIn: [] };
}

test('validateEventSchedule accepts a real calendar date and 24-hour time', () => {
  assert.deepEqual(validateEventSchedule('2026-11-03', '19:30'), {
    date: '2026-11-03',
    time: '19:30',
    sortKey: '2026-11-03T19:30:00',
  });
  assert.equal(validateEventSchedule('2026-02-30', '19:30'), null);
  assert.equal(validateEventSchedule('03/11/2026', '7:30'), null);
});

test('a full event sends later members to the waitlist and promotes them on leave', () => {
  const event = eventWith(1);
  assert.equal(applyRegistration(event, 'member-a').result, 'confirmed');
  assert.equal(applyRegistration(event, 'member-b').result, 'waitlisted');
  assert.deepEqual(event.attendees, ['member-a']);
  assert.deepEqual(event.waitlist, ['member-b']);

  const result = applyLeave(event, 'member-a');
  assert.equal(result.promotedUserId, 'member-b');
  assert.deepEqual(event.attendees, ['member-b']);
  assert.deepEqual(event.waitlist, []);
});
