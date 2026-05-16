import { describe, expect, it } from 'vitest'
import { shouldRemoveFromDist } from '@/utils/distClean'

describe('dist clean policy', () => {
  it('removes secret files and local build clutter from public assets', () => {
    expect(shouldRemoveFromDist('skills/runninghub/.env')).toBe(true)
    expect(shouldRemoveFromDist('skills/.DS_Store')).toBe(true)
    expect(shouldRemoveFromDist('skills/runninghub/scripts/__pycache__/runninghub.cpython-313.pyc')).toBe(true)
  })

  it('removes shipped helper scripts but keeps browser-readable skill docs and registries', () => {
    expect(shouldRemoveFromDist('skills/runninghub/scripts/runninghub.py')).toBe(true)
    expect(shouldRemoveFromDist('skills/voice-bound-shot-video/examples/run-example.sh')).toBe(true)
    expect(shouldRemoveFromDist('skills/runninghub/SKILL.md')).toBe(false)
    expect(shouldRemoveFromDist('skills/runninghub/data/my-workflows.json')).toBe(false)
  })
})
