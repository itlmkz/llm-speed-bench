import { Card } from '@heroui/react'
import { ABOUT, BRAND } from '../lib/brand'

export function AboutSection() {
  return (
    <Card id="about" className="scroll-mt-6">
      <Card.Header>
        <Card.Title>{ABOUT.headline}</Card.Title>
        <Card.Description>
          Why {BRAND.siteName} exists — from {BRAND.author} at {BRAND.studio}
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex max-w-3xl flex-col gap-4 text-base leading-relaxed text-muted">
        {ABOUT.paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
        <p className="pt-1 font-medium text-foreground">{ABOUT.signature}</p>
        <p className="text-sm">
          <a
            href={BRAND.siteUrl}
            className="text-accent underline-offset-4 hover:underline"
          >
            {BRAND.siteUrl.replace('https://', '')}
          </a>
          {' · '}
          <a
            href={BRAND.githubRepo}
            className="text-accent underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
        </p>
      </Card.Content>
    </Card>
  )
}
