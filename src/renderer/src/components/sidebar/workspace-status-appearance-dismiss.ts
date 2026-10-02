/** The status appearance popover portals out of the menu, so its clicks read as
 *  outside interactions that would otherwise dismiss the editor behind it. */
export function keepMenuOpenForStatusAppearancePopover(event: Event): void {
  const target = event.target
  if (target instanceof Element && target.closest('[data-workspace-status-appearance-popover]')) {
    event.preventDefault()
  }
}
