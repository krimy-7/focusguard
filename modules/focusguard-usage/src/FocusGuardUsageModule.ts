import { requireNativeModule } from 'expo';

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

function resolveNative(): FocusGuardUsageNative | null {
  try {
    return requireNativeModule('FocusGuardUsage') as FocusGuardUsageNative;
  } catch {
    return null;
  }
}

const native: FocusGuardUsageNative | null = resolveNative();

export function isBeastGuardAvailable(): boolean {
  return native !== null;
}

export function hasUsageAccess(): Promise<boolean> {
  return native ? native.hasUsageAccess() : Promise.resolve(false);
}

export function openUsageAccessSettings(): Promise<void> {
  return native ? native.openUsageAccessSettings() : Promise.resolve();
}

export function getForegroundPackage(): Promise<string | null> {
  return native ? native.getForegroundPackage() : Promise.resolve(null);
}

export function getLaunchableApps(): Promise<LaunchableApp[]> {
  return native ? native.getLaunchableApps() : Promise.resolve([]);
}

export function startBeastGuard(packages: string[], endsAtMs: number): Promise<void> {
  return native ? native.startBeastGuard(packages, endsAtMs) : Promise.resolve();
}

export function stopBeastGuard(): Promise<void> {
  return native ? native.stopBeastGuard() : Promise.resolve();
}

export function consumeBeastBlock(): Promise<string | null> {
  return native ? native.consumeBeastBlock() : Promise.resolve(null);
}
