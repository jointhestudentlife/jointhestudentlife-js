export declare const DEFAULT_BASE_URL: string;
export declare const VERSION: string;

export type EventType = 'all' | 'halloween' | 'welcome_festival' | 'semester_kickoff' | 'orientation_week';

export interface CityCard {
  slug: string;
  name: string;
  country: string;
  country_code: string;
  summary: string;
  festival_name: string;
  city_guide_url: string;
  festival_url: string;
  halloween_url: string | null;
}

export interface CityList {
  total: number;
  cities: CityCard[];
  next_cursor: string | null;
  note?: string;
}

export interface CityGuide extends CityCard {
  about: string;
  highlights: { title: string; text: string }[];
  facts: { label: string; value: string }[];
  things_to_know: { topic: string; text: string }[];
  monthly_costs: { label: string; value: string }[];
  everyday_prices: { label: string; value: string }[];
  housing: { intro: string; tips: unknown[] } | null;
  universities: { name: string; url: string }[];
  places: { kind: string; name: string }[];
  upcoming_events: StudentEvent[];
}

export interface TicketOption {
  name: string;
  price: number;
  currency: string;
}

export interface StudentEvent {
  id: string;
  type: Exclude<EventType, 'all'>;
  name: string;
  city: string;
  city_slug: string | null;
  start: string;
  end: string | null;
  timezone: string | null;
  venue: { name: string; address: string | null } | null;
  description: string;
  age_min: number | null;
  url: string;
  image: string | null;
  status: 'upcoming' | 'past';
  tickets: {
    status: 'on_sale' | 'opens_soon' | 'coming_soon' | 'see_page' | 'ended';
    sales_open_at: string | null;
    options: TicketOption[];
    early_access: { price: number; currency: string; opens: string | null; ends: string; open_now: boolean; note: string } | null;
    buy_url: string;
    note: string;
  };
  waitlist_open: boolean;
  whatsapp_group: string | null;
  entry_rule: string | null;
}

export interface EventList {
  total: number;
  events: StudentEvent[];
  next_cursor: string | null;
  note?: string;
}

export interface Partner {
  slug: string;
  name: string;
  category: string;
  kind: string;
  description: string;
  best_for: string;
  deal: string;
  code: string | null;
  links: { label: string; url: string }[];
  website: string | null;
  page: string;
}

export interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export declare class TheStudentLifeError extends Error {
  constructor(message: string, info?: { status?: number; code?: string; body?: unknown });
  status?: number;
  code?: string;
  body?: unknown;
}

export declare class TheStudentLife {
  constructor(options?: ClientOptions);
  baseUrl: string;
  fetch: typeof fetch;
  maxRetries: number;
  timeoutMs: number;
  userAgent: string;
  request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  info(): Promise<Record<string, unknown>>;
  cities(params?: { q?: string; country?: string; limit?: number; cursor?: string }): Promise<CityList>;
  city(slug: string): Promise<CityGuide>;
  events(params?: { city?: string; type?: EventType; upcoming?: boolean; limit?: number; cursor?: string }): Promise<EventList>;
  event(id: string): Promise<StudentEvent>;
  partners(params?: { category?: string; q?: string }): Promise<{ total: number; partners: Partner[]; page: string; note: string }>;
  pricing(params?: { city?: string }): Promise<Record<string, unknown>>;
  eachCity(params?: { q?: string; country?: string; limit?: number }): AsyncGenerator<CityCard>;
  eachEvent(params?: { city?: string; type?: EventType; upcoming?: boolean; limit?: number }): AsyncGenerator<StudentEvent>;
  sendMessage(
    msg: { name: string; email: string; message: string; subject?: string; city?: string; dryRun?: boolean },
    options?: { idempotencyKey?: string }
  ): Promise<{ success: boolean; dry_run?: boolean; message?: string }>;
}

export default TheStudentLife;
