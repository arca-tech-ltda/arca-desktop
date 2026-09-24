export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6
export type StepId =
  | 'agent'
  | 'arca_projects'
  | 'theme'
  | 'integrations'
  | 'windows_terminal'
  | 'notifications'

export const STEPS: readonly {
  id: StepId
  stepNumber: StepNumber
  valueKind: StepId
}[] = [
  { id: 'agent', stepNumber: 1, valueKind: 'agent' },
  { id: 'arca_projects', stepNumber: 2, valueKind: 'arca_projects' },
  { id: 'theme', stepNumber: 3, valueKind: 'theme' },
  { id: 'integrations', stepNumber: 4, valueKind: 'integrations' },
  { id: 'windows_terminal', stepNumber: 5, valueKind: 'windows_terminal' },
  { id: 'notifications', stepNumber: 6, valueKind: 'notifications' }
]
