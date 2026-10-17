import { useQuery } from "@tanstack/react-query";
import { api, type CardBorderFitName } from "./api";

// The chosen card border (Nigel, 2026-10-17): one public read, cached
// and shared by every card surface — TradingCard in the game, the hand
// cards at the Table (which fetch the same action directly), and the
// workshop's Card Border section (which invalidates this query on any
// change, so every card re-frames at once).
export function useCardBorder(): { imageUrl: string | null; fit: CardBorderFitName | null } {
  const { data } = useQuery({
    queryKey: ["cardBorder"],
    queryFn: () => api.getCardBorder(),
    staleTime: 60_000,
  });
  return { imageUrl: data?.imageUrl ?? null, fit: data?.fit ?? null };
}
