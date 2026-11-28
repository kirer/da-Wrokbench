#!/usr/bin/env node
// BFF 纯函数单元测试：覆盖状态/动作/设计状态的文案映射，避免术语前后端漂移。
// 运行：node --test tests/bff-unit.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  actionLabel,
  statusLabel,
  designStatusLabel,
  devTaskStatusLabel,
  experienceQuery,
} from '../plugin/lib/format.js'
import { REQUIREMENT_STATUSES, DESIGN_STATUSES, DEV_TASK_STATUSES } from '../plugin/lib/enums.js'

test('actionLabel：新增终态动作有中文文案', () => {
  assert.equal(actionLabel('complete'), '完成验收')
  assert.equal(actionLabel('cancel'), '取消需求')
  assert.equal(actionLabel('release'), '发布')
  assert.equal(actionLabel('freeze'), '冻结')
  // 未知动作原样返回，不能变成 undefined
  assert.equal(actionLabel('unknown-action'), 'unknown-action')
})

test('statusLabel：覆盖全部状态，包括取消与完成', () => {
  assert.equal(statusLabel('released'), '已发布')
  assert.equal(statusLabel('done'), '已完成')
  assert.equal(statusLabel('cancelled'), '已取消')
  assert.equal(statusLabel('in_progress'), '开发中')
  // 未知状态回退为原值
  assert.equal(statusLabel('weird'), 'weird')
})

test('designStatusLabel / devTaskStatusLabel：未知值回退', () => {
  assert.equal(designStatusLabel('__x__'), '__x__')
  assert.equal(devTaskStatusLabel('__x__'), '__x__')
})

test('experienceQuery：拼接标题与文档并截断', () => {
  const text = experienceQuery({ title: '会员改版', document: { summary: '积分', body: '兑换' } })
  assert.equal(text, '会员改版\n积分\n兑换')
  assert.equal(experienceQuery({}), '')
})

test('所有状态枚举都有中文文案（防止新增状态漏配）', () => {
  for (const status of REQUIREMENT_STATUSES) {
    assert.notEqual(statusLabel(status), status, `需求状态 ${status} 缺少中文文案`)
  }
  for (const status of DESIGN_STATUSES) {
    assert.notEqual(designStatusLabel(status), status, `设计状态 ${status} 缺少中文文案`)
  }
  for (const status of DEV_TASK_STATUSES) {
    assert.notEqual(devTaskStatusLabel(status), status, `开发任务状态 ${status} 缺少中文文案`)
  }
})
