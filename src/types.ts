export interface Deal {
  store_name: string;
  price: number;
  original_price?: number;
  deal_url: string;
  shipping?: string;
  availability?: string;
  tag?: string;
}

export interface Specification {
  key: string;
  value: string;
}

export interface ScannedData {
  product_name: string;
  brand?: string;
  description?: string;
  lowest_price: number;
  average_price: number;
  price_range?: string;
  currency?: string;
  market_verdict?: string;
  analysis_rationale?: string;
  deals: Deal[];
  pros?: string[];
  cons?: string[];
  specifications?: Specification[];
  error?: string;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface ScanResponse {
  scanned_data: ScannedData;
  sources: GroundingSource[];
}

export interface SavedSearch {
  id: string;
  query: string;
  product_name: string;
  lowest_price: number;
  currency: string;
  scannedAt: string;
  deal_url: string;
  store_name: string;
}

export interface PriceAlert {
  id: string;
  product_query: string;
  target_price: number;
  currency: string;
  active: boolean;
  createdAt: string;
  triggered: boolean;
  lastCheckedAt?: string;
  latestScannedPrice?: number;
  storeMatched?: string;
  dealUrl?: string;
}

export interface SystemNotification {
  id: string;
  alertId: string;
  title: string;
  message: string;
  productName: string;
  targetPrice: number;
  scannedPrice: number;
  storeName: string;
  dealUrl: string;
  createdAt: string;
  read: boolean;
}

