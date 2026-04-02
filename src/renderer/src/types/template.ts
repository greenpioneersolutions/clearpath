export interface PromptTemplate {
  id: string
  name: string
  category: string
  description: string
  body: string
  recommendedModel?: string
  recommendedPermissionMode?: string
  complexity: 'low' | 'medium' | 'high'
  variables: string[]
  source: 'builtin' | 'user'
  folder?: string
  usageCount: number
  totalCost: number
  lastUsedAt?: number
  createdAt: number
}

export interface TemplateUsageStat {
  templateId: string
  name: string
  category: string
  usageCount: number
  avgCost: number
  totalCost: number
  lastUsedAt?: number
}

export const TEMPLATE_CATEGORIES = [
  'Code Review',
  'Bug Fix',
  'Refactor',
  'Testing',
  'Documentation',
  'Architecture',
  'Security Audit',
  'Performance Optimization',
  'Migration',
  'Git Workflow',
  'PR Creation',
  'Dependency Update',
  'Custom',
] as const

export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number]
