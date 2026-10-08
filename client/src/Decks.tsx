import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { TradingCard, type Awoken } from "./App";

/** A Tender's decks: multiple named collections, each with a face card. */
export function DecksView({ items }: { items: Awoken[] }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const decksQuery = useQuery({ queryKey: ["decks"], queryFn: () => api.listDecks() });
  const createDeck = useMutation({
    mutationFn: (name: string) => api.createDeck({ name }),
    onSuccess: () => { setNewName(""); queryClient.invalidateQueries({ queryKey: ["decks"] }); },
  });
  const deleteDeck = useMutation({
    mutationFn: (id: number) => api.deleteDeck({ id }),
    onSuccess: () => { setSelectedId(null); queryClient.invalidateQueries({ queryKey: ["decks"] }); },
  });
  if (selectedId) {
    return <DeckDetail deckId={selectedId} allItems={items} onBack={() => { setSelectedId(null); queryClient.invalidateQueries({ queryKey: ["decks"] }); }} onDelete={() => deleteDeck.mutate(selectedId)} />;
  }
  const decks = decksQuery.data?.decks ?? [];
  return <section className="decks-view">
    <header><p className="eyebrow">Your decks</p><h1>Gather them as you will.</h1>
      <p className="quiet">Each deck is a gathering — for battle, for keeping, for whatever you intend. Choose a face card from among its members.</p></header>
    <form className="deck-create" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createDeck.mutate(newName.trim()); }}>
      <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name a new deck…" maxLength={60} aria-label="New deck name" />
      <button disabled={!newName.trim() || createDeck.isPending}>{createDeck.isPending ? "Gathering…" : "Create deck"}</button>
    </form>
    {!decks.length && !decksQuery.isPending ? <p className="quiet">No decks yet. Name one above, then fill it with your Awoken.</p> : null}
    <div className="deck-list">
      {decks.map((deck) => {
        const face = deck.faceCardId ? items.find((i) => i.id === deck.faceCardId) : null;
        return <button key={deck.id} className="deck-card" onClick={() => setSelectedId(deck.id)}>
          {face ? <img src={face.image_url} alt={`${deck.name} face card`} className="deck-face" /> : <div className="deck-face empty">No face chosen</div>}
          <div className="deck-meta"><strong>{deck.name}</strong><span>{deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}</span></div>
        </button>;
      })}
    </div>
  </section>;
}

function DeckDetail({ deckId, allItems, onBack, onDelete }: { deckId: number; allItems: Awoken[]; onBack: () => void; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const deckQuery = useQuery({ queryKey: ["deck", deckId], queryFn: () => api.getDeckCards({ deckId }) });
  const addCard = useMutation({
    mutationFn: (awakenedId: number) => api.addCardToDeck({ deckId, awakenedId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["deck", deckId] }); },
  });
  const removeCard = useMutation({
    mutationFn: (awakenedId: number) => api.removeCardFromDeck({ deckId, awakenedId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["deck", deckId] }); queryClient.invalidateQueries({ queryKey: ["decks"] }); },
  });
  const setFace = useMutation({
    mutationFn: (awakenedId: number) => api.setDeckFace({ deckId, awakenedId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["deck", deckId] }); queryClient.invalidateQueries({ queryKey: ["decks"] }); },
  });
  const cardIds = deckQuery.data?.cardIds ?? [];
  const deck = deckQuery.data?.deck;
  const inDeck = allItems.filter((i) => cardIds.includes(i.id));
  const notInDeck = allItems.filter((i) => !cardIds.includes(i.id));
  return <section className="deck-detail">
    <header>
      <button onClick={onBack} className="quiet-link">← All decks</button>
      <h1>{deck?.name ?? "Deck"}</h1>
      <button onClick={onDelete} className="quiet-link danger">Unmake this deck</button>
    </header>
    {!inDeck.length ? <p className="quiet">Empty. Add cards from your collection below.</p> : (
      <div className="collection-grid trading">
        {inDeck.map((item) => (
          <div key={item.id} className="deck-member">
            <TradingCard item={item} />
            <div className="deck-member-actions">
              {deck?.faceCardId === item.id
                ? <span className="face-badge">Face card</span>
                : <button onClick={() => setFace.mutate(item.id)} className="quiet-link">Make face</button>}
              <button onClick={() => removeCard.mutate(item.id)} className="quiet-link">Remove</button>
            </div>
          </div>
        ))}
      </div>
    )}
    <div className="deck-add">
      <button onClick={() => setAdding((v) => !v)}>{adding ? "Done adding" : `Add cards (${notInDeck.length} available)`}</button>
      {adding && (
        <div className="collection-grid trading small">
          {notInDeck.map((item) => (
            <div key={item.id} className="deck-add-card">
              <TradingCard item={item} />
              <button onClick={() => addCard.mutate(item.id)}>Add to deck</button>
            </div>
          ))}
        </div>
      )}
    </div>
  </section>;
}
