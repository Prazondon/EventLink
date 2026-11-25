export type UserRole = "customer" | "business" | "admin";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface Service {
  id: string;
  business_profile_id: string;
  name: string;
  description: string | null;
  price: string | null;
  currency: string;
}

export interface PortfolioImage {
  id: string;
  business_profile_id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
}

export interface Review {
  id: string;
  customer_id: string;
  business_id: string;
  rating: number;
  comment_text: string | null;
  created_at: string;
}

export interface BusinessAccount {
  id: string;
  user_id: string;
  business_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  location_city: string | null;
  location_country: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface BusinessProfile {
  id: string;
  business_account_id: string;
  description: string | null;
  verification_status: "pending" | "approved" | "rejected";
  is_published: boolean;
  categories: Category[];
  services: Service[];
  portfolio_images: PortfolioImage[];
}

export interface PublicBusiness {
  business: BusinessAccount;
  profile: BusinessProfile;
  average_rating: number;
  review_count: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  user_id: string;
}

export interface CustomerDashboardData {
  review_count: number;
  saved_business_count: number;
  interactions_30_days: number;
}

export interface BusinessDashboardData {
  business_id: string;
  review_count: number;
  average_rating: number;
  views_30_days: number;
  contacts_30_days: number;
  saves_30_days: number;
  verification_status: BusinessProfile["verification_status"] | null;
}

export interface ReviewCollection {
  items: Review[];
  average_rating: number;
  total: number;
}

export interface SavedBusiness {
  business: PublicBusiness;
  saved_at: string;
}

export interface Recommendation {
  business: PublicBusiness;
  score: number;
}

export interface VerificationRequest {
  record_id: string;
  business_id: string;
  business_name: string;
  contact_email: string | null;
  created_at: string;
}

export interface ApiMessage {
  message: string;
}
