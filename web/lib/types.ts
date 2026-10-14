export type Poi = {
  id: string;
  name: string;
  slug: string;
  poi_category: string | null;
  frequency_count: number;
  recommendation_score: number;
  specialities: string[] | null;
  verification_status: string;
  areas: { name: string } | null;
  destinations: { slug: string } | null;
};
