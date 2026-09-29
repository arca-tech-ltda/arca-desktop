import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { ArcaCreateProjectDialog } from './ArcaCreateProjectDialog'

export function ArcaCreateProjectLauncher(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-auto w-full justify-start"
        onClick={() => setOpen(true)}
      >
        <FolderPlus className="mr-2 size-4" />
        <span className="min-w-0 whitespace-normal text-left">
          {translate('components.arcaProjects.create.title', 'New ARCA project')}
        </span>
      </Button>
      <ArcaCreateProjectDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
