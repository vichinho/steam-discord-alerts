export type Kind = 'deal' | 'release';
export interface Game {
  appId: number; title: string; storeUrl: string; imageUrl: string | null;
  productType: 'game' | 'dlc' | 'demo' | 'software' | 'music' | 'unknown';
  genres: string[] | null; earlyAccess: boolean | null;
  country: string; currency: string | null; amountScale: number;
  originalAmount: number | null; currentAmount: number | null; discountPercent: number | null;
  releaseDate: string | null; releasePrecision: 'day' | 'month' | 'year' | 'unknown';
  comingSoon: boolean | null; availableInRegion: boolean | null;
  observedAt: number; source: string; sourceUrl: string; promotionEndsAt: number | null;
}
export interface Cursor { offset: number; pending: number[]; end: boolean }
export interface Discovery { ids: number[]; cursor: Cursor; completedCycle: boolean; discovered: number }
export interface Provider {
  discover(kind: Kind, cursor: Cursor, limit: number): Promise<Discovery>;
  detail(appId: number): Promise<Game>;
}
export type RustItemSourceKind = 'rust_official_store' | 'skinport_market';
export interface RustItem {
  sourceKind: RustItemSourceKind; itemId: string; marketHashName: string | null;
  title: string; category: string | null; itemUrl: string; imageUrl: string | null;
  country: string; currency: string | null; amountScale: number;
  currentAmount: number | null; referenceAmount: number | null; dropPercent: number | null;
  listings: number | null; firstSeenAt: number | null; observedAt: number; sourceUrl: string;
  newItem: boolean;
}
export interface RustItemDiscovery { ids: string[]; cursor: string | null; completedCycle: boolean; discovered: number }
export interface RustItemProvider {
  readonly sourceKind: RustItemSourceKind;
  discover(cursor: string | null, limit: number): Promise<RustItemDiscovery>;
  detail(itemId: string): Promise<RustItem>;
}
export interface DealState {
  appId: number; country: string; period: number; active: boolean;
  lastAmount: number | null; lastNotifiedAt: number | null;
  lastCurrency: string | null; lastScale: number | null;
}
export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'retry' | 'uncertain' | 'expired' | 'failed';
export interface DiscordPayload {
  content?: string;
  embeds?: {
    title: string; description: string; url?: string; color?: number;
    image?: { url: string }; thumbnail?: { url: string };
    footer?: { text: string };
  }[];
  allowed_mentions: { parse: never[] };
}
export interface Delivery {
  key: string; kind: Kind; destination: string; country: string; day: string;
  appId: number | null; period: number | null; amount: number | null;
  currency: string | null; scale: number | null;
  payload: DiscordPayload | null; games: Game[];
  status: DeliveryStatus; attempts: number; createdAt: number; nextAttemptAt: number;
  expiresAt: number; messageId: string | null; error: string | null; configKey: string;
}
export interface Job {
  configKey: string; dealCursor: Cursor; releaseCursor: Cursor;
  dealBaseline: boolean; releaseBaseline: boolean; dealDigestDay: string | null;
  releaseNextAt: number; digestDay: string | null;
  sourceFailures: number; sourcePaused: boolean; sourceNextAt: number;
  lastSourceSuccess: number | null; deliveryPaused: boolean; discordNextAt: number;
  watchAfter: number;
}
export interface RunStats {
  id: string; at: number; status: string; discovered: number; eligible: number;
  omitted: Record<string, number>; pending: number; sent: number; failed: number;
  source: string; lastSourceSuccess: number | null; durationMs: number;
  requests: number; rowsRead: number; rowsWritten: number; responseBytes: number;
}
