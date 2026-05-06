import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import { currentMonthBRT, todayBRT } from "../utils/date";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ProductSalePayload = {
  productId?: string | null;
  clientId?: string | null;
  appointmentId?: string | null;
  quantity?: unknown;
  unitPrice?: unknown;
  discount?: unknown;
  saleDate?: string | null;
  notes?: string | null;
};

export class ProductSaleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const PRODUCT_SALE_SELECT = `
  id,
  business_id,
  product_id,
  client_id,
  appointment_id,
  quantity,
  unit_price,
  unit_cost,
  discount,
  sale_date,
  notes,
  created_at,
  products(id, name, category),
  clients(id, name, phone)
`;

function toSafeNumber(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizePositiveNumber(value: unknown, label: string) {
  const numericValue = toSafeNumber(value);
  if (numericValue <= 0) {
    throw new ProductSaleError(`${label} deve ser maior que zero.`);
  }
  return numericValue;
}

function normalizeNonNegativeNumber(value: unknown, label: string) {
  const numericValue = toSafeNumber(value);
  if (numericValue < 0) {
    throw new ProductSaleError(`${label} deve ser maior ou igual a zero.`);
  }
  return numericValue;
}

function normalizeOptionalDate(value: string | null | undefined) {
  if (!value) return todayBRT();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ProductSaleError("Data da venda deve estar no formato YYYY-MM-DD.");
  }
  return value;
}

function getMonthRange(month = currentMonthBRT()) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ProductSaleError("Mes invalido. Use o formato YYYY-MM.");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function mapProductSale(row: any) {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const quantity = toSafeNumber(row.quantity);
  const unitPrice = toSafeNumber(row.unit_price);
  const unitCost = toSafeNumber(row.unit_cost);
  const discount = toSafeNumber(row.discount);
  const revenue = quantity * unitPrice - discount;
  const cost = quantity * unitCost;

  return {
    id: row.id,
    business_id: row.business_id,
    product_id: row.product_id,
    client_id: row.client_id,
    appointment_id: row.appointment_id,
    quantity,
    unit_price: unitPrice,
    unit_cost: unitCost,
    discount,
    sale_date: row.sale_date,
    notes: row.notes ?? null,
    created_at: row.created_at,
    product: product
      ? {
          id: product.id,
          name: product.name,
          category: product.category ?? null,
        }
      : null,
    client: client
      ? {
          id: client.id,
          name: client.name,
          phone: client.phone,
        }
      : null,
    revenue,
    cost,
    gross_profit: revenue - cost,
  };
}

async function assertClientBelongsToBusiness(businessId: string, clientId?: string | null) {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new ProductSaleError(error.message, 500);
  if (!data) throw new ProductSaleError("Cliente nao encontrado para este negocio.");
  return clientId;
}

async function assertAppointmentBelongsToBusiness(
  businessId: string,
  appointmentId?: string | null
) {
  if (!appointmentId) return null;
  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("id", appointmentId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new ProductSaleError(error.message, 500);
  if (!data) throw new ProductSaleError("Atendimento nao encontrado para este negocio.");
  return appointmentId;
}

async function getActiveProductForSale(businessId: string, productId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, business_id, name, cost_price, sale_price, stock_quantity, active")
    .eq("id", productId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw new ProductSaleError(error.message, 500);
  if (!data) throw new ProductSaleError("Produto nao encontrado.");
  if (data.active === false) throw new ProductSaleError("Produto inativo nao pode ser vendido.");
  return {
    ...data,
    cost_price: toSafeNumber(data.cost_price),
    sale_price: toSafeNumber(data.sale_price),
    stock_quantity: toSafeNumber(data.stock_quantity),
  };
}

async function decrementStockWithRetry(
  businessId: string,
  productId: string,
  quantity: number
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const product = await getActiveProductForSale(businessId, productId);
    if (product.stock_quantity < quantity) {
      throw new ProductSaleError("Estoque insuficiente para esta venda.", 409);
    }

    const nextStock = product.stock_quantity - quantity;
    const { data, error } = await supabase
      .from("products")
      .update({ stock_quantity: nextStock })
      .eq("id", productId)
      .eq("business_id", businessId)
      .eq("stock_quantity", product.stock_quantity)
      .eq("active", true)
      .select("id, stock_quantity")
      .maybeSingle();

    if (error) throw new ProductSaleError(error.message, 500);
    if (data) {
      return {
        product,
        nextStock: toSafeNumber(data.stock_quantity),
      };
    }
  }

  throw new ProductSaleError("Nao foi possivel atualizar o estoque. Tente novamente.", 409);
}

async function restoreStock(productId: string, businessId: string, quantity: number) {
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (productError || !product) {
    throw new ProductSaleError(
      productError?.message ?? "Nao foi possivel reverter o estoque.",
      500
    );
  }

  const { error } = await supabase
    .from("products")
    .update({ stock_quantity: toSafeNumber(product.stock_quantity) + quantity })
    .eq("id", productId)
    .eq("business_id", businessId);

  if (error) throw new ProductSaleError(error.message, 500);
}

export async function getProductSales(businessId: string, month?: string) {
  const range = getMonthRange(month);
  const { data, error } = await supabase
    .from("product_sales")
    .select(PRODUCT_SALE_SELECT)
    .eq("business_id", businessId)
    .gte("sale_date", range.start)
    .lte("sale_date", range.end)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new ProductSaleError(error.message, 500);
  return (data ?? []).map(mapProductSale);
}

export async function createProductSale(businessId: string, payload: ProductSalePayload) {
  if (!payload.productId) throw new ProductSaleError("productId obrigatorio.");

  const quantity = normalizePositiveNumber(payload.quantity, "Quantidade");
  const discount = normalizeNonNegativeNumber(payload.discount, "Desconto");
  const saleDate = normalizeOptionalDate(payload.saleDate);
  const clientId = await assertClientBelongsToBusiness(businessId, payload.clientId);
  const appointmentId = await assertAppointmentBelongsToBusiness(
    businessId,
    payload.appointmentId
  );
  const { product } = await decrementStockWithRetry(businessId, payload.productId, quantity);
  const unitPrice =
    payload.unitPrice === undefined || payload.unitPrice === null || payload.unitPrice === ""
      ? product.sale_price
      : normalizeNonNegativeNumber(payload.unitPrice, "Preco unitario");
  const unitCost = product.cost_price;

  const salePayload = {
    business_id: businessId,
    product_id: payload.productId,
    client_id: clientId,
    appointment_id: appointmentId,
    quantity,
    unit_price: unitPrice,
    unit_cost: unitCost,
    discount,
    sale_date: saleDate,
    notes: payload.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from("product_sales")
    .insert(salePayload)
    .select(PRODUCT_SALE_SELECT)
    .single();

  if (error) {
    await restoreStock(payload.productId, businessId, quantity);
    throw new ProductSaleError(error.message, 500);
  }

  return mapProductSale(data);
}
