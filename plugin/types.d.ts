// 前后端共享的数据契约（手写维护，与 server/src/models.rs 保持一致）。
// 供编辑器/后续接入 tsc --noEmit 使用；改 Rust 结构时同步改这里。
import type { REQUIREMENT_STATUSES, DESIGN_STATUSES, DEV_TASK_STATUSES } from './lib/enums.js'

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]
export type DesignStatus = (typeof DESIGN_STATUSES)[number]
export type DevTaskStatus = (typeof DEV_TASK_STATUSES)[number]

export interface RequirementDocument {
  summary: string
  acceptanceCriteria: string
  body: string
  updatedAt?: string | null
  updatedBy?: string | null
  version: number
}

export interface DevTask {
  id: string
  platformId: string
  assigneeId?: string | null
  status: DevTaskStatus | string
  startedAt?: string | null
  finishedAt?: string | null
  estimateDays?: number | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  dependsOn: string[]
  actualDays?: number | null
  blockedReason?: string | null
  branch?: string | null
  mrUrl?: string | null
  pipelineStatus?: string | null
  pipelineUrl?: string | null
  note: string
}

export interface Requirement {
  id: string
  code: string
  title: string
  iterationId: string
  status: RequirementStatus | string
  designStatus: DesignStatus | string
  platformIds: string[]
  ownerId: string
  designerId?: string | null
  testerId?: string | null
  inScope: boolean
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  devTasks: DevTask[]
  document: RequirementDocument
  versions: Array<{ version: number; summary: string; at: string; by: string }>
}

export interface Skill {
  id: string
  name: string
  description: string
  rolePacks: string[]
  scope: 'global' | 'personal' | string
  status: string
  usageCount: number
  disabledProjects: string[]
}

export interface Notification {
  id: number
  userId: string
  at: string
  type: string
  requirementId?: string | null
  title: string
  body: string
  read: boolean
}
