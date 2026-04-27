"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMPClient = getMPClient;
exports.createPixPayment = createPixPayment;
exports.getPaymentStatus = getPaymentStatus;
const mercadopago_1 = require("mercadopago");
function getMPClient(accessToken) {
    return new mercadopago_1.MercadoPagoConfig({ accessToken });
}
async function createPixPayment(params) {
    const client = getMPClient(params.accessToken);
    const payment = new mercadopago_1.Payment(client);
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
async function getPaymentStatus(accessToken, paymentId) {
    const client = getMPClient(accessToken);
    const payment = new mercadopago_1.Payment(client);
    const result = await payment.get({ id: paymentId });
    return result.status;
}
