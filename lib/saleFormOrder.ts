const STORAGE_KEY = "clerkbid:saleFieldOrder";

/** Dispatched on same window after prefs write (and storage from other tabs fires storage). */
export const SALE_FIELD_ORDER_CHANGED = "clerkbid:saleFieldOrder";

export const ALL_SALE_FIELD_IDS = [
  "lot",
  "price",
  "paddle",
  "quantity",
  "description",
  "notes",
  "consignor",
  "initials",
] as const;

export type SaleFieldId = (typeof ALL_SALE_FIELD_IDS)[number];

export type SaleFormPrefs = {
  order: SaleFieldId[];
  required: Record<SaleFieldId, boolean>;
};

/** Short inputs that may share a row (sm:grid-cols-2) when consecutive in tab order. */
const NARROW_SALE_FIELD_IDS = new Set<SaleFieldId>([
  "lot",
  "price",
  "paddle",
  "quantity",
  "consignor",
  "initials",
]);

export function isNarrowSaleField(id: SaleFieldId): boolean {
  return NARROW_SALE_FIELD_IDS.has(id);
}

export const DEFAULT_SALE_FIELD_ORDER: SaleFieldId[] = [
  ...ALL_SALE_FIELD_IDS,
];

/** Matches pre-requirements clerking validation defaults. Buyer code always required for recording a sale. */
export const DEFAULT_SALE_FIELD_REQUIRED: Record<SaleFieldId, boolean> = {
  lot: true,
  price: true,
  paddle: true,
  quantity: true,
  description: true,
  notes: false,
  consignor: false,
  initials: true,
};

const LABELS: Record<SaleFieldId, string> = {
  lot: "Item number",
  price: "Sale price per unit",
  paddle: "Buyer code",
  quantity: "Quantity",
  description: "Item description / title",
  notes: "Item notes / ring",
  consignor: "Consignor",
  initials: "Seller initials",
};

export function saleFieldLabel(id: SaleFieldId): string {
  return LABELS[id];
}

export function isValidSaleFieldOrder(
  value: unknown
): value is SaleFieldId[] {
  if (!Array.isArray(value) || value.length !== ALL_SALE_FIELD_IDS.length) {
    return false;
  }
  const set = new Set<string>(ALL_SALE_FIELD_IDS);
  const seen = new Set<string>();
  for (const x of value) {
    if (typeof x !== "string" || !set.has(x) || seen.has(x)) return false;
    seen.add(x);
  }
  return seen.size === ALL_SALE_FIELD_IDS.length;
}

export function normalizeSaleFieldOrder(raw: unknown): SaleFieldId[] {
  if (!isValidSaleFieldOrder(raw)) return [...DEFAULT_SALE_FIELD_ORDER];
  return [...raw];
}

export function defaultSaleFormPrefs(): SaleFormPrefs {
  return {
    order: [...DEFAULT_SALE_FIELD_ORDER],
    required: { ...DEFAULT_SALE_FIELD_REQUIRED },
  };
}

/** Stable reference for useSyncExternalStore getServerSnapshot. */
export const SERVER_DEFAULT_SALE_FORM_PREFS: SaleFormPrefs = {
  order: [...DEFAULT_SALE_FIELD_ORDER],
  required: { ...DEFAULT_SALE_FIELD_REQUIRED },
};

function defaultPrefs(): SaleFormPrefs {
  return defaultSaleFormPrefs();
}

/**
 * At least one of lot or description must be required for invoicing / reporting.
 */
export function enforceLotDescriptionInvariant(
  r: Record<SaleFieldId, boolean>
): void {
  if (!r.lot && !r.description) {
    r.description = true;
  }
}

/** Buyer code is always required to attach a sale to a buyer. */
function enforcePaddleRequired(r: Record<SaleFieldId, boolean>): void {
  r.paddle = true;
}

export function normalizeSaleFieldRequired(raw: unknown): Record<
  SaleFieldId,
  boolean
> {
  const out: Record<SaleFieldId, boolean> = { ...DEFAULT_SALE_FIELD_REQUIRED };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const id of ALL_SALE_FIELD_IDS) {
      const v = o[id];
      if (typeof v === "boolean") out[id] = v;
    }
  }
  enforcePaddleRequired(out);
  enforceLotDescriptionInvariant(out);
  return out;
}

/**
 * After toggling `field` to `value`, enforce lot/description and paddle rules.
 */
export function coerceRequiredAfterToggle(
  field: SaleFieldId,
  value: boolean,
  current: Record<SaleFieldId, boolean>
): Record<SaleFieldId, boolean> {
  const next: Record<SaleFieldId, boolean> = { ...current, [field]: value };
  next.paddle = true;
  if (field === "lot" && !value) {
    next.description = true;
  }
  if (field === "description" && !value) {
    next.lot = true;
  }
  enforceLotDescriptionInvariant(next);
  return next;
}

function isPrefsObject(
  raw: unknown
): raw is { order: unknown; required?: unknown } {
  return (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "order" in raw
  );
}

export function normalizeSaleFormPrefs(raw: unknown): SaleFormPrefs {
  if (isValidSaleFieldOrder(raw)) {
    return {
      order: [...raw],
      required: { ...DEFAULT_SALE_FIELD_REQUIRED },
    };
  }
  if (isPrefsObject(raw)) {
    const order = normalizeSaleFieldOrder(raw.order);
    const required = normalizeSaleFieldRequired(raw.required);
    return { order, required };
  }
  return defaultPrefs();
}

/**
 * Cached snapshot for useSyncExternalStore: same object reference until storage changes.
 */
let clientPrefsSnapshot: SaleFormPrefs = defaultPrefs();
let clientStorageDigest: string | null = null;

function readPrefsFromStorageString(raw: string | null): SaleFormPrefs {
  if (raw === null) return defaultPrefs();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSaleFormPrefs(parsed);
  } catch {
    return defaultPrefs();
  }
}

export function readSaleFormPrefs(): SaleFormPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const digest = raw === null ? "__null__" : raw;
    if (digest === clientStorageDigest) return clientPrefsSnapshot;
    clientStorageDigest = digest;
    const parsed = readPrefsFromStorageString(raw);
    clientPrefsSnapshot = {
      order: parsed.order,
      required: { ...parsed.required },
    };
    return clientPrefsSnapshot;
  } catch {
    clientStorageDigest = "__error__";
    clientPrefsSnapshot = defaultPrefs();
    return clientPrefsSnapshot;
  }
}

export function writeSaleFormPrefs(prefs: SaleFormPrefs): void {
  const normalized: SaleFormPrefs = {
    order: normalizeSaleFieldOrder(prefs.order),
    required: normalizeSaleFieldRequired(prefs.required),
  };
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(normalized);
    localStorage.setItem(STORAGE_KEY, json);
    clientStorageDigest = json;
    clientPrefsSnapshot = {
      order: normalized.order,
      required: { ...normalized.required },
    };
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SALE_FIELD_ORDER_CHANGED));
}

export function readSaleFieldOrder(): SaleFieldId[] {
  return readSaleFormPrefs().order;
}

export function writeSaleFieldOrder(order: SaleFieldId[]): void {
  const cur = readSaleFormPrefs();
  writeSaleFormPrefs({ ...cur, order: normalizeSaleFieldOrder(order) });
}

export function tabOrderHelpFragment(order: SaleFieldId[]): string {
  return order.map((id) => saleFieldLabel(id)).join(" → ");
}
