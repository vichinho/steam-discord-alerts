import type { Game } from '../types.ts';
export function sortReleases(a: Game, b: Game): number { return b.releaseDate!.localeCompare(a.releaseDate!) || a.appId - b.appId; }
export function releaseKey(destination: string, country: string, appId: number): string { return `release:${destination}:${country}:${appId}`; }
