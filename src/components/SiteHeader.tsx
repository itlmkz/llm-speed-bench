import { BRAND } from '../lib/brand'

export type View = 'bench' | 'about'

export function SiteHeader({
  view,
  onView,
}: {
  view: View
  onView: (v: View) => void
}) {
  return (
    <header className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface/80 text-sm font-semibold tracking-tight text-accent shadow-sm"
          >
            MM
          </div>
          <div>
            <p className="text-sm font-medium tracking-wide text-accent uppercase">
              {BRAND.siteName}
            </p>
            <p className="text-xs text-muted">
              by {BRAND.author} · {BRAND.studio}
            </p>
          </div>
        </div>
        <nav
          role="tablist"
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface/70 p-1"
        >
          {(
            [
              { id: 'bench', label: 'Benchmark' },
              { id: 'about', label: 'About' },
            ] as { id: View; label: string }[]
          ).map((tab) => {
            const active = view === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => onView(tab.id)}
                className={
                  active
                    ? 'rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent'
                    : 'rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground'
                }
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        {BRAND.siteTagline}
      </h1>
      <p className="max-w-2xl text-base text-muted">
        Add your endpoints, pick the models, hit run. Your keys, your browser,
        no backend.
      </p>
    </header>
  )
}
