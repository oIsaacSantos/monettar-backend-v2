"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProducts = getProducts;
exports.createProduct = createProduct;
exports.updateProduct = updateProduct;
exports.deactivateProduct = deactivateProduct;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRODUCT_SELECT = "id, business_id, name, category, cost_price, sale_price, stock_quantity, active, created_at, updated_at";
function toSafeNumber(value) {
    const numericValue = Number(value ?? 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
}
function normalizeNonNegativeNumber(value, label) {
    const numericValue = toSafeNumber(value);
    if (numericValue < 0) {
        throw new Error(`${label} deve ser maior ou igual a zero.`);
    }
    return numericValue;
}
function mapProduct(row) {
    return {
        ...row,
        cost_price: toSafeNumber(row.cost_price),
        sale_price: toSafeNumber(row.sale_price),
        stock_quantity: toSafeNumber(row.stock_quantity),
        active: row.active !== false,
    };
}
function validateCreateProduct(payload) {
    const name = payload.name?.trim();
    if (!name)
        throw new Error("Nome do produto e obrigatorio.");
    return {
        name,
        category: payload.category?.trim() || null,
        cost_price: normalizeNonNegativeNumber(payload.cost_price, "Custo"),
        sale_price: normalizeNonNegativeNumber(payload.sale_price, "Preco de venda"),
        stock_quantity: normalizeNonNegativeNumber(payload.stock_quantity, "Estoque"),
        active: payload.active ?? true,
    };
}
function buildUpdatePayload(payload) {
    const updatePayload = {};
    if (payload.name !== undefined) {
        const name = payload.name?.trim();
        if (!name)
            throw new Error("Nome do produto e obrigatorio.");
        updatePayload.name = name;
    }
    if (payload.category !== undefined) {
        updatePayload.category = payload.category?.trim() || null;
    }
    if (payload.cost_price !== undefined) {
        updatePayload.cost_price = normalizeNonNegativeNumber(payload.cost_price, "Custo");
    }
    if (payload.sale_price !== undefined) {
        updatePayload.sale_price = normalizeNonNegativeNumber(payload.sale_price, "Preco de venda");
    }
    if (payload.stock_quantity !== undefined) {
        updatePayload.stock_quantity = normalizeNonNegativeNumber(payload.stock_quantity, "Estoque");
    }
    if (payload.active !== undefined) {
        updatePayload.active = payload.active ?? true;
    }
    return updatePayload;
}
async function getProducts(businessId, includeInactive = false) {
    let query = supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("business_id", businessId)
        .order("name", { ascending: true });
    if (!includeInactive) {
        query = query.eq("active", true);
    }
    const { data, error } = await query;
    if (error)
        throw new Error(error.message);
    return (data ?? []).map(mapProduct);
}
async function createProduct(businessId, payload) {
    const validated = validateCreateProduct(payload);
    const { data, error } = await supabase
        .from("products")
        .insert({
        business_id: businessId,
        ...validated,
    })
        .select(PRODUCT_SELECT)
        .single();
    if (error)
        throw new Error(error.message);
    return mapProduct(data);
}
async function updateProduct(id, businessId, payload) {
    const updatePayload = buildUpdatePayload(payload);
    if (Object.keys(updatePayload).length === 0) {
        throw new Error("Nenhum campo para atualizar.");
    }
    const { data, error } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", id)
        .eq("business_id", businessId)
        .select(PRODUCT_SELECT)
        .single();
    if (error)
        throw new Error(error.message);
    return mapProduct(data);
}
async function deactivateProduct(id, businessId) {
    const { data, error } = await supabase
        .from("products")
        .update({ active: false })
        .eq("id", id)
        .eq("business_id", businessId)
        .select(PRODUCT_SELECT)
        .single();
    if (error)
        throw new Error(error.message);
    return mapProduct(data);
}
