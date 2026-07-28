import type {
  InvoicePatchBody,
  InvoicePutBody,
  SaleDeleteBody,
  SalePutBody,
} from "@/lib/sync/ops/types";
import { isPaymentMethod } from "@/lib/utils/constants";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

export function parseSalePutBody(body: unknown): SalePutBody | null {
  if (!isRecord(body)) return null;
  const saleSyncKey = body.saleSyncKey;
  const displayLotNumber = body.displayLotNumber;
  const paddleNumber = body.paddleNumber;
  const description = body.description;
  const quantity = body.quantity;
  const amount = body.amount;
  const clerkInitials = body.clerkInitials;
  const createdAt = body.createdAt;
  if (
    typeof saleSyncKey !== "string" ||
    typeof displayLotNumber !== "string" ||
    typeof paddleNumber !== "number" ||
    !Number.isFinite(paddleNumber) ||
    typeof description !== "string" ||
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    typeof clerkInitials !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  const consignor =
    typeof body.consignor === "string" ? body.consignor : undefined;
  let consignorNumber: number | null | undefined;
  if (body.consignorNumber === null) consignorNumber = null;
  else if (
    typeof body.consignorNumber === "number" &&
    Number.isFinite(body.consignorNumber)
  ) {
    consignorNumber = body.consignorNumber;
  }
  let invoiceSyncKey: string | null | undefined;
  if (body.invoiceSyncKey === null) invoiceSyncKey = null;
  else if (typeof body.invoiceSyncKey === "string")
    invoiceSyncKey = body.invoiceSyncKey;
  return {
    saleSyncKey,
    displayLotNumber,
    paddleNumber,
    description,
    consignor,
    consignorNumber,
    quantity,
    amount,
    clerkInitials,
    createdAt,
    invoiceSyncKey,
  };
}

export function parseSaleDeleteBody(body: unknown): SaleDeleteBody | null {
  if (!isRecord(body)) return null;
  if (typeof body.saleSyncKey !== "string") return null;
  return { saleSyncKey: body.saleSyncKey };
}

export function parseInvoicePutBody(body: unknown): InvoicePutBody | null {
  if (!isRecord(body)) return null;
  const invoiceSyncKey = body.invoiceSyncKey;
  const invoiceNumber = body.invoiceNumber;
  const paddleNumber = body.paddleNumber;
  const status = body.status;
  if (
    typeof invoiceSyncKey !== "string" ||
    typeof invoiceNumber !== "string" ||
    typeof paddleNumber !== "number" ||
    !Number.isFinite(paddleNumber) ||
    (status !== "paid" && status !== "unpaid")
  ) {
    return null;
  }
  for (const k of ["subtotal", "buyersPremiumAmount", "taxAmount", "total"] as const) {
    const v = body[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
  }
  const generatedAt = body.generatedAt;
  if (typeof generatedAt !== "string") return null;
  const pm = body.paymentMethod;
  // null/undefined → cleared; known string → accepted; anything else → reject
  if (pm != null && !isPaymentMethod(pm)) {
    return null;
  }
  let paymentDate: string | null | undefined;
  if (body.paymentDate === null) paymentDate = null;
  else if (typeof body.paymentDate === "string") paymentDate = body.paymentDate;

  let buyersPremiumRate: number | null | undefined;
  if (body.buyersPremiumRate === null) buyersPremiumRate = null;
  else if (
    typeof body.buyersPremiumRate === "number" &&
    Number.isFinite(body.buyersPremiumRate)
  ) {
    buyersPremiumRate = body.buyersPremiumRate;
  }
  let taxRate: number | null | undefined;
  if (body.taxRate === null) taxRate = null;
  else if (typeof body.taxRate === "number" && Number.isFinite(body.taxRate)) {
    taxRate = body.taxRate;
  }

  let manualLines: InvoicePutBody["manualLines"];
  if (body.manualLines != null) {
    if (!Array.isArray(body.manualLines)) return null;
    manualLines = [];
    for (const m of body.manualLines) {
      if (!isRecord(m)) return null;
      if (
        typeof m.id !== "string" ||
        typeof m.description !== "string" ||
        typeof m.amount !== "number"
      ) {
        return null;
      }
      manualLines.push({
        id: m.id,
        description: m.description,
        amount: m.amount,
      });
    }
  }

  return {
    invoiceSyncKey,
    invoiceNumber,
    paddleNumber,
    status,
    subtotal: body.subtotal as number,
    buyersPremiumAmount: body.buyersPremiumAmount as number,
    taxAmount: body.taxAmount as number,
    total: body.total as number,
    generatedAt,
    buyersPremiumRate,
    taxRate,
    manualLines,
    paymentMethod: isPaymentMethod(pm) ? pm : undefined,
    paymentDate,
  };
}

export function parseInvoicePatchBody(body: unknown): InvoicePatchBody | null {
  if (!isRecord(body)) return null;
  if (typeof body.invoiceSyncKey !== "string") return null;
  if (!isRecord(body.patch)) return null;
  return {
    invoiceSyncKey: body.invoiceSyncKey,
    patch: body.patch,
    recalculate: body.recalculate === true,
  };
}
