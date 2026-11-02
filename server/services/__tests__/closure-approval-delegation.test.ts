import test from 'node:test';
import assert from 'node:assert/strict';
import {delegatedSupervisorsForProject} from '../closure-approval-delegation.js';

test('delegation is disabled when no setting exists', () => {
  assert.deepEqual([...delegatedSupervisorsForProject(['a', 'b'], [], 'project-1')], []);
});

test('delegation applies only to the selected project and candidate supervisors', () => {
  const settings = [
    {key: 'supervisor_closure_delegation:a', value: {projects: {'project-1': true}}},
    {key: 'supervisor_closure_delegation:b', value: {projects: {'project-2': true}}},
    {key: 'supervisor_closure_delegation:outsider', value: {projects: {'project-1': true}}},
  ];
  assert.deepEqual(
    [...delegatedSupervisorsForProject(['a', 'b'], settings, 'project-1')],
    ['a'],
  );
  assert.deepEqual(
    [...delegatedSupervisorsForProject(['a', 'b'], settings, 'project-2')],
    ['b'],
  );
});

test('false and malformed settings never enable delegation', () => {
  const settings = [
    {key: 'supervisor_closure_delegation:a', value: {projects: {'project-1': false}}},
    {key: 'supervisor_closure_delegation:b', value: {projects: null}},
  ];
  assert.deepEqual([...delegatedSupervisorsForProject(['a', 'b'], settings, 'project-1')], []);
});
