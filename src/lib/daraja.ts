type DarajaEnvironment = "sandbox" | "production";
type DarajaTransactionType =
  | "CustomerPayBillOnline"
  | "CustomerBuyGoodsOnline";

type DarajaSettings = {
  environment: DarajaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  transactionType: DarajaTransactionType;
  callbackUrl: string;
};

type DarajaTokenResponse = {
  access_token?: string;
};

type StkPushResponse = {
  ResponseCode?: string | number;
  ResponseDescription?: string;
  CheckoutRequestID?: string;
  MerchantRequestID?: string;
  CustomerMessage?: string;
};

export type StkPushQueryResponse = {
  ResponseCode?: string | number;
  ResponseDescription?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string | number;
  ResultDesc?: string;
};

function getSettings(): DarajaSettings {
  const environment = process.env.DARAJA_ENV ?? "sandbox";
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const shortcode = process.env.DARAJA_SHORTCODE;
  const passkey = process.env.DARAJA_PASSKEY;
  const transactionType =
    process.env.DARAJA_TRANSACTION_TYPE ?? "CustomerPayBillOnline";
  const callback = process.env.DARAJA_CALLBACK_URL;

  if (
    (environment !== "sandbox" && environment !== "production") ||
    !consumerKey ||
    !consumerSecret ||
    !shortcode ||
    !/^\d+$/.test(shortcode) ||
    !passkey ||
    (transactionType !== "CustomerPayBillOnline" &&
      transactionType !== "CustomerBuyGoodsOnline") ||
    !callback
  ) {
    throw new Error("Daraja M-Pesa credentials and callback URL are not fully configured.");
  }

  const callbackUrl = new URL(callback);
  if (
    callbackUrl.protocol !== "https:" ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.hostname === "localhost" ||
    callbackUrl.hostname === "127.0.0.1" ||
    callbackUrl.hostname.endsWith(".localhost")
  ) {
    throw new Error("DARAJA_CALLBACK_URL must be a public HTTPS URL.");
  }

  return {
    environment,
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    transactionType,
    callbackUrl: callbackUrl.toString(),
  };
}

export function isDarajaConfigured() {
  const environment = process.env.DARAJA_ENV ?? "sandbox";
  const transactionType =
    process.env.DARAJA_TRANSACTION_TYPE ?? "CustomerPayBillOnline";
  const callbackUrl = process.env.DARAJA_CALLBACK_URL;
  return Boolean(
    (environment === "sandbox" || environment === "production") &&
      (transactionType === "CustomerPayBillOnline" ||
        transactionType === "CustomerBuyGoodsOnline") &&
      process.env.DARAJA_CONSUMER_KEY &&
      process.env.DARAJA_CONSUMER_SECRET &&
      process.env.DARAJA_SHORTCODE &&
      /^\d+$/.test(process.env.DARAJA_SHORTCODE) &&
      process.env.DARAJA_PASSKEY &&
      callbackUrl?.startsWith("https://") &&
      !/localhost|127\.0\.0\.1/i.test(callbackUrl) &&
      !(
        process.env.NODE_ENV === "production" &&
        environment === "sandbox"
      ),
  );
}

function getApiBaseUrl(environment: DarajaEnvironment) {
  return environment === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";
}

function getTimestamp() {
  const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate(),
  )}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
    date.getUTCSeconds(),
  )}`;
}

async function getAccessToken(settings: DarajaSettings) {
  const credentials = Buffer.from(
    `${settings.consumerKey}:${settings.consumerSecret}`,
  ).toString("base64");
  const response = await fetch(
    `${getApiBaseUrl(settings.environment)}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = (await response.json()) as DarajaTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(`Daraja token request failed (${response.status}).`);
  }
  return result.access_token;
}

function getPassword(settings: DarajaSettings, timestamp: string) {
  return Buffer.from(
    `${settings.shortcode}${settings.passkey}${timestamp}`,
  ).toString("base64");
}

export function normalizeKenyanPhoneNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    throw new Error("Enter the M-Pesa phone number to charge.");
  }

  const digits = value.replace(/[\s()+-]/g, "");
  const phoneNumber = digits.startsWith("0")
    ? `254${digits.slice(1)}`
    : digits.startsWith("7") || digits.startsWith("1")
      ? `254${digits}`
      : digits;
  if (!/^254(?:7|1)\d{8}$/.test(phoneNumber)) {
    throw new Error("Enter a valid Kenyan mobile number, such as 0712345678.");
  }
  return phoneNumber;
}

export async function initiateStkPush(input: {
  phoneNumber: string;
  amount: number;
  accountReference: string;
}) {
  const settings = getSettings();
  if (
    process.env.NODE_ENV === "production" &&
    settings.environment === "sandbox"
  ) {
    throw new Error("Daraja sandbox payments are disabled in production.");
  }
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new Error("The M-Pesa amount must be a positive whole number of KES.");
  }

  const timestamp = getTimestamp();
  const accessToken = await getAccessToken(settings);
  const response = await fetch(
    `${getApiBaseUrl(settings.environment)}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: settings.shortcode,
        Password: getPassword(settings, timestamp),
        Timestamp: timestamp,
        TransactionType: settings.transactionType,
        Amount: input.amount,
        PartyA: input.phoneNumber,
        PartyB: settings.shortcode,
        PhoneNumber: input.phoneNumber,
        CallBackURL: settings.callbackUrl,
        AccountReference: input.accountReference,
        TransactionDesc: "CartonLab Premium",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = (await response.json()) as StkPushResponse;
  if (
    !response.ok ||
    String(result.ResponseCode) !== "0" ||
    !result.CheckoutRequestID ||
    !result.MerchantRequestID
  ) {
    throw new Error(
      result.ResponseDescription ??
        `Daraja STK Push request failed (${response.status}).`,
    );
  }
  return {
    checkoutRequestId: result.CheckoutRequestID,
    merchantRequestId: result.MerchantRequestID,
    customerMessage: result.CustomerMessage,
  };
}

export async function queryStkPush(input: {
  checkoutRequestId: string;
}): Promise<StkPushQueryResponse> {
  const settings = getSettings();
  if (
    process.env.NODE_ENV === "production" &&
    settings.environment === "sandbox"
  ) {
    throw new Error("Daraja sandbox verification is disabled in production.");
  }

  const timestamp = getTimestamp();
  const accessToken = await getAccessToken(settings);
  const response = await fetch(
    `${getApiBaseUrl(settings.environment)}/mpesa/stkpushquery/v1/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: settings.shortcode,
        Password: getPassword(settings, timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: input.checkoutRequestId,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = (await response.json()) as StkPushQueryResponse;
  if (!response.ok) {
    throw new Error(`Daraja STK Push query failed (${response.status}).`);
  }
  return result;
}
