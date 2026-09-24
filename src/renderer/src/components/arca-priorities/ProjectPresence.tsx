type ProjectPresenceProps = {
  agents: Record<string, unknown>[]
  projectId: string
  repoKey?: string | null
}

function nameOf(agent: Record<string, unknown>): string {
  const value = agent.name ?? agent.label ?? agent.actor_name
  return typeof value === 'string' ? value : ''
}

export function ProjectPresence({
  agents,
  projectId,
  repoKey
}: ProjectPresenceProps): React.JSX.Element | null {
  const present = agents.filter((agent) =>
    [agent.project_id, agent.repo_key].some(
      (value) => typeof value === 'string' && [projectId, repoKey].includes(value)
    )
  )
  if (present.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {present.map((agent) => {
        const name = nameOf(agent)
        return name ? (
          <span
            key={String(agent.id ?? name)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-muted font-medium text-foreground">
              {name.slice(0, 1).toUpperCase()}
            </span>
            {name}
          </span>
        ) : null
      })}
    </div>
  )
}
