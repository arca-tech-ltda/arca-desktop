import type {
  FeatureWallSetupStep,
  FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import type { AgentAuthorityMode } from '../../../../shared/agent-authority'

type LocalizedFeatureWallSetupChecklistCopy = Pick<FeatureWallSetupStep, 'name' | 'description'>

const getLocalizedFeatureWallSetupChecklistCopyById = createLocalizedCatalog(
  (): Record<FeatureWallSetupStepId, LocalizedFeatureWallSetupChecklistCopy> => ({
    'two-worktrees': {
      name: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.ec0a363633',
        'Multi-task'
      ),
      description: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.62bac8f43c',
        'Work in 2 different worktrees at once. Each one is isolated (even in the same project). Perfect for working on 2 features at once.'
      )
    },
    browser: {
      name: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.908898c3ee',
        "Use ARCA's browser"
      ),
      description: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.43781563c3',
        'Browse your web app without leaving ARCA. Grab any element and send its exact source and styles to an agent with one click.'
      )
    },
    notifications: {
      name: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.29aa2c2077',
        'Turn on notifications'
      ),
      description: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.71bd9a8c95',
        'Know the moment an agent finishes, needs attention, or gets blocked.'
      )
    },
    'default-agent': {
      name: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.46db810da8',
        'Choose your default agent'
      ),
      description: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.b8e5bae17f',
        'Start new work faster with your preferred agent already selected.'
      )
    },
    'agent-capabilities': {
      name: translate('components.featureWall.setupChecklist.installCli.name', 'Install CLI'),
      description: translate(
        'components.featureWall.setupChecklist.installCli.description',
        'Register the ARCA shell command so Pi can drive the app (worktrees, terminals, built-in browser, computer use).'
      )
    },
    'task-sources': {
      name: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.ad342dd4c6',
        'Connect integrations'
      ),
      description: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.06fe30fdb0',
        'Start an agent from a task in one click and keep PR status in view.'
      )
    },
    'setup-script': {
      name: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.eddc532e58',
        'Automate workspace setup'
      ),
      description: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.56049b74c2',
        'Run install and setup commands automatically so every new worktree is ready for agents.'
      )
    },
    'add-two-repos': {
      name: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.2cf795433b',
        'Start work in multiple repos'
      ),
      description: translate(
        'auto.components.feature.wall.feature.wall.setup.checklist.localized.copy.42525ba8a4',
        'Bring your key repos into ARCA so you can start agent work without hunting for folders.'
      )
    }
  })
)

export function getLocalizedFeatureWallSetupChecklistCopy(
  step: FeatureWallSetupStep,
  authority: AgentAuthorityMode = 'pi'
): LocalizedFeatureWallSetupChecklistCopy {
  const copy = getLocalizedFeatureWallSetupChecklistCopyById()[step.id]
  // Only the CLI step names an agent, and on a partner's machine that agent is not Pi.
  if (step.id !== 'agent-capabilities' || authority === 'pi') {
    return copy
  }
  return {
    ...copy,
    description: translate(
      'components.featureWall.setupChecklist.installCli.descriptionManaged',
      'Register the ARCA shell command so Claude Code and Codex can drive the app (worktrees, terminals, built-in browser, computer use).'
    )
  }
}
