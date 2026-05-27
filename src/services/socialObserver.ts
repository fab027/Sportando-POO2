import type { NewsItem, NewsSource } from "./newsObserver";

export type SocialObserverResult = {
  items: NewsItem[];
  warning?: string;
};

export const fetchSocialNews = async (_source: NewsSource): Promise<SocialObserverResult> => ({
  items: [],
  warning:
    "Fontes sociais exigem integracao com APIs oficiais. O observer nao faz scraping de Instagram, X/Twitter, TikTok ou Facebook.",
});

