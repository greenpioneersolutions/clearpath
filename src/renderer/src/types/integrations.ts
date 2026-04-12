// ── Shared Integration Types ─────���───────────────────────────────────────────

/** Base status returned by integration:get-status */
export interface IntegrationStatus {
  github: GitHubStatus | null
  atlassian: AtlassianStatus | null
  servicenow: ServiceNowStatus | null
  backstage: BackstageStatus | null
  powerbi: PowerBIStatus | null
  splunk: SplunkStatus | null
  datadog: DatadogStatus | null
}

// ── GitHub ───────────────────────────────────��──────────────────────────────

export interface GitHubStatus {
  connected: boolean
  username: string
  connectedAt: number
}

// ── Atlassian (Jira + Confluence) ─────────────────────────────────────────��

export interface AtlassianStatus {
  siteUrl: string
  email: string
  displayName: string
  accountId: string
  connected: boolean
  connectedAt: number
  jiraEnabled: boolean
  confluenceEnabled: boolean
}

export interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl?: string
}

export interface JiraIssue {
  id: string
  key: string
  summary: string
  status: string
  statusCategory: string
  priority: string
  assignee: string | null
  reporter: string
  issueType: string
  created: string
  updated: string
  description?: string
  labels: string[]
  url: string
}

export interface JiraBoard {
  id: number
  name: string
  type: string // 'scrum' | 'kanban' | 'simple'
  projectKey?: string
}

export interface JiraSprint {
  id: number
  name: string
  state: string // 'active' | 'closed' | 'future'
  startDate?: string
  endDate?: string
  completeDate?: string
  goal?: string
}

export interface ConfluenceSpace {
  id: string
  key: string
  name: string
  type: string
  description?: string
  url: string
}

export interface ConfluencePage {
  id: string
  title: string
  spaceId: string
  status: string
  createdAt: string
  updatedAt: string
  authorDisplayName: string
  url: string
  excerpt?: string
}

// ── ServiceNow ───────��─────────────────────────────────────────────────────

export interface ServiceNowStatus {
  instanceUrl: string
  username: string
  displayName: string
  authMethod: 'oauth' | 'basic'
  connected: boolean
  connectedAt: number
  userSysId: string
}

export interface ServiceNowIncident {
  sysId: string
  number: string
  shortDescription: string
  description: string
  state: { value: string; display: string }
  urgency: { value: string; display: string }
  impact: { value: string; display: string }
  priority: { value: string; display: string }
  assignedTo: string
  assignmentGroup: string
  caller: string
  openedAt: string
  resolvedAt: string | null
  category: string
  subcategory: string
  url: string
}

export interface ServiceNowChangeRequest {
  sysId: string
  number: string
  shortDescription: string
  description: string
  type: string
  state: { value: string; display: string }
  risk: { value: string; display: string }
  impact: { value: string; display: string }
  assignmentGroup: string
  startDate: string | null
  endDate: string | null
  url: string
}

export interface ServiceNowKBArticle {
  sysId: string
  number: string
  shortDescription: string
  text: string
  category: string
  workflowState: string
  author: string
  url: string
}

export interface ServiceNowCMDBItem {
  sysId: string
  name: string
  className: string
  assetTag: string
  ipAddress: string
  operationalStatus: { value: string; display: string }
  installStatus: { value: string; display: string }
  url: string
}

// ── Backstage ──────��───────────────────────────────��───────────────────────

export interface BackstageStatus {
  baseUrl: string
  connected: boolean
  connectedAt: number
  capabilities: BackstageCapabilities
}

export interface BackstageCapabilities {
  catalog: boolean
  techdocs: boolean
  scaffolder: boolean
  search: boolean
  kubernetes: boolean
}

export interface BackstageEntity {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace: string
    description?: string
    annotations?: Record<string, string>
    labels?: Record<string, string>
    uid?: string
    tags?: string[]
  }
  spec?: Record<string, unknown>
  relations?: Array<{ type: string; targetRef: string }>
}

export interface BackstageSearchResult {
  type: string
  title: string
  text: string
  location: string
}

// ── Power BI ─────────��──────────────────────────���──────────────────────────

export interface PowerBIStatus {
  userPrincipalName: string
  tenantId: string
  connected: boolean
  connectedAt: number
  clientId: string
}

export interface PowerBIWorkspace {
  id: string
  name: string
  isReadOnly: boolean
  type: string
}

export interface PowerBIDataset {
  id: string
  name: string
  configuredBy: string
  isRefreshable: boolean
  createdDate: string
  webUrl?: string
}

export interface PowerBIReport {
  id: string
  name: string
  datasetId: string
  webUrl: string
  embedUrl: string
  reportType: string
}

export interface PowerBIDashboard {
  id: string
  displayName: string
  isReadOnly: boolean
  webUrl: string
  embedUrl: string
}

export interface PowerBITile {
  id: string
  title: string
  reportId?: string
  datasetId?: string
  embedUrl: string
}

export interface PowerBIRefreshEntry {
  requestId: string
  refreshType: string
  startTime: string
  endTime: string | null
  status: string
  serviceExceptionJson?: string
}

export interface PowerBIDataflow {
  id: string
  name: string
  description: string
  configuredBy: string
}

// ── Splunk ──────────────────────────────────────────────────────────────────

export interface SplunkStatus {
  hostUrl: string
  username: string
  authMethod: 'token' | 'basic'
  serverVersion: string
  connected: boolean
  connectedAt: number
}

export interface SplunkSearchResult {
  sid: string
  results: Record<string, unknown>[]
  resultCount: number
}

export interface SplunkSavedSearch {
  name: string
  search: string
  description: string
  isScheduled: boolean
  nextScheduledTime: string | null
  disabled: boolean
}

export interface SplunkIndex {
  name: string
  currentDBSizeMB: number
  totalEventCount: string
  minTime: string
  maxTime: string
  disabled: boolean
}

export interface SplunkAlert {
  name: string
  severity: string
  triggeredCount: number
  triggeredAt: string
}

export interface SplunkDashboard {
  name: string
  label: string
  app: string
  owner: string
  isDashboard: boolean
}

// ── Datadog ────────────────────────────────────────────────────────────────

export interface DatadogStatus {
  site: string
  apiUrl: string
  connected: boolean
  connectedAt: number
}

export interface DatadogMonitor {
  id: number
  name: string
  type: string
  query: string
  message: string
  overallState: string // 'OK' | 'Alert' | 'Warn' | 'No Data'
  tags: string[]
  created: string
  modified: string
}

export interface DatadogDashboard {
  id: string
  title: string
  description: string
  authorHandle: string
  url: string
  createdAt: string
  modifiedAt: string
}

export interface DatadogEvent {
  id: number
  title: string
  text: string
  dateHappened: number
  priority: string
  source: string
  tags: string[]
  alertType: string
}

export interface DatadogIncident {
  id: string
  title: string
  severity: string
  status: string
  created: string
  resolved: string | null
}

export interface DatadogSLO {
  id: string
  name: string
  type: string
  tags: string[]
  overallStatus: number[]
  thresholds: Array<{ timeframe: string; target: number }>
}

export interface DatadogHost {
  hostName: string
  up: boolean
  isMuted: boolean
  apps: string[]
  platform: string
  tags: string[]
}

// ── Custom Integration ──────────────────────────────────────────────────────

export interface CustomIntegration {
  id: string
  name: string
  baseUrl: string
  authType: 'none' | 'api-key' | 'bearer' | 'basic' | 'oauth2-client-creds' | 'custom-header'
  auth: {
    apiKeyHeader?: string
    apiKeyLocation?: 'header' | 'query'
    basicUsername?: string
    oauth2TokenUrl?: string
    oauth2ClientId?: string
    oauth2Scopes?: string
    customHeaderName?: string
    tokenEnvVar?: string
  }
  endpoints: CustomEndpoint[]
  enabled: boolean
  createdAt: number
  lastTestedAt?: number
  lastTestSuccess?: boolean
  responseMapping?: {
    titleField?: string
    descriptionField?: string
    statusField?: string
    urlField?: string
  }
}

export interface CustomEndpoint {
  id: string
  label: string
  path: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  pagination?: {
    type: 'offset' | 'cursor' | 'page' | 'none'
    pageParam?: string
    limitParam?: string
    defaultLimit?: number
  }
}

// ── Environment Variables (Dynamic) ────────────────────────────────────────

export interface EnvVarEntry {
  key: string
  isSensitive: boolean
  scope: 'global' | 'copilot' | 'claude' | 'local'
  description?: string
  createdAt: number
  updatedAt: number
  isBuiltIn: boolean
}

export interface EnvVarInfo {
  key: string
  value: string
  isSet: boolean
  isSensitive: boolean
  scope: 'global' | 'copilot' | 'claude' | 'local'
  description?: string
  isBuiltIn: boolean
}
