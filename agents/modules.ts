export interface ModuleToolHandle {
  enable(): void
  disable(): void
  remove(): void
}

export interface ModuleToolLifecycle {
  add(moduleId: string, handle: ModuleToolHandle): void
  setEnabled(moduleId: string, enabled: boolean): void
  isEnabled(moduleId: string): boolean
  remove(moduleId: string): void
}

export function createModuleToolLifecycle(): ModuleToolLifecycle {
  const enabled = new Map<string, boolean>()
  const handles = new Map<string, Set<ModuleToolHandle>>()

  return {
    add(moduleId, handle) {
      const group = handles.get(moduleId) ?? new Set<ModuleToolHandle>()
      group.add(handle)
      handles.set(moduleId, group)
      if (enabled.get(moduleId) === true) handle.enable()
      else handle.disable()
    },

    setEnabled(moduleId, state) {
      enabled.set(moduleId, state)
      for (const handle of handles.get(moduleId) ?? []) {
        if (state) handle.enable()
        else handle.disable()
      }
    },

    isEnabled(moduleId) {
      return enabled.get(moduleId) ?? false
    },

    remove(moduleId) {
      for (const handle of handles.get(moduleId) ?? []) handle.remove()
      handles.delete(moduleId)
      enabled.delete(moduleId)
    },
  }
}
