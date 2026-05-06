import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ClientPayload = {
  name?: string | null;
  phone?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  birth_date?: string | null;
  birthdate?: string | null;
  first_appointment_override?: string | null;
  firstAppointmentOverride?: string | null;
  notes?: string | null;
};

const ALLOWED_GENDERS = new Set(["female", "male", "other", "not_informed"]);

function normalizePhone(phone: string) {
  return String(phone).replace(/\D/g, "");
}

function normalizeGender(gender: string | null | undefined) {
  if (gender === undefined) return undefined;
  if (gender === null || gender.trim() === "") return null;
  if (!ALLOWED_GENDERS.has(gender)) {
    throw new Error("Gênero inválido.");
  }
  return gender;
}

function normalizeOptionalDate(value: string | null | undefined, fieldLabel: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldLabel} deve estar no formato YYYY-MM-DD.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldLabel} inválida.`);
  }

  return value;
}

function resolveFirstAppointmentOverride(payload: ClientPayload) {
  return payload.first_appointment_override !== undefined
    ? payload.first_appointment_override
    : payload.firstAppointmentOverride;
}

export async function findActiveClientByPhone(businessId: string, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const last8 = normalized.slice(-8);
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, phone, gender, birth_date, notes")
    .eq("business_id", businessId)
    .ilike("phone", `%${last8}%`)
    .is("deleted_at", null)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function getClientsWithStats(businessId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select(`
      id,
      name,
      phone,
      gender,
      birth_date,
      first_appointment_override,
      notes,
      appointments(id, appointment_date, charged_amount, discount, payment_status, services(name), appointment_services(service_id, services(name)))
    `)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((c: any) => {
    const appts = Array.isArray(c.appointments) ? c.appointments : [];
    const activeAppointments = appts.filter(
      (a: any) => a.payment_status !== "cancelled" && a.payment_status !== "no_show"
    );
    const sortedActive = [...activeAppointments].sort((a: any, b: any) =>
      a.appointment_date.localeCompare(b.appointment_date)
    );
    const sortedAll = [...appts].sort((a: any, b: any) =>
      a.appointment_date.localeCompare(b.appointment_date)
    );
    const firstAppointmentCalculated = sortedActive[0]?.appointment_date ?? null;
    const firstAppointmentOverride = c.first_appointment_override ?? null;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      gender: c.gender ?? null,
      birthDate: c.birth_date ?? null,
      notes: c.notes ?? null,
      totalAppointments: activeAppointments.length,
      firstAppointment: firstAppointmentOverride ?? firstAppointmentCalculated,
      firstAppointmentCalculated,
      firstAppointmentOverride,
      lastAppointment: sortedActive[sortedActive.length - 1]?.appointment_date ?? null,
      appointments: sortedAll.map((a: any) => ({
        id: a.id,
        date: a.appointment_date,
        service: (a.appointment_services ?? []).length > 0
          ? (a.appointment_services ?? [])
              .map((row: any) =>
                Array.isArray(row.services) ? row.services[0]?.name : row.services?.name
              )
              .filter(Boolean)
              .join(" + ")
          : (Array.isArray(a.services)
              ? (a.services[0]?.name ?? "Serviço não informado")
              : (a.services?.name ?? "Serviço não informado")),
        value: Number(a.charged_amount ?? 0) - Number(a.discount ?? 0),
        status: a.payment_status,
      })),
    };
  });
}

export async function createClient(
  businessId: string,
  payload: {
    name: string;
    phone: string;
    gender?: string | null;
    birthDate?: string | null;
    first_appointment_override?: string | null;
    firstAppointmentOverride?: string | null;
  }
) {
  const normalizedPhone = normalizePhone(payload.phone);
  if (!normalizedPhone) {
    throw new Error("Telefone inválido");
  }
  const normalizedGender = normalizeGender(payload.gender);
  const firstAppointmentOverride = normalizeOptionalDate(
    resolveFirstAppointmentOverride(payload),
    "Primeiro atendimento"
  );

  const existingClient = await findActiveClientByPhone(businessId, normalizedPhone);
  if (existingClient) {
    return existingClient;
  }

  const basePayload = {
    business_id: businessId,
    name: payload.name,
    phone: normalizedPhone,
  };

  const insertAttempts = [
    {
      ...basePayload,
      gender: normalizedGender ?? null,
      birth_date: payload.birthDate ?? null,
      first_appointment_override: firstAppointmentOverride ?? null,
    },
    basePayload,
  ];

  let lastError: string | null = null;

  for (const attempt of insertAttempts) {
    const { data, error } = await supabase
      .from("clients")
      .insert(attempt)
      .select()
      .single();

    if (!error) return data;
    lastError = error.message;
  }

  throw new Error(lastError ?? "Erro ao criar cliente");
}

export async function updateClient(
  businessId: string,
  clientId: string,
  payload: ClientPayload
) {
  const normalizedPhone = payload.phone !== undefined ? normalizePhone(payload.phone ?? "") : undefined;
  if (payload.phone !== undefined && !normalizedPhone) {
    throw new Error("Telefone inválido");
  }

  if (normalizedPhone) {
    const { data: conflict, error: conflictError } = await supabase
      .from("clients")
      .select("id")
      .eq("business_id", businessId)
      .ilike("phone", `%${normalizedPhone.slice(-8)}%`)
      .is("deleted_at", null)
      .neq("id", clientId)
      .maybeSingle();

    if (conflictError) throw new Error(conflictError.message);
    if (conflict) {
      throw new Error("Telefone já está em uso por outro cliente.");
    }
  }

  const updatePayload: any = {};
  if (payload.name !== undefined) updatePayload.name = payload.name;
  if (normalizedPhone !== undefined) updatePayload.phone = normalizedPhone;
  const gender = normalizeGender(payload.gender);
  if (gender !== undefined) updatePayload.gender = gender;
  const birthDateValue = payload.birthDate ?? payload.birth_date ?? payload.birthdate;
  if (birthDateValue !== undefined) {
    updatePayload.birth_date = birthDateValue;
  }
  const firstAppointmentOverride = normalizeOptionalDate(
    resolveFirstAppointmentOverride(payload),
    "Primeiro atendimento"
  );
  if (firstAppointmentOverride !== undefined) {
    updatePayload.first_appointment_override = firstAppointmentOverride;
  }
  if (payload.notes !== undefined) updatePayload.notes = payload.notes;

  if (Object.keys(updatePayload).length === 0) {
    throw new Error("Nenhum campo para atualizar.");
  }

  const { data, error } = await supabase
    .from("clients")
    .update(updatePayload)
    .eq("id", clientId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function softDeleteClient(businessId: string, clientId: string) {
  const { data, error } = await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Cliente não encontrado ou já excluído.");
  return { success: true };
}
