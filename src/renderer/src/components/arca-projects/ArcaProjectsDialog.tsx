import { useState } from 'react'
import { FolderGit2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { ArcaProjectsPanel } from './ArcaProjectsPanel'

export function ArcaProjectsDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start">
          <FolderGit2 className="mr-2 size-4" />
          {translate('components.arcaProjects.title', 'ARCA Projects')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{translate('components.arcaProjects.title', 'ARCA Projects')}</DialogTitle>
        </DialogHeader>
        <ArcaProjectsPanel onAdded={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
