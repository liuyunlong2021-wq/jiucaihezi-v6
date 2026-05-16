import { describe, expect, it } from 'vitest'
import { buildImportedTextDoc, textToTiptapDoc } from '@/utils/editorContent'

describe('editor text import safety', () => {
  it('keeps imported HTML-like content as plain text nodes', () => {
    const doc = textToTiptapDoc('<img src=x onerror=alert(1)>\n<script>alert(1)</script>')

    expect(JSON.stringify(doc)).toContain('<img src=x onerror=alert(1)>')
    expect(JSON.stringify(doc)).toContain('<script>alert(1)</script>')
    expect(JSON.stringify(doc)).not.toContain('"type":"image"')
  })

  it('builds import blocks without interpolating content into HTML', () => {
    const doc = buildImportedTextDoc({
      agentName: '<b>恶意名</b>',
      content: '<a href="javascript:alert(1)">点我</a>',
      timestamp: new Date('2026-05-14T10:00:00+08:00'),
    })

    expect(JSON.stringify(doc)).toContain('<b>恶意名</b>')
    expect(JSON.stringify(doc)).toContain('<a href=\\"javascript:alert(1)\\">点我</a>')
    expect(doc.content[0].type).toBe('horizontalRule')
    expect(doc.content[1].type).toBe('blockquote')
  })
})
