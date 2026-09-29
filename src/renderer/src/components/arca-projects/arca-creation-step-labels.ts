import { translate } from '@/i18n/i18n'
import type { ArcaCreationStepId } from '../../../../shared/arca-project-creation'

export function arcaCreationStepLabel(id: ArcaCreationStepId, publishing: boolean): string {
  switch (id) {
    case 'createRepo':
      return translate(
        'components.arcaProjects.create.stepCreateRepo',
        'Create the private repository on GitHub'
      )
    case 'seedRepo':
      return publishing
        ? translate(
            'components.arcaProjects.create.stepPublishFolder',
            'Commit the folder and push it'
          )
        : translate(
            'components.arcaProjects.create.stepSeedRepo',
            'Clone it and add README.md and STATUS.md'
          )
    case 'register':
      return translate('components.arcaProjects.create.stepRegister', 'Add the project to the app')
    case 'catalogPr':
      return translate(
        'components.arcaProjects.create.stepCatalogPr',
        'Open the catalog pull request on arca'
      )
    case 'mainframe':
      return translate(
        'components.arcaProjects.create.stepMainframe',
        'Register it on the Mainframe'
      )
  }
}
