import type { LaunchableApp } from './FocusGuardUsage.types';

export type { LaunchableApp };

export interface FocusGuardUsageNative {
  hasUsageAccess(): Promise<boolean>;
  openUsageAccessSettings(): Promise<void>;
  getForegroundPackage(): Promise<string | null>;
  getLaunchableApps(): Promise<LaunchableApp[]>;
  startBeastGuard(packages: string[], endsAtMs: number): Promise<void>;
  stopBeastGuard(): Promise<void>;
  consumeBeastBlock(): Promise<string | null>;
}

export function isBeastGuardAvailable(): boolean {
  return false;
}

export function hasUsageAccess(): Promise<boolean> {
  return Promise.resolve(false);
}

export function openUsageAccessSettings(): Promise<void> {
  return Promise.resolve();
}

export function getForegroundPackage(): Promise<string | null> {
  return Promise.resolve(null);
}

export function getLaunchableApps(): Promise<LaunchableApp[]> {
  return Promise.resolve([]);
}

export function startBeastGuard(_packages: string[], _endsAtMs: number): Promise<void> {
  return Promise.resolve();
}

export function stopBeastGuard(): Promise<void> {
  return Promise.resolve();
}

export function consumeBeastBlock(): Promise<string | null> {
  return Promise.resolve(null);
}
