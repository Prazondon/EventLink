import type {
  ApiMessage,
  AuthResponse,
  BusinessAccount,
  BusinessDashboardData,
  BusinessProfile,
  Category,
  CustomerDashboardData,
  PortfolioImage,
  PublicBusiness,
  Recommendation,
  Review,
  ReviewCollection,
  SavedBusiness,
  Service,
  User,
  VerificationRequest,
} from "./types";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);

export const UNAUTHORIZED_EVENT = "eventlink:unauthorized";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      `Can't reach EventLink right now. Check that the backend is running at ${API_URL}.`,
    );
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = (await response.json()) as {
        detail?: string | { msg?: string }[];
      };
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) {
        message = body.detail.map((issue) => issue.msg).filter(Boolean).join(" ");
      }
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    // An expired or revoked token makes every signed-in request fail; tell the
    // auth layer so it can clear the session instead of showing raw errors.
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: jsonBody({ email, password }),
    }),

  registerCustomer: (email: string, password: string, full_name: string) =>
    request<User>("/auth/register/customer", {
      method: "POST",
      body: jsonBody({ email, password, full_name }),
    }),

  registerBusiness: (
    email: string,
    password: string,
    business_name: string,
    location_city: string,
    location_country: string,
  ) =>
    request<User>("/auth/register/business", {
      method: "POST",
      body: jsonBody({
        email,
        password,
        business_name,
        location_city: location_city || null,
        location_country: location_country || null,
      }),
    }),

  me: (token: string) => request<User>("/auth/me", {}, token),
  logout: (token: string) =>
    request<ApiMessage>("/auth/logout", { method: "POST" }, token),
  requestPasswordReset: (email: string) =>
    request<ApiMessage>("/auth/password-reset/request", {
      method: "POST",
      body: jsonBody({ email }),
    }),
  resetPassword: (reset_token: string, new_password: string) =>
    request<ApiMessage>("/auth/password-reset/confirm", {
      method: "POST",
      body: jsonBody({ reset_token, new_password }),
    }),

  categories: () => request<Category[]>("/categories"),
  businesses: (params: URLSearchParams) =>
    request<PublicBusiness[]>(`/businesses?${params.toString()}`),
  business: (id: string) => request<PublicBusiness>(`/businesses/${id}`),
  reviews: (id: string) =>
    request<ReviewCollection>(`/businesses/${id}/reviews`),
  createReview: (id: string, rating: number, comment_text: string, token: string) =>
    request<Review>(
      `/businesses/${id}/reviews`,
      { method: "POST", body: jsonBody({ rating, comment_text: comment_text || null }) },
      token,
    ),

  customerDashboard: (token: string) =>
    request<CustomerDashboardData>("/customers/me/dashboard", {}, token),
  customerProfile: (token: string) =>
    request<{ full_name: string; preferences: Record<string, unknown> | null; user_id: string }>(
      "/customers/me/profile",
      {},
      token,
    ),
  updateCustomerProfile: (
    data: { full_name?: string; preferences?: Record<string, unknown> },
    token: string,
  ) =>
    request("/customers/me/profile", { method: "PATCH", body: jsonBody(data) }, token),
  savedBusinesses: (token: string) =>
    request<SavedBusiness[]>("/customers/me/saved-businesses", {}, token),
  recommendations: (token: string) =>
    request<Recommendation[]>("/customers/me/recommendations", {}, token),
  saveBusiness: (id: string, token: string) =>
    request<void>(`/customers/me/saved-businesses/${id}`, { method: "PUT" }, token),
  unsaveBusiness: (id: string, token: string) =>
    request<void>(
      `/customers/me/saved-businesses/${id}`,
      { method: "DELETE" },
      token,
    ),
  contactBusiness: (id: string, token: string) =>
    request(
      `/businesses/${id}/interactions`,
      {
        method: "POST",
        body: jsonBody({ interaction_type: "contact", consent_flag: true }),
      },
      token,
    ),
  recordView: (id: string, token: string) =>
    request(
      `/businesses/${id}/interactions`,
      {
        method: "POST",
        body: jsonBody({ interaction_type: "view", consent_flag: true }),
      },
      token,
    ),

  businessDashboard: (token: string) =>
    request<BusinessDashboardData>("/business/me/dashboard", {}, token),
  businessAccount: (token: string) =>
    request<BusinessAccount>("/business/me/account", {}, token),
  updateBusinessAccount: (
    data: Partial<Pick<BusinessAccount, "business_name" | "contact_phone" | "contact_email" | "location_city" | "location_country">>,
    token: string,
  ) =>
    request<BusinessAccount>(
      "/business/me/account",
      { method: "PATCH", body: jsonBody(data) },
      token,
    ),
  businessProfile: (token: string) =>
    request<BusinessProfile>("/business/me/profile", {}, token),
  createBusinessProfile: (
    description: string,
    category_ids: string[],
    token: string,
  ) =>
    request<BusinessProfile>(
      "/business/me/profile",
      { method: "POST", body: jsonBody({ description, category_ids }) },
      token,
    ),
  updateBusinessProfile: (
    data: Partial<Pick<BusinessProfile, "description" | "is_published">> & {
      category_ids?: string[];
    },
    token: string,
  ) =>
    request<BusinessProfile>(
      "/business/me/profile",
      { method: "PATCH", body: jsonBody(data) },
      token,
    ),
  createService: (
    data: { name: string; description: string; price: string; currency: string },
    token: string,
  ) =>
    request<Service>(
      "/business/me/profile/services",
      { method: "POST", body: jsonBody({ ...data, price: data.price || null }) },
      token,
    ),
  deleteService: (id: string, token: string) =>
    request<void>(
      `/business/me/profile/services/${id}`,
      { method: "DELETE" },
      token,
    ),
  createPortfolioImage: (
    image_url: string,
    caption: string,
    token: string,
  ) =>
    request<PortfolioImage>(
      "/business/me/profile/portfolio",
      { method: "POST", body: jsonBody({ image_url, caption }) },
      token,
    ),
  deletePortfolioImage: (id: string, token: string) =>
    request<void>(
      `/business/me/profile/portfolio/${id}`,
      { method: "DELETE" },
      token,
    ),
  requestVerification: (decision_reason: string, token: string) =>
    request<ApiMessage>(
      "/business/me/verification",
      { method: "POST", body: jsonBody({ decision_reason }) },
      token,
    ),

  verificationQueue: (token: string) =>
    request<VerificationRequest[]>("/admin/verifications", {}, token),
  decideVerification: (
    record_id: string,
    status: "approved" | "rejected",
    decision_reason: string,
    token: string,
  ) =>
    request<ApiMessage>(
      `/admin/verifications/${record_id}/decision`,
      { method: "POST", body: jsonBody({ status, decision_reason }) },
      token,
    ),
  createCategory: (name: string, description: string, token: string) =>
    request<Category>(
      "/admin/categories",
      { method: "POST", body: jsonBody({ name, description }) },
      token,
    ),
  deleteCategory: (id: string, token: string) =>
    request<ApiMessage>(`/admin/categories/${id}`, { method: "DELETE" }, token),
};
