import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { homedir } from 'os'
import {
  assertPathWithinRoots,
  getMemoryAllowedRoots,
  isSensitiveSystemPath,
} from './pathSecurity'

describe('pathSecurity', () => {
  describe('assertPathWithinRoots', () => {
    it('allows a path that is within an allowed root', () => {
      const root = resolve(homedir(), 'projects')
      const filePath = resolve(root, 'my-app', 'src', 'index.ts')
      // Should not throw and should return the resolved path
      const result = assertPathWithinRoots(filePath, [root])
      expect(result).toContain('projects')
    })

    it('allows a path that is exactly equal to an allowed root', () => {
      const root = resolve(homedir(), 'projects')
      const result = assertPathWithinRoots(root, [root])
      expect(result).toBe(resolve(root))
    })

    it('throws for a path outside all allowed roots', () => {
      const allowedRoots = [resolve(homedir(), 'projects')]
      const outsidePath = '/tmp/evil/file.txt'
      expect(() => assertPathWithinRoots(outsidePath, allowedRoots)).toThrow(
        'Path not allowed',
      )
    })

    it('throws for directory traversal attempts', () => {
      const root = resolve(homedir(), 'projects')
      const traversalPath = resolve(root, '..', '..', 'etc', 'passwd')
      expect(() => assertPathWithinRoots(traversalPath, [root])).toThrow(
        'Path not allowed',
      )
    })

    it('checks multiple allowed roots', () => {
      const root1 = resolve(homedir(), '.claude')
      const root2 = resolve(homedir(), '.copilot')
      const filePath = resolve(root2, 'config.json')
      const result = assertPathWithinRoots(filePath, [root1, root2])
      expect(result).toContain('.copilot')
    })
  })

  describe('getMemoryAllowedRoots', () => {
    it('includes .claude, .copilot, .github directories', () => {
      const roots = getMemoryAllowedRoots()
      const home = homedir()
      expect(roots).toContain(resolve(home, '.claude'))
      expect(roots).toContain(resolve(home, '.copilot'))
      expect(roots).toContain(resolve(home, '.github'))
    })

    it('includes the provided working directory', () => {
      const wd = '/Users/test/my-project'
      const roots = getMemoryAllowedRoots(wd)
      expect(roots).toContain(resolve(wd))
    })

    it('always includes process.cwd()', () => {
      const roots = getMemoryAllowedRoots()
      expect(roots).toContain(resolve(process.cwd()))
    })
  })

  describe('isSensitiveSystemPath', () => {
    it('detects .ssh as sensitive', () => {
      expect(isSensitiveSystemPath(resolve(homedir(), '.ssh'))).toBe(true)
    })

    it('detects .ssh subdirectories as sensitive', () => {
      expect(
        isSensitiveSystemPath(resolve(homedir(), '.ssh', 'id_rsa')),
      ).toBe(true)
    })

    it('detects .aws as sensitive', () => {
      expect(isSensitiveSystemPath(resolve(homedir(), '.aws'))).toBe(true)
    })

    it('detects /etc as sensitive', () => {
      expect(isSensitiveSystemPath('/etc/passwd')).toBe(true)
    })

    it('does not flag normal project directories', () => {
      expect(
        isSensitiveSystemPath(resolve(homedir(), 'projects', 'my-app')),
      ).toBe(false)
    })

    it('does not flag home directory itself', () => {
      expect(isSensitiveSystemPath(homedir())).toBe(false)
    })
  })
})
