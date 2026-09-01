import { BRAND } from '../lib/brand'

export function SiteHeader() {
  return (
    <header className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface/80 text-sm font-semibold tracking-tight text-accent shadow-sm"
          >
            LC
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
        <a
          href="#about"
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          About
        </a>
      </div>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        {BRAND.siteTagline}
      </h1>
      <p className="max-w-2xl text-base text-muted">
        Add base URLs, attach model slugs, pick scenarios, then run. Compare
        providers with your own keys — static hosting only, no backend.
      </p>
    </header>
  )
}
