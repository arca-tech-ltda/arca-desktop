import { translate } from '@/i18n/i18n'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ARCA_PROJECT_TYPES,
  isArcaProjectType,
  validateArcaProjectSlug,
  type ArcaProjectType
} from '../../../../shared/arca-project-creation'

export type ArcaCreateProjectFormValue = {
  name: string
  type: ArcaProjectType
  title: string
  description: string
  moveToArcaRoot: boolean
  remoteName: string
}

export function arcaProjectNameError(name: string): string | undefined {
  const problem = validateArcaProjectSlug(name)
  if (!problem) {
    return undefined
  }
  if (problem === 'empty') {
    return translate('components.arcaProjects.create.nameEmpty', 'Give the project a name.')
  }
  if (problem === 'length') {
    return translate('components.arcaProjects.create.nameLength', 'Use at most 64 characters.')
  }
  return translate(
    'components.arcaProjects.create.nameCharset',
    'Use lowercase letters, numbers and single dashes, for example riva-radar-licitacoes.'
  )
}

export function ArcaCreateProjectForm({
  value,
  onChange,
  disabled,
  publishing,
  originUrl
}: {
  value: ArcaCreateProjectFormValue
  onChange: (patch: Partial<ArcaCreateProjectFormValue>) => void
  disabled: boolean
  publishing: boolean
  originUrl?: string
}): React.JSX.Element {
  const nameError = value.name ? arcaProjectNameError(value.name) : undefined
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="arca-project-name">
          {translate('components.arcaProjects.create.nameLabel', 'Name')}
        </Label>
        <Input
          id="arca-project-name"
          value={value.name}
          disabled={disabled}
          autoFocus
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {nameError ??
            translate(
              'components.arcaProjects.create.nameHint',
              'Repository name in arca-tech-ltda and folder under ~/ARCA.'
            )}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="arca-project-type">
          {translate('components.arcaProjects.create.typeLabel', 'Type')}
        </Label>
        <Select
          value={value.type}
          disabled={disabled}
          onValueChange={(next) => {
            if (isArcaProjectType(next)) {
              onChange({ type: next })
            }
          }}
        >
          <SelectTrigger id="arca-project-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARCA_PROJECT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="arca-project-title">
          {translate('components.arcaProjects.create.titleLabel', 'Catalog title (optional)')}
        </Label>
        <Input
          id="arca-project-title"
          value={value.title}
          disabled={disabled}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="arca-project-description">
          {translate('components.arcaProjects.create.descriptionLabel', 'Description')}
        </Label>
        <Textarea
          id="arca-project-description"
          value={value.description}
          disabled={disabled}
          rows={3}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </div>
      {publishing ? (
        <div className="space-y-4 rounded-lg border border-border bg-muted/25 p-3">
          {originUrl ? (
            <div className="space-y-1.5">
              <Label htmlFor="arca-project-remote">
                {translate('components.arcaProjects.create.remoteLabel', 'Remote name')}
              </Label>
              <Input
                id="arca-project-remote"
                value={value.remoteName}
                disabled={disabled}
                onChange={(event) => onChange({ remoteName: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {translate(
                  'components.arcaProjects.create.remoteHint',
                  'This folder already has an origin pointing to {{value0}}, so the ARCA remote is added under another name.',
                  { value0: originUrl }
                )}
              </p>
            </div>
          ) : null}
          <div className="flex items-start gap-2">
            <Checkbox
              id="arca-project-move"
              checked={value.moveToArcaRoot}
              disabled={disabled}
              onCheckedChange={(checked) => onChange({ moveToArcaRoot: checked === true })}
            />
            <Label htmlFor="arca-project-move">
              {translate(
                'components.arcaProjects.create.moveLabel',
                'Also move the folder to ~/ARCA/{{value0}}/{{value1}}',
                { value0: value.type, value1: value.name || '…' }
              )}
            </Label>
          </div>
        </div>
      ) : null}
    </div>
  )
}
