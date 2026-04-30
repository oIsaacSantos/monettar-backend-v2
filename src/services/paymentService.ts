import { MercadoPagoConfig, Payment } from "mercadopago";

export function getMPClient(accessToken: string) {
  return new MercadoPagoConfig({ accessToken });
}

export async function createPixPayment(params: {
  accessToken: string;
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  externalReference: string;
}) {
  const client = getMPClient(params.accessToken);
  const payment = new Payment(client);

  const result = await payment.create({
    body: {
      transaction_amount: params.amount,
      description: params.description,
      payment_method_id: "pix",
      external_reference: params.externalReference,
      payer: {
        email: params.payerEmail,
        first_name: params.payerName,
      },
    },
  });

  return {
    paymentId: result.id,
    status: result.status,
    qrCode: result.point_of_interaction?.transaction_data?.qr_code,
    qrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
    ticketUrl: result.point_of_interaction?.transaction_data?.ticket_url,
  };
}

export async function getPaymentStatus(accessToken: string, paymentId: string) {
  const client = getMPClient(accessToken);
  const payment = new Payment(client);
  const result = await payment.get({ id: paymentId });
  return result.status;
}

export async function getPaymentDetails(accessToken: string, paymentId: string) {
  const client = getMPClient(accessToken);
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}
