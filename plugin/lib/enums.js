// 前后端共享的状态枚举单一来源（与 server/src/models.rs 的常量保持一致）。
// 改这里时务必同步改 Rust 侧常量；bff-unit 测试会校验每个状态都有中文文案，
// 防止新增状态后前端/工具回执里冒出英文原值。
export const REQUIREMENT_STATUSES = [
  'draft',
  'creating',
  'create_failed',
  'pending_review',
  'changes_requested',
  'approved',
  'scheduled',
  'backlog',
  'in_progress',
  'dev_done',
  'testing',
  'test_failed',
  'test_passed',
  'frozen',
  'released',
  'done',
  'cancelled',
]

export const DESIGN_STATUSES = [
  'not_needed',
  'unclaimed',
  'designing',
  'delivered',
  'changes_requested',
]

export const DEV_TASK_STATUSES = ['unassigned', 'assigned', 'in_progress', 'done']
