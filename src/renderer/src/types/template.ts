// Templates types now live in src/shared so main + renderer share one
// definition (virtually merged via tsconfig `rootDirs`). Re-exported here so
// existing renderer imports (`../types/template`) keep resolving.
export type {
  PromptTemplate,
  TemplateUsageStat,
  TemplateVariable,
  VariableType,
  TemplatePatch,
  HydratedTemplate,
  TemplateCategory,
} from '../../../shared/templates/types'

export {
  TEMPLATE_CATEGORIES,
  VARIABLE_TYPES,
  CONFIG_VARIABLE_TYPES,
  LAUNCH_ONLY_VARIABLE_TYPES,
  MULTI_CAPABLE_VARIABLE_TYPES,
  isConfigVariable,
  isLaunchOnlyVariable,
} from '../../../shared/templates/types'
